import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

type PlayerState = 'playing' | 'done' | 'dead' | 'timeout';

@ccclass
export default class Level3Ctrl extends cc.Component {

    @property(cc.Node)
    player: cc.Node = null;

    /** 第二位玩家節點（多人模式下在 Inspector 拖入 Player2） */
    @property(cc.Node)
    player2: cc.Node = null;

    /** 勝利條件：玩家 Y 軸達到此值即通關 */
    @property
    goalY: number = 7000;

    /** 遊戲時限（秒） */
    @property
    gameDuration: number = 180;

    @property
    gameOverScene: string = "GameOver";

    // ── 進度條版面 ────────────────────────────────────────────
    @property barMarginX:        number = 80;
    @property barMarginBottom:   number = 50;
    @property tickHeight:        number = 12;
    @property playerTriSize:     number = 10;
    @property enemyTriSize:      number = 7;

    // ── 計時條版面 ────────────────────────────────────────────
    @property timerBarGap:       number = 12;
    @property timerBarThickness: number = 8;

    // ── 敵人生成 ──────────────────────────────────────────────
    @property([cc.Prefab])
    enemyPrefabs: cc.Prefab[] = [];

    @property spawnMinX:    number = -380;
    @property spawnMaxX:    number =  380;
    @property spawnInterval: number = 10;
    @property maxEnemies:   number = 12;

    // ── 私有：共用狀態 ────────────────────────────────────────
    private startY:         number   = 0;
    private remainingTime:  number   = 0;
    private isGameOver:     boolean  = false;
    private canvasNode:     cc.Node  = null;
    private cameraNode:     cc.Node  = null;
    private hudRoot:        cc.Node  = null;
    private graphics:       cc.Graphics = null;
    private enemySearchTimer: number = 0;
    private cachedEnemies:  cc.Node[] = [];
    private spawnTimer:     number   = 0;

    // ── 私有：多人狀態 ────────────────────────────────────────
    private localState:     PlayerState = 'playing';
    private remoteState:    PlayerState = 'playing';
    private localHitCount:  number = 0;
    private remoteHitCount: number = 0;
    private resultSent:     boolean = false;
    private spawnIdCounter: number = 0;
    private spectateOverlay: cc.Node = null;

    // ── Lifecycle ─────────────────────────────────────────────
    onLoad() {
        this.canvasNode = cc.find("Canvas");
        this.cameraNode = cc.find("Canvas/Main Camera");
        if (!this.canvasNode) return;

        this.hudRoot = new cc.Node("Level3 Progress HUD");
        this.hudRoot.setAnchorPoint(0.5, 0.5);
        this.hudRoot.zIndex = 19000;
        this.canvasNode.addChild(this.hudRoot);

        const gNode = new cc.Node("ProgressBarGraphics");
        this.hudRoot.addChild(gNode);
        this.graphics = gNode.addComponent(cc.Graphics);
    }

    start() {
        if (this.player) {
            this.startY = this.player.y;
        }
        this.remainingTime = Math.max(1, this.gameDuration);

        // 自動偵測 Player2 節點
        if (!this.player2) {
            this.player2 = cc.find('Canvas/Player2') || cc.find('Player2');
        }

        // 事件監聽
        cc.director.on('level3-player-hit', this.onLocalPlayerHit, this);
        cc.director.on('net-l3-enemy-spawn', this.onNetEnemySpawn, this);
        cc.director.on('net-l3-enemy-kill',  this.onNetEnemyKill,  this);
        cc.director.on('net-l3-hit-count',   this.onNetHitCount,   this);
        cc.director.on('net-l3-player-event',this.onNetPlayerEvent, this);
        cc.director.on('net-l3-level-end',   this.onNetLevelEnd,   this);
    }

