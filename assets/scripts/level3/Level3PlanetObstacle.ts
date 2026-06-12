/**
 * Collision behavior shared by procedurally spawned planet obstacles.
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class Level3PlanetObstacle extends cc.Component {
    public static activeObstacles = new Set<Level3PlanetObstacle>();

    @property
    collisionRadius = 50;

    @property
    damage = 1;

    @property
    collisionCooldown = 0.75;

    @property
    gravityStrength = 12;

    @property
    gravityRange = 140;

    private lastHitTime = -999;
    private player: cc.Node = null;

    onLoad() {
        let collider = this.getComponent(cc.CircleCollider);
        if (!collider) {
            collider = this.node.addComponent(cc.CircleCollider);
        }
        collider.radius = this.collisionRadius;
    }

    onEnable() {
        Level3PlanetObstacle.activeObstacles.add(this);
    }

    onDisable() {
        Level3PlanetObstacle.activeObstacles.delete(this);
    }

    onDestroy() {
        Level3PlanetObstacle.activeObstacles.delete(this);
    }

    update(dt: number) {
        if (!this.player || !this.player.isValid) {
            this.player = cc.find("Player");
        }
        if (!this.player) return;

        const planetWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const playerWorld = this.player.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const toPlanet = planetWorld.sub(playerWorld);
        const distance = toPlanet.mag();
        const scale = Math.max(
            Math.abs(this.node.scaleX),
            Math.abs(this.node.scaleY)
        );
        const attractionRange = (
            this.collisionRadius + this.gravityRange
        ) * scale;

        if (distance <= 0.001 || distance >= attractionRange) return;

        const falloff = 1 - distance / attractionRange;
        const acceleration = this.gravityStrength * scale * falloff;
        const components = this.player.getComponents(cc.Component);

        for (const component of components) {
            const receiver = component as any;
            if (typeof receiver.applyPlanetGravity === "function") {
                receiver.applyPlanetGravity(
                    toPlanet.normalize(),
                    acceleration,
                    dt
                );
                break;
            }
        }
    }

    onCollisionEnter(other: cc.Collider) {
        this.tryHitPlayer(other.node);
    }

    onCollisionStay(other: cc.Collider) {
        this.tryHitPlayer(other.node);
    }

    public resetForSpawn() {
        this.lastHitTime = -999;
        const collider = this.getComponent(cc.CircleCollider);
        if (collider) collider.enabled = true;
    }

    public resetForPool() {
        this.lastHitTime = -999;
        this.player = null;
        const collider = this.getComponent(cc.CircleCollider);
        if (collider) collider.enabled = false;
    }

    private tryHitPlayer(player: cc.Node) {
        if (!player || player.group !== "Player") return;

        const now = Date.now() / 1000;
        if (now - this.lastHitTime < this.collisionCooldown) return;
        this.lastHitTime = now;

        const components = player.getComponents(cc.Component);
        for (const component of components) {
            const receiver = component as any;
            if (typeof receiver.bounceFromObstacle === "function") {
                receiver.bounceFromObstacle(this.node, this.collisionRadius);
            }
            if (typeof receiver.takeDamage === "function") {
                receiver.takeDamage(this.damage, this.node);
            }
        }

        cc.director.emit("level3-player-hit-obstacle", this.damage, this.node);
    }
}
