import Level3EnemyProjectile from "./Level3EnemyProjectile";
import Level3PlanetObstacle from "./Level3PlanetObstacle";
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass, property } = cc._decorator;

@ccclass
export default class Level3EnemyShip extends cc.Component {
    @property({
        tooltip: "0-3 overrides the enemy type used by the Level 3 kill HUD. -1 infers it from the node name."
    })
    enemyTypeIndex = -1;

    @property
    maxHealth = 4;

    @property
    moveSpeed = 120;

    @property
    attackRange = 520;

    @property
    preferredDistance = 240;

    @property
    minimumAheadY = 100;

    @property
    retreatTargetOffsetY = 240;

    @property
    retreatSpeedMultiplier = 1.5;

    @property
    retreatExitMarginY = 40;

    @property
    rotationSmoothness = 10;

    @property
    facingMovementDeadZone = 0.5;

    @property
    fireInterval = 1.5;

    @property
    contactDamage = 1;

    @property
    collisionRadius = 12;

    @property(cc.Prefab)
    projectilePrefab: cc.Prefab = null;

    @property(cc.Node)
    firePoint: cc.Node = null;

    /** 多人同步用：Host 生成時指派，用來識別同一隻敵人 */
    public spawnId: number = -1;
    /** 為 true 時跳過 kill 廣播（避免無限迴圈） */
    public _fromNetwork: boolean = false;

    private player: cc.Node = null;
    private health = 1;
    private fireTimer = 0;
    private playerSearchTimer = 0;
    private contactCooldown = 0;
    private lastPlayerPosition: cc.Vec2 = null;
    private retreating = false;
    private deathReported = false;

    onLoad() {
        cc.director.getCollisionManager().enabled = true;
        this.health = Math.max(1, this.maxHealth);
        this.ensureCollider();
    }

    start() {
        this.player = this.findNearestPlayer();
        this.fireTimer = Math.random() * Math.max(0.1, this.fireInterval);
    }

    update(dt: number) {
        this.contactCooldown = Math.max(0, this.contactCooldown - dt);

        if (!this.player || !this.player.isValid) {
            this.playerSearchTimer -= dt;
            if (this.playerSearchTimer <= 0) {
                this.playerSearchTimer = 0.5;
                this.player = this.findNearestPlayer();
            }
            this.lastPlayerPosition = null;
            return;
        }

        // 玩家控制器停用（死亡）或為遠端 ghost → 立即放棄並重新搜尋
        {
            const pc = this.player.getComponent('Level3SpaceshipController') as any;
            if (pc && (!pc.enabled || pc._isRemote)) {
                this.player = null;
                this.playerSearchTimer = 0;
                this.lastPlayerPosition = null;
                return;
            }
        }

        const playerWorld = this.player.convertToWorldSpaceAR(cc.Vec2.ZERO);

        // 同步玩家 Y 軸位移，確保敵人始終維持在玩家前方
        if (this.lastPlayerPosition) {
            const playerDeltaY = playerWorld.y - this.lastPlayerPosition.y;
            const currentWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
            this.moveWithPlanetCollision(
                cc.v2(currentWorld.x, currentWorld.y + playerDeltaY)
            );
        }
        this.lastPlayerPosition = playerWorld;

        // 移動目標：玩家上方 140 單位，讓玩家容易從下方瞄準
        const enemyWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const aheadY = enemyWorld.y - playerWorld.y;
        if (!this.retreating && aheadY < this.minimumAheadY) {
            this.retreating = true;
        } else if (
            this.retreating
            && aheadY >= this.minimumAheadY + this.retreatExitMarginY
        ) {
            this.retreating = false;
        }

        const targetWorld = this.retreating
            ? cc.v2(playerWorld.x, playerWorld.y + this.retreatTargetOffsetY)
            : cc.v2(playerWorld.x, playerWorld.y + 140);
        const toTarget = targetWorld.sub(enemyWorld);
        const distance = toTarget.mag();

        if (distance > 0.001) {
            const direction = toTarget.normalize();
            const distanceError = this.retreating
                ? distance
                : distance - this.preferredDistance;
            const moveDirection = (
                this.retreating || distanceError >= 0
            ) ? 1 : -1;
            const activeMoveSpeed = this.moveSpeed * (
                this.retreating ? this.retreatSpeedMultiplier : 1
            );
            const step = Math.min(
                Math.abs(distanceError),
                activeMoveSpeed * dt
            );
            const nextWorld = enemyWorld.add(
                direction.mul(step * moveDirection)
            );
            this.moveWithPlanetCollision(nextWorld);
            const resolvedWorld = this.node.convertToWorldSpaceAR(
                cc.Vec2.ZERO
            );
            this.updateFacing(resolvedWorld.sub(enemyWorld), dt);
        }

        this.fireTimer += dt;
        if (
            distance <= this.attackRange
            && this.fireTimer >= Math.max(0.1, this.fireInterval)
        ) {
            this.fireTimer = 0;
            // 子彈仍然瞄準玩家實際位置
            this.fireAt(playerWorld);
        }
    }