    // ── Update ────────────────────────────────────────────────
    update(dt: number) {
        if (this.isGameOver) return;

        const isSolo = this.isSoloMode();

        if (isSolo) {
            // ── 單人模式（原邏輯不動）─────────────────────────
            if (this.isPlayerOutOfHealth(this.player)) {
                this.triggerGameOver("health");
                return;
            }
            if (this.player && this.player.y >= this.goalY) {
                this.completeLevel();
                return;
            }
            this.remainingTime -= dt;
            if (this.remainingTime <= 0) {
                this.remainingTime = 0;
                this.triggerGameOver("time");
                return;
            }
            this.updateEnemiesAndSpawn(dt, true);
            if (this.graphics) this.drawHud();
            return;
        }

        // ── 多人模式 ──────────────────────────────────────────
        const localNode = this.localPlayerNode;

        if (this.localState === 'playing') {
            if (this.isPlayerOutOfHealth(localNode)) {
                this.setLocalState('dead');
            } else if (localNode && localNode.y >= this.goalY) {
                this.setLocalState('done');
            }
        }

        // 計時
        this.remainingTime -= dt;
        if (this.remainingTime <= 0) {
            this.remainingTime = 0;
            if (this.localState === 'playing')  this.setLocalState('timeout');
            if (this.remoteState === 'playing') this.remoteState = 'timeout';
            this.checkLevelEnd();
            return;
        }

        this.updateEnemiesAndSpawn(dt, true);
        if (this.graphics) this.drawHud();
    }

    lateUpdate() {
        if (!this.hudRoot || !this.cameraNode || !this.canvasNode) return;
        const camWorld = this.cameraNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
        this.hudRoot.setPosition(this.canvasNode.convertToNodeSpaceAR(camWorld));
    }

