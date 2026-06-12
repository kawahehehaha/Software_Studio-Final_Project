const { ccclass, property } = cc._decorator;
import Level3PlanetObstacle from "./Level3PlanetObstacle";

@ccclass
export default class Level3EnemyProjectile extends cc.Component {
    @property
    speed = 360;

    @property
    damage = 1;

    @property
    lifetime = 4;

    @property
    collisionRadius = 5;

    @property([cc.SpriteFrame])
    explosionFrames: cc.SpriteFrame[] = [];

    @property
    explosionFps = 10;

    @property
    explosionScale = 0.12;

    @property
    cameraShakeStrength = 8;

    @property
    cameraShakeDuration = 0.22;

    private velocity = cc.v2();
    private elapsed = 0;
    private launched = false;
    private exploding = false;
    private explosionElapsed = 0;
    private explosionFrameIndex = 0;
    private playerNode: cc.Node = null;

    onLoad() {
        cc.director.getCollisionManager().enabled = true;
        this.ensureCollider();
    }

    public launch(direction: cc.Vec2) {
        const normalized = direction && direction.magSqr() > 0.001
            ? direction.normalize()
            : cc.v2(0, -1);
        this.velocity = normalized.mul(this.speed);
        this.elapsed = 0;
        this.launched = true;
        this.node.active = true;
        this.node.angle = -cc.misc.radiansToDegrees(
            Math.atan2(normalized.x, normalized.y)
        );
    }

    update(dt: number) {
        if (this.exploding) {
            this.updateExplosion(dt);
            return;
        }

        if (!this.launched) return;

        this.elapsed += dt;
        if (this.elapsed >= this.lifetime) {
            this.node.destroy();
            return;
        }

        const previousWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        this.node.x += this.velocity.x * dt;
        this.node.y += this.velocity.y * dt;
        const currentWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);

        if (this.tryHitPlanet(previousWorld, currentWorld)) return;

