import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class Level3Ctrl extends cc.Component {

    @property(cc.Node)
    player: cc.Node = null;

    /** 勝利條件：玩家 Y 軸達到此值即通關 */
    @property
    goalY: number = 7000;

    /** 遊戲時限（秒）—— 可在 Inspector 直接修改 */
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
    /** 計時條與進度線之間的距離 */
    @property timerBarGap:       number = 12;
    /** 計時條粗細 */
    @property timerBarThickness: number = 8;

    // ── 敵人生成 ──────────────────────────────────────────────
    /** 敵人 Prefab 池（可在 Inspector 拖入多種敵艦） */
    @property([cc.Prefab])
    enemyPrefabs: cc.Prefab[] = [];

    /** 生成敵人的 X 範圍最小值（世界座標） */
    @property spawnMinX: number = -380;
    /** 生成敵人的 X 範圍最大值（世界座標） */
    @property spawnMaxX: number =  380;

    /** 每隔幾秒檢查並補充敵人 */
    @property spawnInterval: number = 10;

    /** 場上敵人上限 */
    @property maxEnemies: number = 6;

    // ── 私有狀態 ──────────────────────────────────────────────
    private startY:         number   = 0;
    private remainingTime:  number   = 0;
    private isComplete:     boolean  = false;
    private isTimeUp:       boolean  = false;
    private isGameOver:     boolean  = false;
    private canvasNode:     cc.Node  = null;
    private cameraNode:     cc.Node  = null;
    private hudRoot:        cc.Node  = null;
    private graphics:       cc.Graphics = null;
    private enemySearchTimer: number  = 0;
    private cachedEnemies:  cc.Node[] = [];
    private spawnTimer:     number   = 0;

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
    }

    update(dt: number) {
        if (this.isComplete || this.isGameOver) return;

        if (this.isPlayerOutOfHealth()) {
            this.triggerGameOver("health");
            return;
        }

        // 勝利判定
        if (this.player && this.player.y >= this.goalY) {
            this.completeLevel();
            return;
        }

        // 倒數計時
        this.remainingTime -= dt;
        if (this.remainingTime <= 0) {
            this.remainingTime = 0;
            this.onTimeUp();
            return;
        }

        // 每 0.5 秒刷新敵人清單
        this.enemySearchTimer -= dt;
        if (this.enemySearchTimer <= 0) {
            this.enemySearchTimer = 0.5;
            this.refreshEnemyList();
        }

        // 每 spawnInterval 秒補充敵人
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnEnemies();
        }

        if (this.graphics) {
            this.drawHud();
        }
    }

    lateUpdate() {
        if (!this.hudRoot || !this.cameraNode || !this.canvasNode) return;
        const camWorld = this.cameraNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
        this.hudRoot.setPosition(this.canvasNode.convertToNodeSpaceAR(camWorld));
    }

    // ── 繪製 HUD ────────────────────────────────────────────────

    private drawHud() {
        const g = this.graphics;
        g.clear();

        const hw       = cc.winSize.width  * 0.5;
        const hh       = cc.winSize.height * 0.5;
        const barY     = -hh + this.barMarginBottom;
        const barLeft  = -hw + this.barMarginX;
        const barRight =  hw - this.barMarginX;
        const barWidth = barRight - barLeft;
        const range    = Math.max(1, this.goalY - this.startY);

        // ── 進度橫線 + 刻度線（刻度在三角形同側：上方）──────────
        g.strokeColor = cc.Color.WHITE;
        g.lineWidth   = 4;

        g.moveTo(barLeft, barY);
        g.lineTo(barRight, barY);

        for (let i = 0; i <= 4; i++) {
            const tx = barLeft + (i / 4) * barWidth;
            g.moveTo(tx, barY);
            g.lineTo(tx, barY + this.tickHeight);   // 往上，與三角形同側
        }
        g.stroke();

        // ── 藍色玩家三角形 ▼ ────────────────────────────────────
        if (this.player) {
            const t  = cc.misc.clampf((this.player.y - this.startY) / range, 0, 1);
            this.drawTriangle(g, barLeft + t * barWidth, barY,
                this.playerTriSize, cc.color(80, 140, 255));
        }

        // ── 紅色敵人三角形 ▼（多個）────────────────────────────
        for (const enemy of this.cachedEnemies) {
            if (!enemy || !enemy.isValid || !enemy.activeInHierarchy) continue;
            const t  = cc.misc.clampf((enemy.y - this.startY) / range, 0, 1);
            this.drawTriangle(g, barLeft + t * barWidth, barY,
                this.enemyTriSize, cc.Color.RED);
        }

        // ── 計時條（進度線下方）─────────────────────────────────
        const timerY    = barY - this.timerBarGap;
        const timeRatio = this.remainingTime / this.gameDuration;

        g.strokeColor = this.getTimerColor(timeRatio);
        g.lineWidth   = this.timerBarThickness;
        g.moveTo(barLeft, timerY);
        g.lineTo(barLeft + timeRatio * barWidth, timerY);
        g.stroke();
    }

    /** 倒三角形 ▼：尖端緊貼橫線，主體往上 */
    private drawTriangle(
        g:     cc.Graphics,
        tipX:  number,
        tipY:  number,
        size:  number,
        color: cc.Color
    ) {
        g.fillColor = color;
        g.moveTo(tipX,         tipY);
        g.lineTo(tipX - size,  tipY + size * 1.6);
        g.lineTo(tipX + size,  tipY + size * 1.6);
        g.close();
        g.fill();
    }

    /**
     * ratio 1.0 → 0.5：綠色漸變為黃色
     * ratio 0.5 → 0.0：黃色漸變為紅色
     */
    private getTimerColor(ratio: number): cc.Color {
        if (ratio >= 0.5) {
            const t = (ratio - 0.5) / 0.5;           // 1=滿格 0=半格
            return cc.color(Math.round(255 * (1 - t)), 255, 0);   // 綠→黃
        } else {
            const t = ratio / 0.5;                    // 1=半格 0=空格
            return cc.color(255, Math.round(255 * t), 0);          // 黃→紅
        }
    }

    // ── 遊戲事件 ────────────────────────────────────────────────

    private onTimeUp() {
        if (this.isTimeUp || this.isGameOver) return;
        this.isTimeUp = true;

        // 專屬時間到事件，可在其他腳本監聽
        cc.director.emit("level3-time-up");
        cc.log("[Level3Ctrl] 時間到！");

        this.triggerGameOver("time");
    }

    private completeLevel() {
        if (this.isComplete || this.isGameOver) return;
        this.isComplete = true;

        var scene = cc.director.getScene();
        var hud = scene && this.findComponentRecursive(scene, 'Level3PlayerHUD');

        var GameData = require('GameData').default;
        GameData.levelTime    = Math.floor(this.remainingTime);
        GameData.coins        = hud.getTotalScore();

        // 品質：用 stars 數換算
        var levelIndex   = GameData.currentLevel - 1;
        var quality      = this.remainingTime >= 100 ? 2 : this.remainingTime >= 50 ? 1 : 0;
        GameData.partQualities[levelIndex] = quality;

        cc.director.loadScene("LevelResult");
    }

    private findComponentRecursive(node: cc.Node, componentName: string): any {
        if (!node) return null;

        const c = node.getComponent(componentName);
        if (c) return c;

        for (let i = 0; i < node.childrenCount; i++) {
            const found = this.findComponentRecursive(node.children[i], componentName);
            if (found) return found;
        }

        return null;
    }

    // ── 敵人清單 ────────────────────────────────────────────────

    private isPlayerOutOfHealth(): boolean {
        if (!this.player || !this.player.isValid) return false;

        const components = this.player.getComponents(cc.Component);
        for (const component of components) {
            const provider = component as any;
            if (typeof provider.getResourceState !== "function") continue;

            const state = provider.getResourceState();
            return !!state && Number(state.health) <= 0;
        }
        return false;
    }

    private triggerGameOver(reason: "health" | "time") {
        if (this.isGameOver || this.isComplete) return;
        this.isGameOver = true;

        cc.director.emit("level3-game-over", reason);
        const sceneName = (this.gameOverScene || "GameOver").trim();
        cc.log(`[Level3Ctrl] Game over: ${reason}`);
        cc.director.loadScene(sceneName);
    }

    private refreshEnemyList() {
        this.cachedEnemies = [];
        const scene = cc.director.getScene();
        if (scene) this.findEnemiesInNode(scene);
    }

    private findEnemiesInNode(node: cc.Node) {
        if (!node) return;
        if (node.getComponent("Level3EnemyShip")) {
            this.cachedEnemies.push(node);
        }
        for (const child of node.children) {
            this.findEnemiesInNode(child);
        }
    }

    // ── 敵人生成 ────────────────────────────────────────────────

    private spawnEnemies() {
        if (!this.player || !this.player.isValid) return;
        if (!this.enemyPrefabs || this.enemyPrefabs.length === 0) return;

        // 過濾出仍然存活的敵人
        const liveCount = this.cachedEnemies.filter(
            e => e && e.isValid && e.activeInHierarchy
        ).length;

        // 已達上限，不再生成
        if (liveCount >= this.maxEnemies) return;

        if (liveCount === 0) {
            // 沒有敵人：一次補充 4~5 隻，Y 在 playerY+600 ~ playerY+1200
            const want  = this.randomInt(3, 4);
            const count = Math.min(want, this.maxEnemies - liveCount);
            for (let i = 0; i < count; i++) {
                this.spawnOneEnemy(this.player.y + 600, this.player.y + 1200);
            }
        } else {
            // 還有敵人：補充 1~2 隻，Y 在 playerY+600 ~ playerY+1200
            const want  = this.randomInt(1, 2);
            const count = Math.min(want, this.maxEnemies - liveCount);
            for (let i = 0; i < count; i++) {
                this.spawnOneEnemy(this.player.y + 600, this.player.y + 1200);
            }
        }

        // 立即刷新敵人清單，讓進度條紅色三角形即時更新
        this.refreshEnemyList();
    }

    private spawnOneEnemy(minY: number, maxY: number) {
        const prefab = this.enemyPrefabs[
            this.randomInt(0, this.enemyPrefabs.length - 1)
        ];
        if (!prefab) return;

        const scene = cc.director.getScene();
        if (!scene) return;

        const node = cc.instantiate(prefab);
        scene.addChild(node);

        const spawnX = this.randomRange(this.spawnMinX, this.spawnMaxX);
        const spawnY = this.randomRange(minY, maxY);
        node.setPosition(spawnX, spawnY);
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private randomRange(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    onDestroy() {
        if (this.hudRoot && this.hudRoot.isValid) {
            this.hudRoot.destroy();
        }
    }
}
