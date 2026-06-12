/**
 * Runtime projectile used by the Level 3 player weapon.
 */
const { ccclass, property } = cc._decorator;
import { AudioBroadcast } from "../Audio/AudioEvent";

@ccclass
export default class Level3PlayerBullet extends cc.Component {
    @property
    speed = 720;

    @property
    lifetime = 2.5;

    @property
    damage = 1;

    private velocity = cc.v2(0, 720);
    private elapsed = 0;
    private frames: cc.SpriteFrame[] = [];
    private sprite: cc.Sprite = null;
    private frameIndex = 0;
    private frameElapsed = 0;
    private framesPerSecond = 14;
    private explosionFrames: cc.SpriteFrame[] = [];
    private explosionFramesPerSecond = 10;
    private explosionScale = 0.28;
    private explosionRadius = 150;
    private recycleCallback: (bullet: cc.Node) => void = null;
    private isActive = false;
    private isExploding = false;

    public configure(
        texture: cc.Texture2D,
        frameWidth: number,
        frameHeight: number,
        frameCount: number,
        framesPerSecond: number,
        explosionFrames: cc.SpriteFrame[],
        explosionFramesPerSecond: number,
        explosionScale: number,
        explosionRadius: number,
        recycleCallback: (bullet: cc.Node) => void
    ) {
        this.sprite = this.getComponent(cc.Sprite)
            || this.node.addComponent(cc.Sprite);
        this.framesPerSecond = framesPerSecond;
        this.explosionFrames = explosionFrames || [];
        this.explosionFramesPerSecond = explosionFramesPerSecond;
        this.explosionScale = explosionScale;
        this.explosionRadius = explosionRadius;
        this.recycleCallback = recycleCallback;
        this.node.setContentSize(frameWidth, frameHeight);
        this.frames.length = 0;

        const availableFrames = texture
            ? Math.floor(texture.width / frameWidth)
            : 0;
        const count = Math.min(frameCount, availableFrames);

        for (let index = 0; index < count; index++) {
            this.frames.push(new cc.SpriteFrame(
                texture,
                cc.rect(
                    index * frameWidth,
                    0,
                    frameWidth,
                    frameHeight
                )
            ));
        }

        if (this.frames.length > 0) {
            this.sprite.spriteFrame = this.frames[0];
        }
    }

    public launch(
        direction: cc.Vec2,
        speed: number,
        lifetime: number,
        damage: number
    ) {
        this.speed = speed;
        this.lifetime = lifetime;
        this.damage = damage;
        this.velocity = direction.normalize().mul(speed);
        this.elapsed = 0;
        this.frameIndex = 0;
        this.frameElapsed = 0;
        this.isActive = true;
        this.isExploding = false;

        const collider = this.getComponent(cc.BoxCollider);
        if (collider) collider.enabled = true;

        if (this.sprite && this.frames.length > 0) {
            this.sprite.spriteFrame = this.frames[0];
        }
    }

    public resetForPool() {
        this.isActive = false;
        this.elapsed = 0;
        this.frameIndex = 0;
        this.frameElapsed = 0;
        this.velocity = cc.v2();
        this.isExploding = false;
        this.node.stopAllActions();
    }

    update(dt: number) {
        if (!this.isActive) return;

        if (this.isExploding) {
            this.updateExplosion(dt);
            return;
        }

        this.elapsed += dt;
        if (this.elapsed >= this.lifetime) {
            this.recycle();
            return;
        }

        this.node.x += this.velocity.x * dt;
        this.node.y += this.velocity.y * dt;
        this.updateAnimation(dt);
    }

    onCollisionEnter(other: cc.Collider) {
        this.hitTarget(other.node);
    }

    onBeginContact(
        contact: cc.PhysicsContact,
        selfCollider: cc.PhysicsCollider,
        otherCollider: cc.PhysicsCollider
    ) {
        this.hitTarget(otherCollider.node);
    }

    private hitTarget(target: cc.Node) {
        if (
            !this.isActive
            || this.isExploding
            || !target
            || target.group === "Player"
            || target.name === "PlayerBullet"
            || this.isEnemyProjectile(target)
        ) {
            return;
        }

        this.startExplosion();
    }

    private isEnemyProjectile(node: cc.Node): boolean {
        let current = node;

        while (current) {
            if (current.getComponent("Level3EnemyProjectile")) {
                return true;
            }
            current = current.parent;
        }

        return false;
    }

    private startExplosion() {
        if (!this.isActive || this.isExploding) return;

        this.isExploding = true;
        this.velocity = cc.v2();
        this.frameIndex = 0;
        this.frameElapsed = 0;

        const collider = this.getComponent(cc.BoxCollider);
        if (collider) collider.enabled = false;

        this.damageEnemiesInRange();
        cc.director.emit("level3-camera-shake", 11, 0.26);

        if (!this.sprite || this.explosionFrames.length === 0) {
            this.recycle();
            return;
        }

        this.node.angle = 0;
        this.node.scale = this.explosionScale;
        this.sprite.spriteFrame = this.explosionFrames[0];
    }

    private damageEnemiesInRange() {
        const scene = cc.director.getScene();
        if (!scene) return;

        const explosionWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const enemies: cc.Node[] = [];
        this.findEnemies(scene, enemies);

        for (const enemy of enemies) {
            const enemyWorld = enemy.convertToWorldSpaceAR(cc.Vec2.ZERO);
            const controller = enemy.getComponent("Level3EnemyShip") as any;
            const enemyRadius = controller
                ? (controller.collisionRadius || 0) * Math.max(
                    Math.abs(enemy.scaleX),
                    Math.abs(enemy.scaleY)
                )
                : 0;

            if (
                enemyWorld.sub(explosionWorld).mag()
                > this.explosionRadius + enemyRadius
            ) {
                continue;
            }

            controller.takeDamage(this.damage);
            cc.director.emit(
                "level3-player-bullet-hit",
                enemy,
                this.damage
            );
        }
    }

    private findEnemies(node: cc.Node, enemies: cc.Node[]) {
        if (!node || !node.isValid || !node.activeInHierarchy) return;

        const controller = node.getComponent("Level3EnemyShip") as any;
        if (controller && typeof controller.takeDamage === "function") {
            enemies.push(node);
        }

        for (const child of node.children) {
            this.findEnemies(child, enemies);
        }
    }

    private updateExplosion(dt: number) {
        if (!this.sprite || this.explosionFrames.length === 0) {
            this.recycle();
            return;
        }

        this.frameElapsed += dt;
        const frameDuration = 1 / Math.max(
            1,
            this.explosionFramesPerSecond
        );

        while (this.frameElapsed >= frameDuration) {
            this.frameElapsed -= frameDuration;
            this.frameIndex += 1;

            if (this.frameIndex >= this.explosionFrames.length) {
                this.recycle();
                return;
            }

            this.sprite.spriteFrame = this.explosionFrames[this.frameIndex];
        }
    }

    private recycle() {
        if (!this.isActive) return;
        this.isActive = false;

        if (this.recycleCallback) {
            this.recycleCallback(this.node);
        } else {
            this.node.destroy();
        }
    }

    private updateAnimation(dt: number) {
        if (
            !this.sprite
            || this.frames.length <= 1
            || this.framesPerSecond <= 0
        ) {
            return;
        }

        this.frameElapsed += dt;
        const frameDuration = 1 / this.framesPerSecond;

        while (this.frameElapsed >= frameDuration) {
            this.frameElapsed -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this.sprite.spriteFrame = this.frames[this.frameIndex];
        }
    }
}
