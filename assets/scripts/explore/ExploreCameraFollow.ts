// CameraFollow.ts
// Cocos Creator 2.4.8
//
// 【設計說明】
// Camera 節點跟隨 Player 的 X 和 Y，但不超過 Tilemap 四個邊界。
//
// 場景結構：
// Canvas
// ├── Main Camera   ← CameraFollow 掛這裡
// ├── Background    ← 完全不動
// ├── Tilemap       ← 完全不動（視覺外觀）
// ├── Level         ← LevelBuilder，完全不動（碰撞體）
// └── Player        ← Canvas 直接子節點，物理移動

const { ccclass, property } = cc._decorator;

@ccclass
export default class ExploreCameraFollow extends cc.Component {

    @property(cc.Node) target: cc.Node = null;
    @property followSpeed: number = 8;

    @property mapMinX: number = 0;   // 地圖左邊界（Canvas 座標）
    @property mapMaxX: number = 1920;   // 地圖右邊界（Canvas 座標）
    @property mapMinY: number = 0;   // 地圖下邊界（Canvas 座標）
    @property mapMaxY: number = 1024;    // 地圖上邊界（Canvas 座標）

    /** true = 瞬間跟上；false = lerp 平滑跟隨 */
    @property snapMode: boolean = true;

    private _halfW: number = 0;
    private _halfH: number = 0;
    private _ready: boolean = false;

    onLoad() {
        const size  = cc.view.getDesignResolutionSize();
        this._halfW = size.width  / 2;
        this._halfH = size.height / 2;

        if (this.target) {
            this._ready = true;
            this._snapToTarget();
        }
    }

    /** LevelBuilder.setupCamera() 呼叫，動態設定 target 和地圖邊界 */
    public init(target: cc.Node) {
        this.target = target;
        this._ready = true;
        this._snapToTarget();
        cc.log(`[Cam] init → target=${target.name}`);
        cc.log(`[Cam] X:[${this.mapMinX}, ${this.mapMaxX}] Y:[${this.mapMinY}, ${this.mapMaxY}]`);
    }

    lateUpdate(dt: number) {
        if (!this._ready || !this.target) return;

        const targetX = this._clampX(this.target.x);
        const targetY = this._clampY(this.target.y);

        if (this.snapMode) {
            this.node.x = targetX;
            this.node.y = targetY;
        } else {
            const t = Math.min(1, this.followSpeed * dt);
            this.node.x = cc.misc.lerp(this.node.x, targetX, t);
            this.node.y = cc.misc.lerp(this.node.y, targetY, t);
        }
    }

    private _snapToTarget() {
        if (!this.target) return;
        this.node.x = this._clampX(this.target.x);
        this.node.y = this._clampY(this.target.y);
    }

    private _clampX(playerX: number): number {
        const mapWidth = this.mapMaxX - this.mapMinX;
        if (mapWidth <= this._halfW * 2) {
            return this.mapMinX + mapWidth / 2;
        }
        return cc.misc.clampf(playerX, this.mapMinX + this._halfW, this.mapMaxX - this._halfW);
    }

    private _clampY(playerY: number): number {
        const mapHeight = this.mapMaxY - this.mapMinY;
        if (mapHeight <= this._halfH * 2) {
            return this.mapMinY + mapHeight / 2;
        }
        return cc.misc.clampf(playerY, this.mapMinY + this._halfH, this.mapMaxY - this._halfH);
    }
}