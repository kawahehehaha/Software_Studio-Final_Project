/**
 * ExploreCtrl.ts
 */
import GameData from "./GameData";
import { AudioBroadcast } from "../Audio/AudioEvent";

const { ccclass, property } = cc._decorator;

@ccclass
export default class ExploreCtrl extends cc.Component {

    @property(cc.Node) player:           cc.Node = null;
    @property(cc.Node) spaceship:        cc.Node = null;
    @property(cc.Node) promptInventory:  cc.Node = null;
    @property([cc.Node]) levelEntries: cc.Node[] = [];   // 拖入 entry1, entry2, entry3
    @property([cc.Node]) promptLevels: cc.Node[] = [];   // 對應三個提示節點

    @property thrust:            number = 200;
    @property rotateSpeed:       number = 100;
    @property damping:           number = 0.994;
    @property interactDistance:  number = 100;
    @property angularDamping:  number = 0.92;   // 旋轉慣性阻尼（0~1，越大越滑）
    @property sideThrustRatio: number = 0.5;    // 側向推力佔 thrust 的比例
        // 新增 @property 邊界設定
    @property mapMinX: number =  0;
    @property mapMaxX: number =  1920;
    @property mapMinY: number =  0;
    @property mapMaxY: number =  1024;

    // 私有變數新增
    private angularVelocity: number = 0;   // 自己管理角速度（度/秒）

    // 非 idle 時飛船本體縮放（fire 在下，本體在上，scale 略小於 idle）
    private readonly ACTIVE_SCALE       = 0.64;
    // 非 idle 時 collider 往上偏移量（把 collider 從底部火焰往上移到飛船本體）
    // 依實際圖片微調，正值 = 往上
    private readonly ACTIVE_OFFSET_Y    = -25;

    private keys: Set<number>  = new Set();
    private rb:   cc.RigidBody = null;
    private anim: cc.Animation = null;
    private currentAnim: string = "";

    private _originalColliderRadius: number  = null;
    private _idleColliderOffset:     cc.Vec2 = null;
    private _activeColliderOffset:   cc.Vec2 = null;

    // 新增一個變數來追蹤是否正在飛行，避免重複播放音效
    private isCraftFlying: boolean = false;

    // 私有方法：統一判斷翻轉狀態
    private isFlipped(): boolean {
        const angle = ((this.player.angle % 360) + 360) % 360;
        return angle > 0 && angle < 180;
    }

    onLoad() {
        const physics    = cc.director.getPhysicsManager();
        physics.enabled  = true;
        physics.gravity  = cc.v2(0, -980);

        if (this.player) {
            this.rb = this.player.getComponent(cc.RigidBody);
            if (!this.rb) {
                cc.error("[ExploreCtrl] Player 節點缺少 RigidBody！");
            } else {
                this.rb.fixedRotation = true;
                this.rb.linearDamping = 0.5;
                this.rb.gravityScale  = 1;
                this.rb.bullet        = true;   // 防止高速穿透地面
            }

            this.anim         = this.player.getComponent(cc.Animation);
            this.player.group = "Player";

            // 先設定錨點
            this.player.setAnchorPoint(0.5, 1);

            const col = this.player.getComponent(cc.PhysicsCircleCollider);
            if (col) {
                col.friction = 0;

                // 錨點在頂部時，collider 往下移半個節點高度才會在視覺中心
                const h = this.player.getContentSize().height;
                const centerOffsetY = -(h / 2);

                col.offset = cc.v2(0, centerOffsetY);
                col.apply();

                this._originalColliderRadius = col.radius;
                this._idleColliderOffset     = cc.v2(0, centerOffsetY);

                // 非 idle 時在 centerOffsetY 基礎上再加 ACTIVE_OFFSET_Y
                this._activeColliderOffset   = cc.v2(0, centerOffsetY + this.ACTIVE_OFFSET_Y);
            }

        }

        // onLoad 裡新增，取得 PlayerCollider 並設定回調
        const playerCollider = this.player.getComponent("PlayerCollider") as any;
        if (playerCollider) {
            playerCollider.onEnterSpaceship = () => {
                if (this.promptInventory) this.promptInventory.active = true;
            };
            playerCollider.onExitSpaceship = () => {
                if (this.promptInventory) this.promptInventory.active = false;
            };
            playerCollider.onEnterLevel = (index: number) => {
                if (this.promptLevels[index]) this.promptLevels[index].active = true;
            };
            playerCollider.onExitLevel = (index: number) => {
                if (this.promptLevels[index]) this.promptLevels[index].active = false;
            };
        }

        // entry 動畫永遠播放
        this.levelEntries.forEach((entry, i) => {
            if (!entry) return;
            const anim = entry.getComponent(cc.Animation);
            if (anim) anim.play(`entry${i + 1}`);
        });

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }

    start() {
        // 換BGM
        AudioBroadcast.playBgm("main_scene_bgm");
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        this.keys.add(e.keyCode);
        if (e.keyCode === cc.macro.KEY.e) this.tryInteract();
    }

    private onKeyUp(e: cc.Event.EventKeyboard) {
        this.keys.delete(e.keyCode);

        // stopEffect
        if (e.keyCode === cc.macro.KEY.w || e.keyCode === cc.macro.KEY.a || e.keyCode === cc.macro.KEY.d) {
            this.isCraftFlying = false;
            AudioBroadcast.stopEffect("craft_flying");
        }
    }

    update(dt: number) {
        if (!this.player || !this.rb) return;

        // ── 旋轉 + 側向推力 ───────────────────────
        let turning = false;

        if (this.keys.has(cc.macro.KEY.d)) {
            this.angularVelocity += this.rotateSpeed * dt * 8;   // 累積角速度
            turning = true;

            // 側向推力：朝飛船左方施加小推力
            const rad = (-this.player.angle - 90) * Math.PI / 180;
            const pos = this.player.convertToWorldSpaceAR(cc.v2(0, 0));
            this.rb.applyLinearImpulse(
                cc.v2(Math.sin(rad) * this.thrust * this.sideThrustRatio,
                    Math.cos(rad) * this.thrust * this.sideThrustRatio),
                pos, true
            );
            // flying 音效：開始飛行時播放，放開後停止
            if (!this.isCraftFlying) {
                this.isCraftFlying = true;
                AudioBroadcast.playEffect("craft_flying");
            }
        }

        if (this.keys.has(cc.macro.KEY.a)) {
            this.angularVelocity -= this.rotateSpeed * dt * 8;   // 累積角速度
            turning = true;

            // 側向推力：朝飛船右方施加小推力
            const rad = (-this.player.angle + 90) * Math.PI / 180;
            const pos = this.player.convertToWorldSpaceAR(cc.v2(0, 0));
            this.rb.applyLinearImpulse(
                cc.v2(Math.sin(rad) * this.thrust * this.sideThrustRatio,
                    Math.cos(rad) * this.thrust * this.sideThrustRatio),
                pos, true
            );
            // flying 音效：開始飛行時播放，放開後停止
            if (!this.isCraftFlying) {
                this.isCraftFlying = true;
                AudioBroadcast.playEffect("craft_flying");
            }
        }

        // ── 旋轉慣性阻尼（放開後逐漸停止）─────────
        this.angularVelocity *= this.angularDamping;

        // ── 套用角速度到 player.angle ───────────────
        this.player.angle += this.angularVelocity * dt;

        // ── 前進推力 ───────────────────────────────
        if (this.keys.has(cc.macro.KEY.w)) {
            const rad = -this.player.angle * Math.PI / 180;
            const pos = this.player.convertToWorldSpaceAR(cc.v2(0, 0));
            this.rb.applyLinearImpulse(
                cc.v2(Math.sin(rad) * this.thrust, Math.cos(rad) * this.thrust),
                pos, true
            );
            // flying 音效：開始飛行時播放，放開後停止
            if (!this.isCraftFlying) {
                this.isCraftFlying = true;
                AudioBroadcast.playEffect("craft_flying");
            }
        }

        this.updateAnimation();
        this.clampToBounds();
        this.updateFlip();
    }
    