        // 重新搜尋條件：節點失效，或快取的節點已變成遠端 ghost
        const cachedCtrl = this.playerNode
            ? (this.playerNode.getComponent('Level3SpaceshipController') as any)
            : null;
        if (!this.playerNode || !this.playerNode.isValid
                || (cachedCtrl && cachedCtrl._isRemote)) {
            this.playerNode = this.findLocalPlayer();
        }
        if (this.playerNode) {
            this.tryHitPlayer();
        }
    }

    /** 找最近的本地玩家（排除遠端 ghost），優先使用 NM.localPlayer */
    private findLocalPlayer(): cc.Node {
        const nm = (window as any).NM;
        if (nm && nm.localPlayer && nm.localPlayer.isValid) {
            return nm.localPlayer;
        }

        const scene = cc.director.getScene();
        if (!scene) return null;

        const myWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        let nearest: cc.Node = null;
        let minDist = Number.POSITIVE_INFINITY;

        const search = (n: cc.Node) => {
            if (!n || !n.isValid || !n.activeInHierarchy) return;
            const ctrl = n.getComponent('Level3SpaceshipController') as any;
            if (ctrl && ctrl.enabled && !ctrl._isRemote) {
                const pw = n.convertToWorldSpaceAR(cc.Vec2.ZERO);
                const d = myWorld.sub(pw).mag();
                if (d < minDist) { minDist = d; nearest = n; }
            }
            for (const child of n.children) search(child);
        };
        // 從 scene.children 開始（而非 scene 本身），避免 deprecated Scene.getComponent 警告
        for (const child of scene.children) search(child);
        return nearest;
    }

    private tryHitPlayer() {
        const myWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const playerWorld = this.playerNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const dx = myWorld.x - playerWorld.x;
        const dy = myWorld.y - playerWorld.y;

        const playerScale = Math.max(
            Math.abs(this.playerNode.scaleX),
            Math.abs(this.playerNode.scaleY)
        );
        const playerCol = this.playerNode.getComponent(cc.CircleCollider);
        const playerRadius = playerCol ? playerCol.radius * playerScale : 20;
        const hitDist = this.collisionRadius + playerRadius;

        if (dx * dx + dy * dy >= hitDist * hitDist) return;

        const comps = this.playerNode.getComponents(cc.Component);
        for (const comp of comps) {
            const receiver = comp as any;
            // 只對啟用的 controller 造成傷害（排除遠端 ghost）
            if (typeof receiver.takeDamage === "function" && receiver.enabled !== false) {
                receiver.takeDamage(this.damage, this.node);
                break;
            }
        }

        this.startExplosion();
    }

    onCollisionEnter(other: cc.Collider) {
        if (!this.launched || !other || !other.node) return;

        if (other.node.getComponent(Level3PlanetObstacle)) {
            this.startExplosion();
            return;
        }

        if (other.node.group !== "Player") return;

        // 排除遠端 ghost（CircleCollider 已被 NM 停用，但保險起見再檢查一次）
        const l3ctrl = other.node.getComponent('Level3SpaceshipController') as any;
        if (l3ctrl && l3ctrl._isRemote) return;

        const components = other.node.getComponents(cc.Component);
        for (const component of components) {
            const receiver = component as any;
            if (typeof receiver.takeDamage === "function") {
                receiver.takeDamage(this.damage, this.node);
                break;
            }
        }

        this.startExplosion();
    }

    private tryHitPlanet(start: cc.Vec2, end: cc.Vec2): boolean {
        let closestT = Number.POSITIVE_INFINITY;

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
            const obstacleScale = Math.max(
                Math.abs(obstacle.node.scaleX),
                Math.abs(obstacle.node.scaleY)
            );
            const projectileScale = Math.max(
                Math.abs(this.node.scaleX),
                Math.abs(this.node.scaleY)
            );
            const radius = obstacle.collisionRadius * obstacleScale
                + this.collisionRadius * projectileScale;
            const hitT = this.getSegmentCircleHitT(
                start,
                end,
                center,
                radius
            );

            if (hitT !== null && hitT < closestT) {
                closestT = hitT;
            }
        });

        if (!isFinite(closestT)) return false;

        const impactWorld = start.add(end.sub(start).mul(closestT));
        if (this.node.parent) {
            this.node.setPosition(
                this.node.parent.convertToNodeSpaceAR(impactWorld)
            );
        }
        this.startExplosion();
        return true;
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

    private startExplosion() {
        if (this.exploding) return;

        this.launched = false;
        this.exploding = true;
        this.explosionElapsed = 0;
        this.explosionFrameIndex = 0;
        this.velocity = cc.v2();
        cc.director.emit(
            "level3-camera-shake",
            this.cameraShakeStrength,
            this.cameraShakeDuration
        );

        const collider = this.getComponent(cc.CircleCollider);
        if (collider) collider.enabled = false;

        const sprite = this.getComponent(cc.Sprite);
        if (!sprite || this.explosionFrames.length === 0) {
            this.node.destroy();
            return;
        }

        this.node.angle = 0;
        this.node.scale = this.explosionScale;
        sprite.spriteFrame = this.explosionFrames[0];
    }

    private updateExplosion(dt: number) {
        const sprite = this.getComponent(cc.Sprite);
        if (!sprite || this.explosionFrames.length === 0) {
            this.node.destroy();
            return;
        }

        this.explosionElapsed += dt;
        const frameDuration = 1 / Math.max(1, this.explosionFps);

        while (this.explosionElapsed >= frameDuration) {
            this.explosionElapsed -= frameDuration;
            this.explosionFrameIndex += 1;

            if (this.explosionFrameIndex >= this.explosionFrames.length) {
                this.node.destroy();
                return;
            }

            sprite.spriteFrame = this.explosionFrames[
                this.explosionFrameIndex
            ];
        }
    }

    private ensureCollider() {
        let collider = this.getComponent(cc.CircleCollider);
        if (!collider) collider = this.node.addComponent(cc.CircleCollider);
        collider.radius = Math.max(1, this.collisionRadius);
        collider.enabled = true;
    }
}
