/**
 * ExploreCtrl.ts
 * 場景：Explore（主探索場景）
 * 掛載節點：Canvas
 *
 * 場景節點結構：
 * Canvas
 * ├── Player          ← 玩家飛船（掛圖片 Sprite）
 * ├── Spaceship       ← 停靠的飛船（靠近按 E → Inventory）
 * ├── LevelEntry      ← 關卡入口（靠近按 E → 進關卡）
 * ├── PromptInventory ← 「按 E 進入飛船」提示文字節點
 * └── PromptLevel     ← 「按 E 進入關卡」提示文字節點
 */
import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class ExploreCtrl extends cc.Component {

    // ── 玩家節點 ──────────────────────────────
    @property(cc.Node)
    player: cc.Node = null;

    // ── 互動目標 ──────────────────────────────
    @property(cc.Node)
    spaceship: cc.Node = null;      // 飛船（→ Inventory）

    @property(cc.Node)
    levelEntry: cc.Node = null;     // 關卡入口（→ Level）

    // ── 提示 UI ───────────────────────────────
    @property(cc.Node)
    promptInventory: cc.Node = null;

    @property(cc.Node)
    promptLevel: cc.Node = null;

    // ── 移動參數（來自 move.ts）──────────────
    @property
    thrust: number = 200;           // 推進力

    @property
    rotateSpeed: number = 150;      // 旋轉速度（度/秒）

    @property
    damping: number = 0.994;        // 慣性阻尼（0～1，越大越滑）

    // ── 互動距離 ─────────────────────────────
    @property
    interactDistance: number = 100;

    // ── 私有變數 ─────────────────────────────
    private vx: number = 0;
    private vy: number = 0;
    private keys: Set<number> = new Set();
    private halfW: number = 0;
    private halfH: number = 0;

    onLoad() {
        // 取得螢幕尺寸（用於邊界限制）
        const size = cc.view.getVisibleSize();
        this.halfW = size.width  / 2;
        this.halfH = size.height / 2;

        // 隱藏提示
        if (this.promptInventory) this.promptInventory.active = false;
        if (this.promptLevel)     this.promptLevel.active     = false;

        // 鍵盤監聽
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        this.keys.add(e.keyCode);

        // 按 E 觸發互動
        if (e.keyCode === cc.macro.KEY.e) {
            this.tryInteract();
        }
    }

    private onKeyUp(e: cc.Event.EventKeyboard) {
        this.keys.delete(e.keyCode);
    }

    update(dt: number) {
        if (!this.player) return;

        // ── 旋轉 ──────────────────────────────
        if (this.keys.has(cc.macro.KEY.a)) {
            this.player.angle += this.rotateSpeed * dt;
        }
        if (this.keys.has(cc.macro.KEY.d)) {
            this.player.angle -= this.rotateSpeed * dt;
        }

        // ── 推進（W 加速，朝向機頭方向）────────
        const rad = -this.player.angle * Math.PI / 180;
        if (this.keys.has(cc.macro.KEY.w)) {
            this.vx += Math.sin(rad) * this.thrust * dt;
            this.vy += Math.cos(rad) * this.thrust * dt;
        }

        // ── 慣性阻尼 ──────────────────────────
        this.vx *= this.damping;
        this.vy *= this.damping;

        // ── 移動 + 邊界限制 ───────────────────
        // Cocos 2.x Canvas 原點在畫面中心，邊界為 ±半寬/半高
        let newX = this.player.x + this.vx * dt;
        let newY = this.player.y + this.vy * dt;

        if (newX < -this.halfW) { newX = -this.halfW; this.vx = 0; }
        if (newX >  this.halfW) { newX =  this.halfW; this.vx = 0; }
        if (newY < -this.halfH) { newY = -this.halfH; this.vy = 0; }
        if (newY >  this.halfH) { newY =  this.halfH; this.vy = 0; }

        this.player.x = newX;
        this.player.y = newY;

        // ── 更新互動提示 ──────────────────────
        this.updatePrompts();
    }

    private updatePrompts() {
        const px = this.player.x;
        const py = this.player.y;

        if (this.spaceship && this.promptInventory) {
            const d = this.distTo(px, py, this.spaceship.x, this.spaceship.y);
            this.promptInventory.active = d < this.interactDistance;
        }

        if (this.levelEntry && this.promptLevel) {
            const d = this.distTo(px, py, this.levelEntry.x, this.levelEntry.y);
            this.promptLevel.active = d < this.interactDistance;
        }
    }

    private tryInteract() {
        if (!this.player) return;
        const px = this.player.x;
        const py = this.player.y;

        if (this.spaceship) {
            if (this.distTo(px, py, this.spaceship.x, this.spaceship.y) < this.interactDistance) {
                cc.director.loadScene("Inventory");
                return;
            }
        }

        if (this.levelEntry) {
            if (this.distTo(px, py, this.levelEntry.x, this.levelEntry.y) < this.interactDistance) {
                this.enterLevel();
                return;
            }
        }
    }

    private distTo(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    }

    private enterLevel() {
        switch (GameData.currentLevel) {
            case 1: cc.director.loadScene("Level1"); break;
            case 2: cc.director.loadScene("Level2"); break;
            case 3: cc.director.loadScene("Level3"); break;
            default:
                GameData.calcEnding();
                cc.director.loadScene("Ending");
                break;
        }
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }
}