    // ── 敵人管理 ──────────────────────────────────────────────
    private updateEnemiesAndSpawn(dt: number, doSpawn: boolean) {
        this.enemySearchTimer -= dt;
        if (this.enemySearchTimer <= 0) {
            this.enemySearchTimer = 0.5;
            this.refreshEnemyList();
        }

        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            // In multiplayer, only the host spawns enemies so both sides see identical enemies
            if (doSpawn && (this.isSoloMode() || this.isHost)) this.spawnEnemies();
        }
    }

    private spawnEnemies() {
        if (!this.player || !this.player.isValid) return;
        if (!this.enemyPrefabs || this.enemyPrefabs.length === 0) return;

        const liveCount = this.cachedEnemies.filter(
            e => e && e.isValid && e.activeInHierarchy
        ).length;

        if (liveCount >= this.maxEnemies) return;

        const localY = this.localPlayerNode ? this.localPlayerNode.y : this.player.y;

        // In multiplayer: spawn at both midpoint (C) and leader (A) so both players see enemies
        let remoteY = localY;
        if (!this.isSoloMode()) {
            const nm = (window as any).NM;
            if (nm && nm.remotePlayer && nm.remotePlayer.isValid) {
                remoteY = nm.remotePlayer.y;
            }
        }
        const midY  = (localY + remoteY) * 0.5;
        const leadY = Math.max(localY, remoteY);

        if (liveCount === 0) {
            const want  = this.randomInt(6, 9);
            const count = Math.min(want, this.maxEnemies - liveCount);
            for (let i = 0; i < count; i++) {
                const refY = i % 2 === 0 ? midY : leadY;
                this.spawnOneEnemy(refY + 600, refY + 1200);
            }
        } else {
            const want  = this.randomInt(3, 5);
            const count = Math.min(want, this.maxEnemies - liveCount);
            for (let i = 0; i < count; i++) {
                const refY = i % 2 === 0 ? midY : leadY;
                this.spawnOneEnemy(refY + 600, refY + 1200);
            }
        }

        this.refreshEnemyList();
    }

    private spawnOneEnemy(minY: number, maxY: number) {
        const prefabIndex = this.randomInt(0, this.enemyPrefabs.length - 1);
        const prefab = this.enemyPrefabs[prefabIndex];
        if (!prefab) return;

        const scene = cc.director.getScene();
        if (!scene) return;

        const node = cc.instantiate(prefab);
        scene.addChild(node);

        const spawnX = this.randomRange(this.spawnMinX, this.spawnMaxX);
        const spawnY = this.randomRange(minY, maxY);
        node.setPosition(spawnX, spawnY);

        const id = this.spawnIdCounter++;
        const ship = node.getComponent('Level3EnemyShip') as any;
        if (ship) ship.spawnId = id;

        // Broadcast to client so both machines have identical enemies
        if (!this.isSoloMode()) {
            const nm = (window as any).NM;
            if (nm && nm.room) {
                nm.room.send('l3_enemy_spawn', { prefabIndex, x: spawnX, y: spawnY, spawnId: id });
            }
        }
    }

    /** Client 收到 Host 的敵人生成通知 */
    private spawnOneEnemyFromNetwork(prefabIndex: number, x: number, y: number, spawnId: number) {
        if (!this.enemyPrefabs || prefabIndex < 0 || prefabIndex >= this.enemyPrefabs.length) return;
        const prefab = this.enemyPrefabs[prefabIndex];
        if (!prefab) return;

        const scene = cc.director.getScene();
        if (!scene) return;

        const node = cc.instantiate(prefab);
        scene.addChild(node);
        node.setPosition(x, y);

        const ship = node.getComponent('Level3EnemyShip') as any;
        if (ship) ship.spawnId = spawnId;
    }

    // ── 玩家狀態切換（多人）──────────────────────────────────
    private setLocalState(state: PlayerState) {
        if (this.localState === state) return;
        this.localState = state;
        cc.log(`[Level3Ctrl] 本地玩家狀態 → ${state}`);

        // 廣播給對方
        const nm = (window as any).NM;
        if (nm && nm.room) {
            nm.room.send('l3_player_event', { type: state });
        }

        if (state === 'dead' || state === 'timeout') {
            this.enterSpectateMode('Failed');
        } else if (state === 'done') {
            this.enterSpectateMode('Level Clear');
        }

        this.checkLevelEnd();
    }

    private enterSpectateMode(reason: string) {
        // 停止本地玩家控制並關閉碰撞，讓敵人不再鎖定或擊中已死亡的玩家
        const localNode = this.localPlayerNode;
        if (localNode) {
            const ctrl = localNode.getComponent('Level3SpaceshipController') as any;
            if (ctrl) ctrl.enabled = false;
            const col = localNode.getComponent(cc.CircleCollider);
            if (col) col.enabled = false;
        }

        const remoteNode = this.remotePlayerNode;
        if (remoteNode && remoteNode.isValid) {
            // 切換相機追蹤對方，並立即 snap 到對方位置（避免相機從本地玩家位置緩慢滑過去）
            if (this.cameraNode) {
                const cf = this.cameraNode.getComponent('CameraFollow') as any;
                if (cf) {
                    cf.target = remoteNode;
                    cf.useBounds = false;   // 解除邊界限制，確保能追蹤到對方所在 Y 軸
                    // 立即移動相機到對方目前位置
                    if (this.cameraNode.parent) {
                        const worldPos = remoteNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
                        const lp = this.cameraNode.parent.convertToNodeSpaceAR(worldPos);
                        this.cameraNode.x = lp.x + (cf.offset ? cf.offset.x : 0);
                        this.cameraNode.y = lp.y + (cf.offset ? cf.offset.y : 0);
                    }
                }
            }

            const scene = cc.director.getScene();
            if (scene) {
                // 切換地圖生成器追蹤對方，確保觀戰時畫面有正確地形
                const mapGens = scene.getComponentsInChildren('Level3ProceduralMapGenerator') as any[];
                for (const mg of mapGens) {
                    if (mg) mg.player = remoteNode;
                }

                // 切換 HUD 顯示對方的血量條
                const hud = this.findComponentRecursive(scene, 'Level3PlayerHUD') as any;
                if (hud && typeof hud.switchToPlayer === 'function') {
                    hud.switchToPlayer(remoteNode);
                }
            }
        }

        // 顯示觀戰提示
        this.showSpectateOverlay(`${reason} · Watching...`);
    }

    private showSpectateOverlay(message: string) {
        if (!this.hudRoot) return;
        if (this.spectateOverlay && this.spectateOverlay.isValid) {
            this.spectateOverlay.destroy();
        }

        const overlay = new cc.Node('SpectateOverlay');
        overlay.zIndex = 5000;
        this.hudRoot.addChild(overlay);

        const bg = overlay.addComponent(cc.Graphics);
        const w = 380, h = 50;
        bg.fillColor = cc.color(0, 0, 0, 170);
        bg.rect(-w / 2, -h / 2, w, h);
        bg.fill();

        const labelNode = new cc.Node('SpectateLabel');
        overlay.addChild(labelNode);
        const label = labelNode.addComponent(cc.Label);
        label.string = message;
        label.fontSize = 26;
        label.lineHeight = 32;
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        const outline = labelNode.addComponent(cc.LabelOutline);
        outline.color = cc.Color.BLACK;
        outline.width = 2;

        // 放在畫面頂部
        overlay.setPosition(0, cc.winSize.height * 0.5 - 70);
        this.spectateOverlay = overlay;
    }

    // ── 關卡結算 ──────────────────────────────────────────────
    private checkLevelEnd() {
        if (this.isSoloMode()) return;
        if (this.localState === 'playing' || this.remoteState === 'playing') return;
        if (this.resultSent) return;
        this.resultSent = true;

        const anyFailed = this.localState  === 'dead'    || this.localState  === 'timeout' ||
                          this.remoteState === 'dead'    || this.remoteState === 'timeout';
        const totalHits = this.localHitCount + this.remoteHitCount;

        let deductions = 0;
        if (anyFailed)    deductions++;
        if (totalHits >= 7) deductions++;

        const baseQuality = this.remainingTime >= 100 ? 2 :
                            this.remainingTime >= 50  ? 1 : 0;
        const quality = Math.max(0, baseQuality - deductions);

        cc.log(`[Level3Ctrl] 結算: quality=${quality} base=${baseQuality} -${deductions} | hits=${totalHits} anyFailed=${anyFailed}`);

        const scene = cc.director.getScene();
        const hud = scene ? this.findComponentRecursive(scene, 'Level3PlayerHUD') as any : null;
        GameData.levelTime = Math.floor(this.remainingTime);
        GameData.coins     = hud ? hud.getTotalScore() : 0;
        const idx = GameData.currentLevel - 1;
        if (idx >= 0 && idx < GameData.partQualities.length) {
            GameData.partQualities[idx] = quality;
        }

        this.isGameOver = true;
        cc.log('[Level3Ctrl] 載入 LevelResult...');
        cc.director.loadScene('LevelResult', () => {
            cc.log('[Level3Ctrl] LevelResult 載入成功');
        });
        // 若 LevelResult 載入失敗（場景有缺失 asset）會靜默卡住，
        // 請在 Editor 開啟 LevelResult 場景，移除標有驚嘆號的 asset 參考。
    }

    // ── 單人通關 / 失敗（原邏輯保留）──────────────────────────
    private completeLevel() {
        if (this.isGameOver) return;
        this.isGameOver = true;

        const scene = cc.director.getScene();
        const hud = scene ? this.findComponentRecursive(scene, 'Level3PlayerHUD') as any : null;

        GameData.levelTime = Math.floor(this.remainingTime);
        GameData.coins     = hud ? hud.getTotalScore() : 0;

        const idx = GameData.currentLevel - 1;
        const quality = this.remainingTime >= 100 ? 2 :
                        this.remainingTime >= 50  ? 1 : 0;
        if (idx >= 0 && idx < GameData.partQualities.length) {
            GameData.partQualities[idx] = quality;
        }

        cc.director.loadScene('LevelResult');
    }

    private triggerGameOver(reason: "health" | "time") {
        if (this.isGameOver) return;
        this.isGameOver = true;
        cc.log(`[Level3Ctrl] Game over: ${reason}`);
        cc.director.loadScene(this.gameOverScene || 'GameOver');
    }

    // ── 被打次數追蹤 ──────────────────────────────────────────
    private onLocalPlayerHit(hittedNode: cc.Node) {
        // 只計算本地玩家的被打次數
        if (hittedNode !== this.localPlayerNode) return;
        this.localHitCount++;
        const nm = (window as any).NM;
        if (nm && nm.room) {
            nm.room.send('l3_hit_count', { count: this.localHitCount });
        }
    }

    // ── 網路事件接收 ──────────────────────────────────────────
    private onNetEnemySpawn(data: any) {
        // Client receives host's spawn and creates the identical enemy
        this.spawnOneEnemyFromNetwork(data.prefabIndex, data.x, data.y, data.spawnId);
    }

    private onNetEnemyKill(data: any) {
        // Find the enemy with matching spawnId and kill it locally
        this.refreshEnemyList();
        for (const enemy of this.cachedEnemies) {
            if (!enemy || !enemy.isValid) continue;
            const ship = enemy.getComponent('Level3EnemyShip') as any;
            if (ship && ship.spawnId === data.spawnId) {
                ship._fromNetwork = true;
                ship.takeDamage(9999);
                break;
            }
        }
    }

    private onNetHitCount(data: any) {
        this.remoteHitCount = data.count;
    }

    private onNetPlayerEvent(data: any) {
        const type = data.type as PlayerState;
        if (this.remoteState === type) return;
        this.remoteState = type;
        cc.log(`[Level3Ctrl] 遠端玩家狀態 → ${type}`);
        if (type !== 'playing') this.checkLevelEnd();
    }

    private onNetLevelEnd(data: any) {
        if (this.resultSent) return;
        this.resultSent = true;
        GameData.levelTime = data.levelTime || 0;
        GameData.coins     = data.coins     || 0;
        const idx = GameData.currentLevel - 1;
        if (idx >= 0 && idx < GameData.partQualities.length) {
            GameData.partQualities[idx] = data.quality || 0;
        }
        this.isGameOver = true;
        cc.director.loadScene('LevelResult');
    }

    // ── 工具 getter ───────────────────────────────────────────
    private get localPlayerNode(): cc.Node {
        const nm = (window as any).NM;
        if (nm && nm.localPlayer && nm.localPlayer.isValid) return nm.localPlayer;
        return this.player;
    }

    private get remotePlayerNode(): cc.Node {
        const nm = (window as any).NM;
        if (nm && nm.remotePlayer && nm.remotePlayer.isValid) return nm.remotePlayer;
        return this.player2;
    }

    private get isHost(): boolean {
        return this.isSoloMode() || GameData.playerId === 0;
    }

    private isSoloMode(): boolean {
        return GameData.isSolo !== false;
    }

    // ── 敵人清單 ──────────────────────────────────────────────
    private isPlayerOutOfHealth(playerNode: cc.Node): boolean {
        if (!playerNode || !playerNode.isValid) return false;
        const components = playerNode.getComponents(cc.Component);
        for (const comp of components) {
            const provider = comp as any;
            if (typeof provider.getResourceState !== 'function') continue;
            const state = provider.getResourceState();
            return !!state && Number(state.health) <= 0;
        }
        return false;
    }

    private refreshEnemyList() {
        this.cachedEnemies = [];
        const scene = cc.director.getScene();
        if (scene) {
            // 從 scene.children 開始（而非 scene 本身），避免 deprecated Scene.getComponent 警告
            for (const child of scene.children) {
                this.findEnemiesInNode(child);
            }
        }
    }

    private findEnemiesInNode(node: cc.Node) {
        if (!node) return;
        if (node.getComponent('Level3EnemyShip')) {
            this.cachedEnemies.push(node);
        }
        for (const child of node.children) {
            this.findEnemiesInNode(child);
        }
    }

    // ── HUD 繪製 ──────────────────────────────────────────────
    private drawHud() {
        const g = this.graphics;
        g.clear();

        const hw      = cc.winSize.width  * 0.5;
        const hh      = cc.winSize.height * 0.5;
        const barY    = -hh + this.barMarginBottom;
        const barLeft = -hw + this.barMarginX;
        const barRight =  hw - this.barMarginX;
        const barWidth = barRight - barLeft;
        const range    = Math.max(1, this.goalY - this.startY);

        // 進度橫線 + 刻度
        g.strokeColor = cc.Color.WHITE;
        g.lineWidth   = 4;
        g.moveTo(barLeft, barY);
        g.lineTo(barRight, barY);
        for (let i = 0; i <= 4; i++) {
            const tx = barLeft + (i / 4) * barWidth;
            g.moveTo(tx, barY);
            g.lineTo(tx, barY + this.tickHeight);
        }
        g.stroke();

        // 本地玩家三角形（藍色）
        const localNode = this.localPlayerNode;
        if (localNode && localNode.isValid && this.localState !== 'dead') {
            const t = cc.misc.clampf((localNode.y - this.startY) / range, 0, 1);
            this.drawTriangle(g, barLeft + t * barWidth, barY,
                this.playerTriSize, cc.color(80, 140, 255));
        }

        // 遠端玩家三角形（橘色）
        const remoteNode = this.remotePlayerNode;
        if (remoteNode && remoteNode.isValid && this.remoteState !== 'dead') {
            const t = cc.misc.clampf((remoteNode.y - this.startY) / range, 0, 1);
            this.drawTriangle(g, barLeft + t * barWidth, barY,
                this.playerTriSize, cc.color(255, 160, 40));
        }

        // 敵人三角形（紅色）
        for (const enemy of this.cachedEnemies) {
            if (!enemy || !enemy.isValid || !enemy.activeInHierarchy) continue;
            const t = cc.misc.clampf((enemy.y - this.startY) / range, 0, 1);
            this.drawTriangle(g, barLeft + t * barWidth, barY,
                this.enemyTriSize, cc.Color.RED);
        }

        // 計時條
        const timerY    = barY - this.timerBarGap;
        const timeRatio = this.remainingTime / this.gameDuration;
        g.strokeColor   = this.getTimerColor(timeRatio);
        g.lineWidth     = this.timerBarThickness;
        g.moveTo(barLeft, timerY);
        g.lineTo(barLeft + timeRatio * barWidth, timerY);
        g.stroke();
    }

    private drawTriangle(g: cc.Graphics, tipX: number, tipY: number, size: number, color: cc.Color) {
        g.fillColor = color;
        g.moveTo(tipX,          tipY);
        g.lineTo(tipX - size,   tipY + size * 1.6);
        g.lineTo(tipX + size,   tipY + size * 1.6);
        g.close();
        g.fill();
    }

    private getTimerColor(ratio: number): cc.Color {
        if (ratio >= 0.5) {
            const t = (ratio - 0.5) / 0.5;
            return cc.color(Math.round(255 * (1 - t)), 255, 0);
        } else {
            const t = ratio / 0.5;
            return cc.color(255, Math.round(255 * t), 0);
        }
    }

    // ── 工具方法 ──────────────────────────────────────────────
    private findComponentRecursive(node: cc.Node, componentName: string): any {
        if (!node) return null;
        // Scene 根節點本身不掛 component，呼叫 getComponent 會觸發 deprecated 警告
        if (node !== cc.director.getScene()) {
            const c = node.getComponent(componentName);
            if (c) return c;
        }
        for (let i = 0; i < node.childrenCount; i++) {
            const found = this.findComponentRecursive(node.children[i], componentName);
            if (found) return found;
        }
        return null;
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private randomRange(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    onDestroy() {
        cc.director.off('level3-player-hit',   this.onLocalPlayerHit, this);
        cc.director.off('net-l3-enemy-spawn',  this.onNetEnemySpawn,  this);
        cc.director.off('net-l3-enemy-kill',   this.onNetEnemyKill,   this);
        cc.director.off('net-l3-hit-count',    this.onNetHitCount,    this);
        cc.director.off('net-l3-player-event', this.onNetPlayerEvent, this);
        cc.director.off('net-l3-level-end',    this.onNetLevelEnd,    this);
        if (this.hudRoot && this.hudRoot.isValid) this.hudRoot.destroy();
    }

}