    public takeDamage(amount: number) {
        AudioBroadcast.playEffect('vanish');
        this.health -= Math.max(0, amount || 0);
        if (
            this.health <= 0
            && !this.deathReported
            && this.node.isValid
        ) {
            this.deathReported = true;
            cc.systemEvent.emit(
                "level3-enemy-killed",
                this.resolveEnemyTypeIndex()
            );
            this.node.destroy();
        }
    }

    private resolveEnemyTypeIndex(): number {
        if (this.enemyTypeIndex >= 0 && this.enemyTypeIndex <= 3) {
            return Math.floor(this.enemyTypeIndex);
        }

        const name = (this.node.name || "").toLowerCase();
        const knownTypes = ["0000", "0001", "0006", "0007"];
        for (let index = 0; index < knownTypes.length; index += 1) {
            if (name.indexOf(knownTypes[index]) >= 0) return index;
        }

        cc.warn(
            `[Level3EnemyShip] Unknown enemy type for ${this.node.name}; `
            + "counting it as type 1."
        );
        return 0;
    }

    onCollisionEnter(other: cc.Collider) {
        if (
            !other
            || !other.node
            || other.node.group !== "Player"
            || this.contactCooldown > 0
        ) {
            return;
        }

        this.contactCooldown = 0.75;
        this.damageNode(other.node, this.contactDamage);
    }

    private fireAt(playerWorld: cc.Vec2) {
        if (!this.projectilePrefab || !this.node.parent) return;
        AudioBroadcast.playEffect('shotting');
        const projectileNode = cc.instantiate(this.projectilePrefab);
        this.node.parent.addChild(projectileNode);

        const source = this.firePoint && this.firePoint.isValid
            ? this.firePoint
            : this.node;
        const sourceWorld = source.convertToWorldSpaceAR(cc.Vec2.ZERO);
        projectileNode.setPosition(
            this.node.parent.convertToNodeSpaceAR(sourceWorld)
        );

        const projectile = projectileNode.getComponent(
            Level3EnemyProjectile
        );
        if (!projectile) {
            projectileNode.destroy();
            return;
        }

        projectile.launch(playerWorld.sub(sourceWorld));
    }

    private ensureCollider() {
        let collider = this.getComponent(cc.CircleCollider);
        if (!collider) collider = this.node.addComponent(cc.CircleCollider);
        collider.radius = Math.max(1, this.collisionRadius);
        collider.enabled = true;
    }

    private setWorldPosition(worldPosition: cc.Vec2) {
        if (!this.node.parent) {
            this.node.setPosition(worldPosition);
            return;
        }
        this.node.setPosition(
            this.node.parent.convertToNodeSpaceAR(worldPosition)
        );
    }

    private updateFacing(movement: cc.Vec2, dt: number) {
        if (
            !movement
            || movement.magSqr() < (
                this.facingMovementDeadZone
                * this.facingMovementDeadZone
            )
        ) {
            return;
        }

        const targetAngle = -cc.misc.radiansToDegrees(
            Math.atan2(movement.x, movement.y)
        );
        let delta = targetAngle - this.node.angle;
        delta = ((delta + 180) % 360 + 360) % 360 - 180;
        const t = 1 - Math.exp(-this.rotationSmoothness * dt);
        this.node.angle += delta * t;
    }

    private moveWithPlanetCollision(targetWorld: cc.Vec2) {
        const start = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const movement = targetWorld.sub(start);
        let closestT = Number.POSITIVE_INFINITY;
        let hitNormal: cc.Vec2 = null;

        Level3PlanetObstacle.activeObstacles.forEach(obstacle => {
            if (
                !obstacle
                || !obstacle.node
                || !obstacle.node.isValid
                || !obstacle.node.activeInHierarchy
            ) {
                return;
            }

            const center = obstacle.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
            const combinedRadius = this.getWorldCollisionRadius()
                + this.getPlanetWorldRadius(obstacle);
            const hitT = this.getSegmentCircleHitT(
                start,
                targetWorld,
                center,
                combinedRadius
            );

            if (hitT === null || hitT >= closestT) return;

            const impact = start.add(movement.mul(hitT));
            let normal = impact.sub(center);
            if (normal.magSqr() <= 0.000001) {
                normal = movement.magSqr() > 0.000001
                    ? movement.normalize().neg()
                    : cc.v2(0, 1);
            } else {
                normal.normalizeSelf();
            }

            closestT = hitT;
            hitNormal = normal;
        });

        let resolvedWorld = targetWorld;
        if (hitNormal && isFinite(closestT)) {
            const contact = start.add(movement.mul(
                Math.max(0, closestT - 0.001)
            ));
            const remaining = targetWorld.sub(contact);
            const inwardAmount = Math.min(0, remaining.dot(hitNormal));
            const slide = remaining.sub(hitNormal.mul(inwardAmount));
            resolvedWorld = contact.add(slide);
        }

        this.setWorldPosition(this.resolvePlanetOverlaps(resolvedWorld));
    }

