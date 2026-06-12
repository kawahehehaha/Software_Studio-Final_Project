/**
 * Spawns Level 3 player bullets when Level3SpaceshipController emits fire.
 */
import Level3PlayerBullet from "./Level3PlayerBullet";
import { AudioBroadcast } from "../Audio/AudioEvent";

const { ccclass, property } = cc._decorator;

const EXPLOSION_FRAME_UUIDS = [
    "47226a2a-c62e-4282-ada6-087c22cc41ad",
    "6dc1f008-6eca-43e3-8322-c529723d773a",
    "78f3bd07-9d17-4ba4-af62-5a68aefb20e4",
    "2a2015dc-2589-4618-9192-5e15924ef0ef",
    "39ac2a9c-0ad0-43da-bfb1-43dbde17ebaf",
    "318e137c-4046-4631-b59f-5567a17e2f44",
    "9afb1623-060e-4e24-be29-05f831770e49",
    "dca463f6-8d95-4a89-84fb-c336254b4f5e",
    "eb6ec121-4d38-4dfe-8b5a-07d935efee3c"
];

@ccclass
export default class Level3WeaponShooter extends cc.Component {
    @property(cc.Node)
    leftFirePoint: cc.Node = null;

    @property(cc.Node)
    rightFirePoint: cc.Node = null;

    @property(cc.Node)
    bulletLayer: cc.Node = null;

    @property(cc.Texture2D)
    bulletTexture: cc.Texture2D = null;

    @property
    bulletFrameWidth = 32;

    @property
    bulletFrameHeight = 32;

    @property
    bulletFrameCount = 4;

    @property
    bulletFramesPerSecond = 14;

    @property
    bulletSpeed = 720;

    @property
    bulletLifetime = 2.5;

    @property
    bulletDamage = 1;

    @property
    bulletScale = 1;

    @property([cc.SpriteFrame])
    explosionFrames: cc.SpriteFrame[] = [];

    @property
    explosionFramesPerSecond = 10;

    @property
    explosionScale = 0.28;

    @property
    explosionRadius = 150;

    @property
    fireCooldown = 0.12;

    @property
    initialPoolSize = 20;

    @property
    logPoolStats = true;

    private lastFireTime = -999;
    private bulletPool = new cc.NodePool();
    private createdBullets = 0;
    private reusedBullets = 0;
    private activeBullets = 0;
    private bulletPoolReady = false;

    onLoad() {
        cc.director.getCollisionManager().enabled = true;

        if (!this.bulletLayer) {
            this.bulletLayer = this.node.parent || cc.director.getScene();
        }

        this.prepareExplosionFrames(() => {
            if (!this.node || !this.node.isValid) return;
            this.prewarmPool();
            this.bulletPoolReady = true;
        });

        cc.director.on("level3-player-fire", this.onPlayerFire, this);
        cc.director.on("net-l3-player-fire", this.onRemotePlayerFire, this);
    }

    onDestroy() {
        cc.director.off("level3-player-fire", this.onPlayerFire, this);
        cc.director.off("net-l3-player-fire", this.onRemotePlayerFire, this);
        this.bulletPool.clear();
    }

    private onRemotePlayerFire(data: { direction: number }) {
        if (!this.bulletTexture || !this.bulletPoolReady) return;
        // 只讓掛在遠端玩家節點上的 Shooter 響應
        const nm = (window as any).NM;
        if (!nm || !nm.remotePlayer || !nm.remotePlayer.isValid) return;
        if (nm.remotePlayer !== this.node) return;

        const now = Date.now() / 1000;
        if (now - this.lastFireTime < this.fireCooldown) return;
        this.lastFireTime = now;

        const firePoint = data.direction < 0 ? this.leftFirePoint : this.rightFirePoint;
        this.spawnBullet(firePoint || this.node);
    }

    private onPlayerFire(direction: number, source: cc.Node) {
        if (
            source !== this.node
            || !this.bulletTexture
            || !this.bulletPoolReady
        ) {
            return;
        }

        const now = Date.now() / 1000;
        if (now - this.lastFireTime < this.fireCooldown) return;
        this.lastFireTime = now;

        const firePoint = direction < 0
            ? this.leftFirePoint
            : this.rightFirePoint;
        this.spawnBullet(firePoint || this.node);
    }

