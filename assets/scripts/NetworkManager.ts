/**
 * NetworkManager.ts
 * 全域持久化單例，負責 Colyseus 連線與雙人位置同步。
 *
 * ── 使用方式 ──────────────────────────────────────────────────────
 * 1. 在 MainMenu 場景建一個空節點命名為 "NetworkManager"，掛上此腳本。
 * 2. 其他場景中直接呼叫 NetworkManager.instance 取得全域參考。
 *
 * ── 場景節點命名規則 ──────────────────────────────────────────────
 * Explore 場景：
 *   Canvas/Player   → P0 玩家
 *   Canvas/Player2  → P1 玩家
 * Level2 / Level2-part2 / Level3 場景：
 *   Canvas/Pink_Monster     → P0 粉紅怪
 *   Canvas/Pink_Monster_P2  → P1 粉紅怪
 *
 * ── Server 位址 ──────────────────────────────────────────────────
 * 同一台機器或同一區網：ws://localhost:2567
 * 或填對方電腦在區網內的 IP：ws://192.168.x.x:2567
 */

const { ccclass, property } = cc._decorator;
declare const Colyseus: any;
import GameData from "./gameflow/GameData";

@ccclass
export default class NetworkManager extends cc.Component {

    // ── 伺服器位址，可在 Inspector 修改 ──────────────────────────
    @property
    serverUrl: string = 'ws://localhost:2567';

    // ── Colyseus 物件 ───────────────────────────────────────────
    public client: any = null;
    public room:   any = null;
    public mySessionId: string = '';
    public playerIndex: number = -1;

    // ── 本幀追蹤的玩家節點 ──────────────────────────────────────
    public localPlayer:  cc.Node = null;
    public remotePlayer: cc.Node = null;

    // ── 推箱子同步計時 ──────────────────────────────────────────
    private pushSyncTimer: number = 0;
    private lastPushBlockPositions: {x: number, y: number}[] = [];

    // ── 生命同步防重入旗標 ──────────────────────────────────────
    private _ignoringLifeLost: boolean = false;

    // ── 遠端玩家上一幀的動作，用來偵測變化 ──────────────────
    private _lastRemoteAction: string = '';
    // ── 位置 debug 計數（只印前 5 次）──────────────────────
    private _posDbgCount: number = 0;

    // ── 單例存取 ─────────────────────────────────────────────────
    static get instance(): NetworkManager | null {
        return (window as any).NM ?? null;
    }