    private resolvePlanetOverlaps(worldPosition: cc.Vec2): cc.Vec2 {
        let resolved = worldPosition.clone();
        const enemyRadius = this.getWorldCollisionRadius();

        for (let iteration = 0; iteration < 2; iteration += 1) {
            Level3PlanetObstacle.activeObstacles.forEach(obstacle => {
                if (
                    !obstacle
                    || !obstacle.node
                    || !obstacle.node.isValid
                    || !obstacle.node.activeInHierarchy
                ) {
                    return;
                }

                const center = obstacle.node.convertToWorldSpaceAR(
                    cc.Vec2.ZERO
                );
                const minDistance = enemyRadius
                    + this.getPlanetWorldRadius(obstacle);
                let offset = resolved.sub(center);
                const distance = offset.mag();
                if (distance >= minDistance) return;

                if (distance <= 0.0001) offset = cc.v2(0, 1);
                else offset.divSelf(distance);
                resolved = center.add(offset.mul(minDistance + 0.5));
            });
        }

        return resolved;
    }

    private getWorldCollisionRadius(): number {
        return this.collisionRadius * Math.max(
            Math.abs(this.node.scaleX),
            Math.abs(this.node.scaleY)
        );
    }

    private getPlanetWorldRadius(
        obstacle: Level3PlanetObstacle
    ): number {
        return obstacle.collisionRadius * Math.max(
            Math.abs(obstacle.node.scaleX),
            Math.abs(obstacle.node.scaleY)
        );
    }

    private getSegmentCircleHitT(
        start: cc.Vec2,
        end: cc.Vec2,
        center: cc.Vec2,
        radius: number
    ): number | null {
        const segment = end.sub(start);
        const fromCenter = start.sub(center);
        const a = segment.magSqr();

        if (a <= 0.000001) {
            return fromCenter.magSqr() <= radius * radius ? 0 : null;
        }

        const b = 2 * fromCenter.dot(segment);
        const c = fromCenter.magSqr() - radius * radius;
        if (c <= 0) return 0;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const root = Math.sqrt(discriminant);
        const nearT = (-b - root) / (2 * a);
        const farT = (-b + root) / (2 * a);

        if (nearT >= 0 && nearT <= 1) return nearT;
        if (farT >= 0 && farT <= 1) return farT;
        return null;
    }

    private damageNode(target: cc.Node, amount: number) {
        const components = target.getComponents(cc.Component);
        for (const component of components) {
            const receiver = component as any;
            if (typeof receiver.takeDamage === "function") {
                receiver.takeDamage(amount, this.node);
                return;
            }
        }
    }

    /** 找距離最近且 controller 啟用的玩家（本地玩家），忽略遠端 ghost */
    private findNearestPlayer(): cc.Node {
        // 優先用 NM.localPlayer，避免遍歷整棵場景樹（與 deprecated Scene.getComponent 警告）
        const nm = (window as any).NM;
        if (nm && nm.localPlayer && nm.localPlayer.isValid) {
            const ctrl = nm.localPlayer.getComponent('Level3SpaceshipController') as any;
            if (ctrl && ctrl.enabled && !ctrl._isRemote) return nm.localPlayer;
        }

        const scene = cc.director.getScene();
        if (!scene) return null;

        const players: cc.Node[] = [];
        // 從 scene.children 開始（而非 scene 本身），避免 deprecated Scene.getComponent 警告
        for (const child of scene.children) {
            this.gatherLocalPlayers(child, players);
        }
        if (players.length === 0) return null;
        if (players.length === 1) return players[0];

        const myWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        let nearest: cc.Node = null;
        let minDist = Number.POSITIVE_INFINITY;
        for (const p of players) {
            if (!p.isValid || !p.activeInHierarchy) continue;
            const pw = p.convertToWorldSpaceAR(cc.Vec2.ZERO);
            const d = myWorld.sub(pw).mag();
            if (d < minDist) { minDist = d; nearest = p; }
        }
        return nearest;
    }

    private gatherLocalPlayers(node: cc.Node, out: cc.Node[]) {
        if (!node) return;
        const ctrl = node.getComponent('Level3SpaceshipController') as any;
        if (ctrl && ctrl.enabled && !ctrl._isRemote) {
            out.push(node);
            return;
        }
        for (const child of node.children) {
            this.gatherLocalPlayers(child, out);
        }
    }
}