    private updateFlip() {
        const absScale = Math.abs(this.player.scaleY);
        this.player.scaleX = this.isFlipped() ? -absScale : absScale;
    }

    private clampToBounds() {
        const vel = this.rb.linearVelocity;
        let   x   = this.player.x;
        let   y   = this.player.y;
        let   vx  = vel.x;
        let   vy  = vel.y;

        if (x < this.mapMinX) { x = this.mapMinX; vx = Math.max(0, vx); }
        if (x > this.mapMaxX) { x = this.mapMaxX; vx = Math.min(0, vx); }
        if (y < this.mapMinY) { y = this.mapMinY; vy = Math.max(0, vy); }
        if (y > this.mapMaxY) { y = this.mapMaxY; vy = Math.min(0, vy); }

        this.player.x          = x;
        this.player.y          = y;
        this.rb.linearVelocity = cc.v2(vx, vy);
    }

    // ── 動畫 + scale + collider 切換 ─────────────────────────
    private updateAnimation() {
        if (!this.anim) return;

        const w = this.keys.has(cc.macro.KEY.w);
        const a = this.keys.has(cc.macro.KEY.a);
        const d = this.keys.has(cc.macro.KEY.d);

        // ── 判斷當前是否翻轉 ──────────────────────
        const flipped = this.isFlipped();

        let target = "player_idle";
        if (w) {
            target = "player_move";
        } else if (a) {
            // 翻轉時 A 鍵視覺上是往右
            target = flipped ? "player_right" : "player_left";
        } else if (d) {
            // 翻轉時 D 鍵視覺上是往左
            target = flipped ? "player_left" : "player_right";
        }

        if (target === this.currentAnim) return;
        this.anim.play(target);
        this.currentAnim = target;

        if (target === "player_idle") {
            this.player.scale = 1;
            this.applyCollider(1, this._idleColliderOffset ?? cc.v2(0, 0));
            this.setSpriteOffset(1);
        } else {
            this.player.scale = this.ACTIVE_SCALE;
            this.applyCollider(this.ACTIVE_SCALE, this._activeColliderOffset ?? cc.v2(0, this.ACTIVE_OFFSET_Y));
            this.setSpriteOffset(this.ACTIVE_SCALE);
        }
    }

    // 替代方案：改錨點為頂部 (0.5, 1)，scale 縮小時頂部自然固定
    private setSpriteOffset(scale: number) {
        this.player.setAnchorPoint(0.5, 1);   // 錨點移到頂部
    }

    /**
     * 套用 collider 縮放補償 + offset。
     * radius 補償：世界大小 = radius × scale = original × (1/scale) × scale = original
     */
    private applyCollider(scale: number, baseOffset: cc.Vec2) {
        const col = this.player.getComponent(cc.PhysicsCircleCollider);
        if (!col || !this._originalColliderRadius) return;

        col.radius = this._originalColliderRadius / scale;   // 補償縮放
        col.offset = cc.v2(baseOffset.x, baseOffset.y);
        col.apply();
    }

    // ── 每幀旋轉 offset ───────────────────────────────────────
    private updateColliderOffset() {
        const col = this.player.getComponent(cc.PhysicsCircleCollider);
        if (!col) return;

        const base = this.currentAnim === "player_idle"
            ? this._idleColliderOffset
            : this._activeColliderOffset;

        if (!base) return;

        // ★ 直接套用固定 offset，不做旋轉
        // Cocos 2.x PhysicsCircleCollider offset 是節點本地座標，
        // 物理引擎已經自動處理節點旋轉，不需要手動旋轉
        if (col.offset.x === base.x && col.offset.y === base.y) return;

        col.offset = cc.v2(base.x, base.y);
        col.apply();
    }