    // ────────────────────────────────────────────────────────────
    async onLoad() {
        // 單例保護：第二個 NetworkManager 節點自毀
        if ((window as any).NM) {
            this.node.destroy();
            return;
        }
        (window as any).NM = this;
        cc.game.addPersistRootNode(this.node);

        try {
            this.client = new Colyseus.Client(this.serverUrl);
            this.room = await this.client.joinOrCreate('space_room');
            this.mySessionId = this.room.sessionId;
            this.setupRoomHandlers();
        } catch (e) {
            cc.warn('NetworkManager: 連線失敗，以單人模式繼續 — ' + e);
        }

        // 每次場景切換後重新分配玩家節點
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
            this.localPlayer  = null;
            this.remotePlayer = null;
            this.lastPushBlockPositions = [];
            this._lastRemoteAction = '';
            this._posDbgCount = 0;
            this.scheduleOnce(() => {
                // 無論是否連線，先把 P2 節點的控制器預設關閉，避免雙角色同時受鍵盤控制
                const p2Names = ['Player2', 'Pink_Monster_P2'];
                for (const name of p2Names) {
                    const n = cc.find('Canvas/' + name) || cc.find(name);
                    if (n) this.setMovementEnabled(n, false);
                }
                if (this.playerIndex !== -1) {
                    this.assignPlayers();
                }
            }, 0.05);
        }, this);
    }

    // ── 訊息處理 ─────────────────────────────────────────────────
    private setupRoomHandlers() {
        // 伺服器告知玩家編號（0 = 先加入，1 = 後加入）
        this.room.onMessage('init', (data: any) => {
            this.playerIndex   = data.playerIndex;
            GameData.playerId  = data.playerIndex;
            GameData.isSolo    = false;           // 切換為多人模式
            this.scheduleOnce(() => this.assignPlayers(), 0.25);
            cc.log('NetworkManager: 我是玩家 ' + data.playerIndex);
        });

        // 接收對方玩家位置
        this.room.onMessage('positions', (data: any) => {
            for (const id in data) {
                if (id !== this.mySessionId && this.remotePlayer && this.remotePlayer.isValid) {
                    // Level2: controller 掛在 sprite 子節點，需把世界座標轉回 sprite 的本地座標
                    const spriteChild = this.remotePlayer.getChildByName('sprite');
                    if (spriteChild) {
                        const lp = this.remotePlayer.convertToNodeSpaceAR(cc.v2(data[id].x, data[id].y));
                        spriteChild.x = lp.x;
                        spriteChild.y = lp.y;
                        if (data[id].scaleX !== undefined) spriteChild.scaleX = data[id].scaleX;
                        if (data[id].scaleY !== undefined) spriteChild.scaleY = data[id].scaleY;
                        if (this._posDbgCount < 5) {
                            this._posDbgCount++;
                            const sRb = spriteChild.getComponent(cc.RigidBody) as any;
                            cc.log(`[NM.pos#${this._posDbgCount}] L2 sprite ${this.remotePlayer.name} lx=${lp.x.toFixed(1)} ly=${lp.y.toFixed(1)} rbType=${sRb?.type}(1=Kin)`);
                        }
                    } else {
                        const remoteRb = this.remotePlayer.getComponent(cc.RigidBody) as any;
                        if (this._posDbgCount < 5) {
                            this._posDbgCount++;
                            cc.log(`[NM.pos#${this._posDbgCount}] Explore ${this.remotePlayer.name} x=${data[id].x?.toFixed(1)} y=${data[id].y?.toFixed(1)} rbType=${remoteRb?.type}(1=Kin)`);
                        }
                        this.remotePlayer.x = data[id].x;
                        this.remotePlayer.y = data[id].y;
                        if (data[id].scaleX !== undefined) this.remotePlayer.scaleX = data[id].scaleX;
                        if (data[id].scaleY !== undefined) this.remotePlayer.scaleY = data[id].scaleY;
                    }
                    if (data[id].angle !== undefined) {
                        this.remotePlayer.angle = data[id].angle;
                    }
                    // 動畫同步：action 改變時強制更新（清除 currentAction 確保 playSheet 被呼叫）
                    if (data[id].action) {
                        const newAction: string = data[id].action;
                        const actionMap: {[key: string]: string} = {
                            idle: 'playIdle', run: 'playRun', jump: 'playJump',
                            attack: 'playAttack', throw: 'playThrow', push: 'playPush',
                            climb: 'playClimb', hurt: 'playHurt', death: 'playDeath'
                        };
                        if (newAction !== this._lastRemoteAction) {
                            this._lastRemoteAction = newAction;
                            const method = actionMap[newAction];
                            if (method) {
                                const remoteCtrl = this._findCtrlOnSelf(this.remotePlayer)
                                    || (this.remotePlayer.getComponentInChildren('PinkMonsterController') as any)
                                    || (this.remotePlayer.getComponentInChildren('PinkMonsterPhysicsController') as any);
                                if (remoteCtrl && typeof remoteCtrl[method] === 'function') {
                                    remoteCtrl.currentAction = '';
                                    remoteCtrl[method]();
                                }
                            } else {
                                // Explore 場景：action 是 cc.Animation clip 名稱（player_idle / player_move 等）
                                const animComp = this.remotePlayer.getComponent(cc.Animation) as cc.Animation;
                                if (animComp) animComp.play(newAction);
                            }
                        }
                    }
                    // 重力方向視覺同步（Level2-part2 gravity flip）
                    if (data[id].isFlipped !== undefined) {
                        const physCtrl = this._findCtrlOnSelf(this.remotePlayer)
                            || (this.remotePlayer.getComponentInChildren('PinkMonsterPhysicsController') as any);
                        if (physCtrl && typeof physCtrl.applyGravityVisual === 'function') {
                            physCtrl.applyGravityVisual(!!data[id].isFlipped);
                        }
                    }
                }
            }
        });

        // 場景切換（由伺服器廣播）
        this.room.onMessage('scene_change', (data: any) => {
            cc.director.loadScene(data.scene);
        });

        // 同步道具總數
        this.room.onMessage('sync_items', (data: any) => {
            GameData.itemCount = data.total;
        });

        // 同步關卡進度
        this.room.onMessage('unlock', (data: any) => {
            GameData.currentLevel = data.level;
        });

        // 重置遊戲
        this.room.onMessage('do_reset', () => {
            GameData.reset();
            cc.director.loadScene('MainMenu');
        });

        // 可移動物件同步（推箱子）
        this.room.onMessage('objects_synced', (data: any) => {
            if (data.senderId === this.mySessionId) return;
            if (data.type === 'pushblocks') {
                const scene = cc.director.getScene();
                if (!scene) return;
                const blocks = scene.getComponentsInChildren('PushBlockController') as any[];
                for (const item of (data.data as any[])) {
                    const b = blocks[item.i];
                    if (b && b.node) {
                        b.node.x = item.x;
                        b.node.y = item.y;
                        b.previousX = item.x;
                        b.previousY = item.y;
                        // 更新 NM 快取，防止下一幀 syncPushBlocks 把相同位置 echo 回傳
                        this.lastPushBlockPositions[item.i] = { x: Math.round(item.x), y: Math.round(item.y) };
                    }
                }
            }
        });

        // 對方失去一條命 → 本地也扣血顯示（共用血量）
        this.room.onMessage('life_lost_notify', (data: any) => {
            if (data.senderId === this.mySessionId) return;
            this._ignoringLifeLost = true;
            cc.director.emit('player-life-lost');
            this._ignoringLifeLost = false;
        });

        // 生命歸零 → 雙方一起切到結算
        this.room.onMessage('game_over', () => {
            this.scheduleOnce(() => {
                cc.director.loadScene('LevelResult');
            }, 0.8);
        });

        // 金幣被對方吃掉，本地也移除
        this.room.onMessage('coin_removed', (data: any) => {
            if (data.senderId === this.mySessionId) return;
            const scene = cc.director.getScene();
            if (!scene) return;
            const coins = scene.getComponentsInChildren('CoinCollectible') as any[];
            for (const coin of coins) {
                if (!coin || !coin.node || !coin.node.isValid || coin.collected) continue;
                const pos = coin.node.convertToWorldSpaceAR(cc.v2());
                if (Math.abs(pos.x - data.x) < 5 && Math.abs(pos.y - data.y) < 5) {
                    coin.collected = true;
                    coin.node.runAction(cc.sequence(
                        cc.spawn(
                            cc.scaleTo(coin.collectDuration || 0.12, 1.3),
                            cc.fadeOut(coin.collectDuration || 0.12)
                        ),
                        cc.removeSelf()
                    ));
                    break;
                }
            }
        });

        // 兩人都到達終點 → 廣播給各自的 Level2SnowWipeTransition
        this.room.onMessage('all_scene_ready', (data: any) => {
            cc.director.emit('all-scene-ready', data);
        });

        // 對方炸了箱子 → 本地同步炸掉
        this.room.onMessage('box_hit', (data: any) => {
            if (data.senderId === this.mySessionId) return;
            const scene = cc.director.getScene();
            if (!scene) return;
            const boxes = scene.getComponentsInChildren('ExplosivePlankBox') as any[];
            for (const box of boxes) {
                if (!box || !box.node || !box.node.isValid || box.isBreaking) continue;
                const pos = box.node.convertToWorldSpaceAR(cc.v2());
                if (Math.abs(pos.x - data.x) < 15 && Math.abs(pos.y - data.y) < 15) {
                    cc.log('[NM] box_hit received → applying at (' + data.x.toFixed(0) + ',' + data.y.toFixed(0) + ')');
                    box._fromNetwork = true;
                    box.receiveBombExplosion(cc.v2(data.bx, data.by));
                    box._fromNetwork = false;
                    break;
                }
            }
        });

        // 本地有玩家失血 → 同步給對方（防重入避免無限迴圈）
        cc.director.on('player-life-lost', this.onPlayerLifeLostForSync, this);
    }

    private onPlayerLifeLostForSync() {
        if (this._ignoringLifeLost || !this.room) return;
        this.room.send('sync_life_lost', {});
    }

    // ── 場景切換後分配本地 / 遠端玩家節點 ─────────────────────────
    assignPlayers() {
        // Explore: Player/Player2 在 Canvas 下
        // Level2 / Level2-part2: Player/Pink_Monster 在 Scene 根節點（不在 Canvas 下）
        let node0 = cc.find('Canvas/Player') || cc.find('Player');
        let node1 = cc.find('Canvas/Player2') || cc.find('Player2');

        if (!node0) node0 = cc.find('Pink_Monster');
        if (!node1) node1 = cc.find('Pink_Monster_P2');

        if (!node0) {
            // 這是沒有玩家節點的場景（選單、過場等），跳過
            return;
        }

        if (!node1) {
            // 只有一個玩家節點（場景尚未放第二個）
            this.localPlayer  = node0;
            this.remotePlayer = null;
            cc.warn('NetworkManager: 找不到第二個玩家節點，僅同步 P0');
            return;
        }

        if (this.playerIndex === 0) {
            this.localPlayer  = node0;
            this.remotePlayer = node1;
        } else {
            this.localPlayer  = node1;
            this.remotePlayer = node0;
        }

        // ── 通知 ExploreCtrl 切換到正確的玩家節點 ─────────────
        const canvas = cc.find('Canvas');
        if (canvas) {
            const ec = canvas.getComponent('ExploreCtrl') as any;
            if (ec && ec.switchToPlayer) {
                ec.switchToPlayer(this.localPlayer);
            }
        }

        // ── 確保本地玩家控制器開啟、遠端玩家控制器關閉 ────────
        this.setMovementEnabled(this.localPlayer,  true);
        this.setMovementEnabled(this.remotePlayer, false);

        // Explore 場景：ExploreCtrl 把 local player anchor 設成 (0.5,1)（頂部），
        // ghost 也需要相同設定，否則動畫切換時 sprite 高度變化方向不同，看起來「變型」
        if (this.remotePlayer && this.remotePlayer.getComponent(cc.Animation)) {
            this.remotePlayer.setAnchorPoint(0.5, 1);
        }

        // ── 更新鏡頭跟隨本地玩家 ──────────────────────────────
        // Level2: Main Camera 在 Canvas 下；Explore: 在 Scene 根節點
        const mainCam = cc.find('Canvas/Main Camera') || cc.find('Main Camera');
        if (mainCam) {
            // Level2 / Level2-part2：CameraFollow（cc.Class）
            const cf = mainCam.getComponent('CameraFollow') as any;
            if (cf) {
                // Level2 的實際移動節點是 sprite 子節點
                const spriteChild = this.localPlayer.getChildByName('sprite');
                cf.target  = spriteChild || this.localPlayer;
                cf.targets = [];

                // 修正左邊界：CameraFollow 的 leftEdgeX 用 target.parent 轉換，
                // 但 Pink_Monster 和 Pink_Monster_P2 容器 X 不同，導致 Player1 的
                // 左邊界不一致。統一用 Pink_Monster（P0 容器）做基準轉成世界座標。
                // Level2-part2 等沒有 Pink_Monster 容器的場景，改用 target.parent
                // （通常是 scene root，world X=0），直接轉換即可，不需要特殊 fallback。
                if (cf.leftEdgeUsesTargetParent) {
                    const p0Container = cc.find('Pink_Monster') as cc.Node;
                    const refParent = (p0Container || (cf.target as cc.Node).parent) as cc.Node;
                    if (refParent && mainCam.parent) {
                        const worldEdge = (refParent as any).convertToWorldSpaceAR(cc.v2(cf.leftEdgeX, 0));
                        cf.leftEdgeX = (mainCam.parent as any).convertToNodeSpaceAR(worldEdge).x;
                        cf.leftEdgeUsesTargetParent = false;
                    }
                }

                // 切換 target 後立即 snap，避免鏡頭從舊位置慢慢移過來
                const targetNode: cc.Node = cf.target;
                if (mainCam.parent && targetNode && targetNode.isValid) {
                    const worldPos = targetNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
                    const lp = mainCam.parent.convertToNodeSpaceAR(worldPos);
                    mainCam.x = lp.x + (cf.offset ? cf.offset.x : 0);
                    mainCam.y = lp.y + (cf.offset ? cf.offset.y : 0);
                }
            }
            // Explore：ExploreCameraFollow（TypeScript）— switchToPlayer 已處理，備援
            const ecf = mainCam.getComponent('ExploreCameraFollow') as any;
            if (ecf && ecf.init) {
                ecf.init(this.localPlayer);
            }
        }

        cc.log(`[NM] assignPlayers done: P${this.playerIndex}, local=${this.localPlayer?.name}, remote=${this.remotePlayer?.name}`);
        // type: 0=Static, 1=Kinematic, 2=Dynamic；期望 local=2, remote=1
        const _lRb = (this.localPlayer?.getComponentInChildren(cc.RigidBody) ?? this.localPlayer?.getComponent(cc.RigidBody)) as any;
        const _rRb = (this.remotePlayer?.getComponentInChildren(cc.RigidBody) ?? this.remotePlayer?.getComponent(cc.RigidBody)) as any;
        cc.log(`[NM] localRb.type=${_lRb?.type}(want 2=Dynamic), remoteRb.type=${_rRb?.type}(want 1=Kinematic)`);
    }

    // ── 輔助：取得節點本身 + 子節點的所有同類元件（Cocos getComponentsInChildren 不含自身）
    private _getCompsSelfAndChildren(node: cc.Node, type: any): any[] {
        const self = node.getComponent(type);
        const children: any[] = (node.getComponentsInChildren(type) as any[]) || [];
        return self ? [self, ...children] : children;
    }

    // ── 輔助：找指定節點上的玩家控制器（PhysicsController 或 Controller）
    // 使用 scene.getComponentsInChildren 比字串或 _components duck-typing 更可靠
    private _findCtrlOnSelf(node: cc.Node): any | null {
        const scene = cc.director.getScene();
        if (scene) {
            for (const name of ['PinkMonsterPhysicsController', 'PinkMonsterController']) {
                const all = scene.getComponentsInChildren(name) as any[];
                for (const c of all) {
                    if (c && c.node === node) return c;
                }
            }
        }
        // 備用：duck-typing 遍歷 _components（scene 不可用時）
        const comps: any[] = (node as any)['_components'] || [];
        for (const c of comps) {
            if (c && typeof c['onKeyDown'] === 'function' && typeof c['resetInput'] === 'function') {
                return c;
            }
        }
        return null;
    }

    private setMovementEnabled(node: cc.Node, enabled: boolean) {
        if (!node) return;

        // 找玩家控制器：先查節點本身（Level2-part2），再查子節點（Level2 sprite child）
        const ctrl = this._findCtrlOnSelf(node)
            || node.getComponentInChildren('PinkMonsterController')
            || node.getComponentInChildren('PinkMonsterPhysicsController');

        if (ctrl) {
            ctrl.enabled = enabled;
            // 停用/啟用碰撞體，防止 ghost 影響物理世界
            const bcs  = this._getCompsSelfAndChildren(node, cc.BoxCollider);
            const pbcs = this._getCompsSelfAndChildren(node, cc.PhysicsBoxCollider);
            const rbs  = this._getCompsSelfAndChildren(node, cc.RigidBody);
            for (let i = 0; i < bcs.length;  i++) bcs[i].enabled = enabled;
            for (let i = 0; i < pbcs.length; i++) {
                // sensor=true：保留 fixture 但不產生物理碰撞響應（Ghost 穿透）
                // sensor=false + enabled=true：恢復本地玩家正常碰撞
                (pbcs[i] as any).sensor = !enabled;
                pbcs[i].enabled = enabled;
            }
            // RigidBody：改用 Kinematic/Dynamic 切換（rb.enabled 在 Cocos 2.4.8 無效）
            for (let i = 0; i < rbs.length; i++) {
                if (!enabled) {
                    rbs[i].type = cc.RigidBodyType.Kinematic;
                    rbs[i].gravityScale = 0;
                    rbs[i].linearVelocity = cc.v2(0, 0);
                    rbs[i].angularVelocity = 0;
                } else {
                    rbs[i].type = cc.RigidBodyType.Dynamic;
                    rbs[i].gravityScale = 1;  // 恢復重力（disable 時設為 0）
                }
            }
            cc.log(`[NM.sme] ${node.name} → ${enabled ? 'Dynamic/ON' : 'Kinematic/OFF'} ctrl.enabled=${ctrl.enabled} rbs=${rbs.length} pbcs=${pbcs.length}`);
            return;
        }

        // Explore 場景：無玩家控制器，直接操作 rb + collider
        const exploreRb = node.getComponent(cc.RigidBody);
        if (exploreRb) {
            const exploreCircleCol = node.getComponent(cc.PhysicsCircleCollider);
            const exploreBoxCol   = node.getComponent(cc.PhysicsBoxCollider);
            if (!enabled) {
                exploreRb.type = cc.RigidBodyType.Kinematic;
                exploreRb.gravityScale = 0;
                exploreRb.linearVelocity = cc.v2(0, 0);
                exploreRb.angularVelocity = 0;
                if (exploreCircleCol && exploreCircleCol.enabled) exploreCircleCol.enabled = false;
                if (exploreBoxCol   && exploreBoxCol.enabled)    exploreBoxCol.enabled   = false;
            } else {
                exploreRb.type = cc.RigidBodyType.Dynamic;
                exploreRb.gravityScale = 1;
                if (exploreCircleCol && !exploreCircleCol.enabled) exploreCircleCol.enabled = true;
                if (exploreBoxCol   && !exploreBoxCol.enabled)    exploreBoxCol.enabled   = true;
            }
            cc.log(`[NM.sme] ${node.name} → ${enabled?'Dynamic':'Kinematic'}, gravityScale=${exploreRb.gravityScale}`);
        }
    }

    // ── 每幀上傳本地玩家位置 ──────────────────────────────────────
    update(_dt: number) {
        if (!this.room || !this.localPlayer || !this.localPlayer.isValid) return;
        // Level2：controller 在 sprite 子節點，要用 sprite 的世界座標
        const spriteChild = this.localPlayer.getChildByName('sprite');
        let x: number, y: number, scaleX: number, scaleY: number = 1, action: string = '', isFlipped = false;
        if (spriteChild) {
            const wp = spriteChild.convertToWorldSpaceAR(cc.Vec2.ZERO);
            x = wp.x;
            y = wp.y;
            scaleX = spriteChild.scaleX;
            scaleY = spriteChild.scaleY;
            const ctrl = spriteChild.getComponent('PinkMonsterController') as any;
            if (ctrl) action = ctrl.currentAction || '';
        } else {
            x = this.localPlayer.x;
            y = this.localPlayer.y;
            scaleX = this.localPlayer.scaleX;
            scaleY = this.localPlayer.scaleY;
            const ctrl = (this.localPlayer.getComponent('PinkMonsterController')
                || this.localPlayer.getComponent('PinkMonsterPhysicsController')) as any;
            if (ctrl) {
                action = ctrl.currentAction || '';
                isFlipped = typeof ctrl.gravityDirection === 'number' ? ctrl.gravityDirection < 0 : false;
            } else {
                // Explore 場景：用 cc.Animation.currentClip 取得當前播放動畫名稱
                const animComp = this.localPlayer.getComponent(cc.Animation) as any;
                if (animComp && animComp.currentClip) action = animComp.currentClip.name || '';
            }
        }
        this.room.send('move', { x, y, angle: this.localPlayer.angle, scaleX, scaleY, action, isFlipped });

        // 每 50ms 廣播一次推箱子位置（只有位移時才送）
        this.pushSyncTimer += _dt;
        if (this.pushSyncTimer >= 0.05) {
            this.pushSyncTimer = 0;
            this.syncPushBlocks();
        }
    }

    private syncPushBlocks() {
        const scene = cc.director.getScene();
        if (!scene || !this.room) return;
        const blocks = scene.getComponentsInChildren('PushBlockController') as any[];
        if (!blocks || !blocks.length) return;
        const changed: {i: number, x: number, y: number}[] = [];
        for (let i = 0; i < blocks.length; i++) {
            const bx = Math.round(blocks[i].node.x);
            const by = Math.round(blocks[i].node.y);
            const last = this.lastPushBlockPositions[i];
            if (!last || last.x !== bx || last.y !== by) {
                changed.push({ i, x: bx, y: by });
                this.lastPushBlockPositions[i] = { x: bx, y: by };
            }
        }
        if (changed.length > 0) {
            this.room.send('sync_objects', { type: 'pushblocks', data: changed });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ── 供其他腳本呼叫的公開 API ─────────────────────────────────
    // ═══════════════════════════════════════════════════════════

    /** 切換場景（廣播給雙方） */
    public sendSceneChange(scene: string) {
        if (this.room) {
            this.room.send('trigger', { scene });
        } else {
            cc.director.loadScene(scene);
        }
    }

    /** 關卡完成（廣播結算畫面） */
    public sendLevelComplete(newLevel: number) {
        if (this.room) {
            this.room.send('complete', { level: newLevel });
        } else {
            cc.director.loadScene('LevelResult');
        }
    }

    /** 收集道具（同步總數給對方） */
    public sendItemCollected(count: number = 1) {
        if (this.room) {
            this.room.send('collect_item', { count });
        }
    }

    /** 重置遊戲 */
    public sendReset() {
        if (this.room) {
            this.room.send('reset');
        } else {
            GameData.reset();
            cc.director.loadScene('MainMenu');
        }
    }

    onDestroy() {
        cc.director.off(cc.Director.EVENT_AFTER_SCENE_LAUNCH);
        cc.director.off('player-life-lost', this.onPlayerLifeLostForSync, this);
        if ((window as any).NM === this) {
            (window as any).NM = null;
        }
    }
}