    private spawnBullet(firePoint: cc.Node) {
        if (!this.bulletLayer) return;

        let bulletNode: cc.Node;
        if (this.bulletPool.size() > 0) {
            bulletNode = this.bulletPool.get();
            this.reusedBullets += 1;
        } else {
            bulletNode = this.createBulletNode();
        }

        this.bulletLayer.addChild(bulletNode);
        bulletNode.active = true;

        const worldPosition = firePoint.convertToWorldSpaceAR(cc.v2());
        bulletNode.setPosition(
            this.bulletLayer.convertToNodeSpaceAR(worldPosition)
        );

        const playerScale = (
            Math.abs(this.node.scaleX) + Math.abs(this.node.scaleY)
        ) * 0.5;
        bulletNode.scale = this.bulletScale * playerScale;

        const bullet = bulletNode.getComponent(Level3PlayerBullet);
        bullet.launch(
            cc.v2(0, 1),
            this.bulletSpeed,
            this.bulletLifetime,
            this.bulletDamage
        );
        AudioBroadcast.playEffect('gun_shoot');
        this.activeBullets += 1;
    }

    private prewarmPool() {
        const count = Math.max(0, Math.floor(this.initialPoolSize));
        for (let index = 0; index < count; index++) {
            this.bulletPool.put(this.createBulletNode());
        }
        this.logStats("prewarm");
    }

    private prepareExplosionFrames(onReady: () => void) {
        if (this.explosionFrames && this.explosionFrames.length > 0) {
            onReady();
            return;
        }

        const assetManager = (cc as any).assetManager;
        if (!assetManager || typeof assetManager.loadAny !== "function") {
            cc.warn(
                "[Level3WeaponShooter] Cannot load player explosion frames."
            );
            onReady();
            return;
        }

        assetManager.loadAny(
            EXPLOSION_FRAME_UUIDS,
            (error: Error, assets: cc.Asset[]) => {
                if (error) {
                    cc.warn(
                        "[Level3WeaponShooter] Failed to load player "
                        + `explosion frames: ${error.message || error}`
                    );
                    onReady();
                    return;
                }

                this.explosionFrames = (assets || []).filter(
                    asset => asset instanceof cc.SpriteFrame
                ) as cc.SpriteFrame[];

                if (
                    this.explosionFrames.length
                    !== EXPLOSION_FRAME_UUIDS.length
                ) {
                    cc.warn(
                        "[Level3WeaponShooter] Loaded "
                        + `${this.explosionFrames.length}/`
                        + `${EXPLOSION_FRAME_UUIDS.length} explosion frames.`
                    );
                }

                onReady();
            }
        );
    }

    private createBulletNode(): cc.Node {
        const bulletNode = new cc.Node("PlayerBullet");
        bulletNode.group = "default";

        const collider = bulletNode.addComponent(cc.BoxCollider);
        collider.size = cc.size(
            this.bulletFrameWidth * 0.45,
            this.bulletFrameHeight * 0.65
        );

        const bullet = bulletNode.addComponent(Level3PlayerBullet);
        bullet.configure(
            this.bulletTexture,
            this.bulletFrameWidth,
            this.bulletFrameHeight,
            this.bulletFrameCount,
            this.bulletFramesPerSecond,
            this.explosionFrames,
            this.explosionFramesPerSecond,
            this.explosionScale,
            this.explosionRadius,
            this.recycleBullet.bind(this)
        );

        this.createdBullets += 1;
        return bulletNode;
    }

    private recycleBullet(bulletNode: cc.Node) {
        if (!bulletNode || !bulletNode.isValid) return;

        const bullet = bulletNode.getComponent(Level3PlayerBullet);
        if (bullet) bullet.resetForPool();

        this.activeBullets = Math.max(0, this.activeBullets - 1);
        this.bulletPool.put(bulletNode);

        if (
            this.logPoolStats
            && (this.reusedBullets === 1 || this.reusedBullets % 50 === 0)
        ) {
            this.logStats("recycle");
        }
    }

    private logStats(reason: string) {
        if (!this.logPoolStats) return;
        cc.log(
            `[BulletPool:${reason}] created=${this.createdBullets}, `
            + `reused=${this.reusedBullets}, `
            + `active=${this.activeBullets}, `
            + `available=${this.bulletPool.size()}`
        );
    }
}