    private tryInteract() {
        if (!this.player) return;

        // Spaceship：仍用 prompt 顯示狀態判斷
        if (this.promptInventory?.active) {
            cc.director.loadScene("Inventory");
            return;
        }

        // Entry：找到目前顯示中的 prompt
        for (let i = 0; i < this.promptLevels.length; i++) {
            if (this.promptLevels[i]?.active) {
                AudioBroadcast.playEffect("enter_level");
                this.enterLevel(i + 1);
                return;
            }
        }
    }

    private distTo(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt((x1-x2)**2 + (y1-y2)**2);
    }

    private enterLevel(level: number) {
        let scene: string;
        switch (level) {
            case 1: scene = "Level1"; break;
            case 2: scene = "Level2"; break;
            case 3: scene = "Level3"; break;
            default:
                GameData.calcEnding();
                scene = "Ending";
                break;
        }

        // 多人：透過 NetworkManager 廣播場景切換，確保雙方同步進入
        const nm = (window as any).NM;
        if (nm && nm.room) {
            nm.sendSceneChange(scene);
        } else {
            cc.director.loadScene(scene);
        }
    }

    /**
     * 多人時由 NetworkManager 呼叫，將太空船控制權切換到正確節點。
     * P0 維持原本 Inspector 設定的 player；P1 需要切換到 spaceship2。
     */
    public switchToPlayer(node: cc.Node) {
        if (!node || node === this.player) return;

        // 舊 player 的 PlayerCollider 不再驅動 UI
        const oldCollider = this.player?.getComponent('PlayerCollider') as any;
        if (oldCollider) {
            oldCollider.onEnterSpaceship = null;
            oldCollider.onExitSpaceship  = null;
            oldCollider.onEnterLevel     = null;
            oldCollider.onExitLevel      = null;
        }

        this.player = node;

        // 重新初始化物理剛體
        this.rb = node.getComponent(cc.RigidBody);
        if (this.rb) {
            this.rb.fixedRotation = true;
            this.rb.linearDamping = 0.5;
            this.rb.gravityScale  = 1;
            this.rb.bullet        = true;
        }

        // 重新初始化動畫
        this.anim        = node.getComponent(cc.Animation);
        this.currentAnim = '';

        // 重新初始化 collider offset（與 onLoad 邏輯相同）
        node.setAnchorPoint(0.5, 1);
        const col = node.getComponent(cc.PhysicsCircleCollider);
        if (col) {
            col.friction = 0;
            const h = node.getContentSize().height;
            const centerOffsetY = -(h / 2);
            col.offset = cc.v2(0, centerOffsetY);
            col.apply();
            this._originalColliderRadius = col.radius;
            this._idleColliderOffset     = cc.v2(0, centerOffsetY);
            this._activeColliderOffset   = cc.v2(0, centerOffsetY + this.ACTIVE_OFFSET_Y);
        }

        // 重新綁定 PlayerCollider 互動回調
        const playerCollider = node.getComponent('PlayerCollider') as any;
        if (playerCollider) {
            playerCollider.onEnterSpaceship = () => {
                if (this.promptInventory) this.promptInventory.active = true;
            };
            playerCollider.onExitSpaceship = () => {
                if (this.promptInventory) this.promptInventory.active = false;
            };
            playerCollider.onEnterLevel = (index: number) => {
                if (this.promptLevels[index]) this.promptLevels[index].active = true;
            };
            playerCollider.onExitLevel = (index: number) => {
                if (this.promptLevels[index]) this.promptLevels[index].active = false;
            };
        }

        // 更新 Explore 鏡頭跟隨目標（Main Camera 在 Scene 根，不在 Canvas 下）
        const mainCam = cc.find('Canvas/Main Camera') || cc.find('Main Camera');
        if (mainCam) {
            const camFollow = mainCam.getComponent('ExploreCameraFollow') as any;
            if (camFollow && camFollow.init) {
                camFollow.init(node);
            }
        }

        cc.log('ExploreCtrl: 切換到玩家節點 ' + node.name);
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }
}