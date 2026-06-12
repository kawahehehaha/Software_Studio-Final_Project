/**
 * Level 3 player resource HUD.
 *
 * Attach this component to Canvas or Main Camera, assign the Player node and
 * the four Pixel Bar outline/fill pairs.
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass, property } = cc._decorator;

interface Level3ResourceState {
    health: number;
    maxHealth: number;
    stamina: number;
    maxStamina: number;
    ammo: number;
    maxAmmo: number;
    shield: number;
    maxShield: number;
}

@ccclass
export default class Level3PlayerHUD extends cc.Component {
    @property(cc.Node)
    player: cc.Node = null;

    @property(cc.Node)
    cameraNode: cc.Node = null;

    @property(cc.SpriteFrame)
    healthBarOutline: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    healthBarFill: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    staminaBarOutline: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    staminaBarFill: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    ammoBarOutline: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    ammoBarFill: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    shieldBarOutline: cc.SpriteFrame = null;

    @property(cc.SpriteFrame)
    shieldBarFill: cc.SpriteFrame = null;

    @property([cc.SpriteFrame])
    enemyKillIconFrames: cc.SpriteFrame[] = [];

    @property([cc.SpriteFrame])
    killDigitFrames: cc.SpriteFrame[] = [];

    @property(cc.SpriteFrame)
    killMultiplyFrame: cc.SpriteFrame = null;

    @property([cc.Integer])
    enemyScoreValues: number[] = [1, 2, 3, 4];

    @property
    killRightMargin = 24;

    @property
    killTopMargin = 24;

    @property
    killRowGap = 62;

    @property
    killIconSize = 48;

    @property
    killDigitWidth = 22;

    @property
    killDigitHeight = 28;

    @property
    killDigitGap = 2;

    @property
    leftMargin = 24;

    @property
    topMargin = 24;

    @property
    barWidth = 150;

    @property
    barHeight = 30;

    @property
    barGap = 12;

    @property
    fillHeightRatio = 0.066;

    @property
    debugVisible = false;

    private hudRoot: cc.Node = null;
    private fills: { [key: string]: cc.Sprite } = {};
    private killValueRoots: cc.Node[] = [];
    private killFallbackLabels: cc.Label[] = [];
    private killCounts = [0, 0, 0, 0];
    private totalScore = 0;

    onLoad() {
        if (!this.player) {
            this.player = cc.find("Player");
        }
        if (!this.cameraNode) {
            this.cameraNode = cc.find("Canvas/Main Camera");
        }

        this.raiseCanvasAboveWorld();
        cc.systemEvent.on(
            "level3-enemy-killed",
            this.onEnemyKilled,
            this
        );
        this.createHud();
        this.refresh();
        
    }
    start() {
        // 播放BGM
        AudioBroadcast.playBgm("level3_bgm");
    }

    onDestroy() {
        cc.systemEvent.off(
            "level3-enemy-killed",
            this.onEnemyKilled,
            this
        );
    }

    update() {
        this.refresh();
    }

    lateUpdate() {
        this.syncHudToCamera();
    }

    private createHud() {
        const parent = this.findCanvas();
        this.hudRoot = new cc.Node("Level3 Player HUD");
        this.hudRoot.zIndex = 20000;
        this.hudRoot.setAnchorPoint(0.5, 0.5);
        this.hudRoot.setPosition(0, 0);
        this.hudRoot.group = parent.group;
        parent.addChild(this.hudRoot);
        this.hudRoot.setSiblingIndex(parent.childrenCount - 1);

        const leftX = -cc.winSize.width * 0.5 + this.leftMargin;
        const topY = cc.winSize.height * 0.5 - this.topMargin;
        const step = this.barHeight + this.barGap;

        this.createBar(
            "health",
            this.healthBarOutline,
            this.healthBarFill,
            leftX,
            topY
        );
        this.createBar(
            "stamina",
            this.staminaBarOutline,
            this.staminaBarFill,
            leftX,
            topY - step
        );
        this.createBar(
            "ammo",
            this.ammoBarOutline,
            this.ammoBarFill,
            leftX,
            topY - step * 2
        );
        this.createBar(
            "shield",
            this.shieldBarOutline,
            this.shieldBarFill,
            leftX,
            topY - step * 3
        );
        this.createKillCounters();
        this.createDebugMarker();
        this.syncHudToCamera();

        cc.log(
            `[Level3PlayerHUD] created bars=`
            + `${Object.keys(this.fills).length}, parent=${parent.name}`
        );
    }

    public getKillCounts(): number[] {
        return this.killCounts.slice();
    }

    public getTotalScore(): number {
        return this.totalScore;
    }

    /** 觀戰模式：切換 HUD 追蹤的目標玩家（顯示對方的血量條） */
    public switchToPlayer(newPlayer: cc.Node) {
        if (!newPlayer || !newPlayer.isValid) return;
        this.player = newPlayer;
    }

    private onEnemyKilled(enemyTypeIndex: number) {
        const index = Math.floor(Number(enemyTypeIndex));
        if (index < 0 || index >= this.killCounts.length) return;

        this.killCounts[index] += 1;
        const score = this.enemyScoreValues[index] || 0;
        this.totalScore += Math.max(0, score);
        this.drawKillCount(index);
        cc.systemEvent.emit(
            "level3-score-changed",
            this.totalScore,
            this.getKillCounts()
        );
    }

    private createKillCounters() {
        const rightX = cc.winSize.width * 0.5 - this.killRightMargin;
        const topY = cc.winSize.height * 0.5 - this.killTopMargin;

        for (let index = 0; index < 4; index += 1) {
            const row = new cc.Node(`Enemy Type ${index + 1} Kills`);
            row.setAnchorPoint(1, 0.5);
            row.setPosition(rightX, topY - this.killRowGap * index);
            this.hudRoot.addChild(row);

            this.createSizedSprite(
                row,
                "Enemy Icon",
                this.enemyKillIconFrames[index],
                -118,
                0,
                this.killIconSize,
                this.killIconSize
            );

            if (this.killMultiplyFrame) {
                this.createSizedSprite(
                    row,
                    "Multiply",
                    this.killMultiplyFrame,
                    -73,
                    0,
                    this.killDigitWidth,
                    this.killDigitHeight
                );
            } else {
                const multiply = new cc.Node("Multiply Fallback");
                multiply.setPosition(-73, 0);
                row.addChild(multiply);
                const label = multiply.addComponent(cc.Label);
                label.string = "x";
                label.fontSize = 22;
                label.lineHeight = 24;
            }

            const valueRoot = new cc.Node("Kill Count");
            valueRoot.setAnchorPoint(1, 0.5);
            valueRoot.setPosition(0, 0);
            row.addChild(valueRoot);
            this.killValueRoots[index] = valueRoot;

            const fallback = valueRoot.addComponent(cc.Label);
            fallback.fontSize = 24;
            fallback.lineHeight = 28;
            fallback.horizontalAlign = cc.Label.HorizontalAlign.RIGHT;
            const outline = valueRoot.addComponent(cc.LabelOutline);
            outline.color = cc.Color.BLACK;
            outline.width = 2;
            this.killFallbackLabels[index] = fallback;
            this.drawKillCount(index);
        }
    }

    private drawKillCount(index: number) {
        const root = this.killValueRoots[index];
        const label = this.killFallbackLabels[index];
        if (!root || !label) return;

        const text = Math.max(0, this.killCounts[index]).toString();
        if (!this.hasKillDigitFrames()) {
            label.enabled = true;
            label.string = text;
            return;
        }

        label.enabled = false;
        root.removeAllChildren();
        const step = this.killDigitWidth + this.killDigitGap;
        for (let digitIndex = 0; digitIndex < text.length; digitIndex += 1) {
            const digit = parseInt(text.charAt(digitIndex), 10);
            this.createSizedSprite(
                root,
                `Digit ${text.charAt(digitIndex)}`,
                this.killDigitFrames[digit],
                -(text.length - digitIndex - 0.5) * step,
                0,
                this.killDigitWidth,
                this.killDigitHeight
            );
        }
    }

    private hasKillDigitFrames(): boolean {
        if (!this.killDigitFrames || this.killDigitFrames.length < 10) {
            return false;
        }
        for (let index = 0; index < 10; index += 1) {
            if (!this.killDigitFrames[index]) return false;
        }
        return true;
    }

    private createSizedSprite(
        parent: cc.Node,
        name: string,
        frame: cc.SpriteFrame,
        x: number,
        y: number,
        width: number,
        height: number
    ): cc.Node {
        const node = new cc.Node(name);
        node.setPosition(x, y);
        parent.addChild(node);
        if (!frame) return node;

        const sprite = node.addComponent(cc.Sprite);
        sprite.spriteFrame = frame;
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        node.setContentSize(width, height);
        return node;
    }

    private createBar(
        key: string,
        outlineFrame: cc.SpriteFrame,
        fillFrame: cc.SpriteFrame,
        x: number,
        y: number
    ) {
        if (!outlineFrame || !fillFrame) {
            cc.warn(`[Level3PlayerHUD] missing ${key} sprites`);
            return;
        }

        const container = new cc.Node(`${key} Bar`);
        container.setAnchorPoint(0, 0.5);
        container.setPosition(x, y);
        this.hudRoot.addChild(container);

        const outlineRect = outlineFrame.getRect();
        const outlineHeight = outlineRect.width > 0
            ? this.barWidth * outlineRect.height / outlineRect.width
            : this.barHeight;

        const fillNode = new cc.Node(`${key} Fill`);
        fillNode.setAnchorPoint(0, 0.5);
        fillNode.setPosition(this.barWidth * 0.2, 0);
        container.addChild(fillNode);

        const fillHeight = Math.max(
            3,
            this.barWidth * this.fillHeightRatio
        );
        const fill = fillNode.addComponent(cc.Sprite);
        fill.spriteFrame = fillFrame;
        fill.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        fillNode.setContentSize(
            this.barWidth * 0.8,
            fillHeight
        );
        fill.type = cc.Sprite.Type.FILLED;
        fill.fillType = cc.Sprite.FillType.HORIZONTAL;
        fill.fillStart = 0;
        fill.fillRange = 1;
        this.fills[key] = fill;

        const outlineNode = new cc.Node(`${key} Outline`);
        outlineNode.setAnchorPoint(0, 0.5);
        container.addChild(outlineNode);

        const outline = outlineNode.addComponent(cc.Sprite);
        outline.spriteFrame = outlineFrame;
        outline.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        outlineNode.setContentSize(this.barWidth, outlineHeight);
    }

    private refresh() {
        if (!this.player || !this.player.isValid) return;

        const components = this.player.getComponents(cc.Component);
        let state: Level3ResourceState = null;

        for (const component of components) {
            const provider = component as any;
            if (typeof provider.getResourceState === "function") {
                state = provider.getResourceState();
                break;
            }
        }
        if (!state) return;

        this.setFill("health", state.health, state.maxHealth);
        this.setFill("stamina", state.stamina, state.maxStamina);
        this.setFill("ammo", state.ammo, state.maxAmmo);
        this.setFill("shield", state.shield, state.maxShield);
    }

    private setFill(key: string, value: number, maximum: number) {
        const fill = this.fills[key];
        if (!fill) return;
        fill.fillRange = maximum > 0
            ? cc.misc.clampf(value / maximum, 0, 1)
            : 0;
    }

    private findCanvas(): cc.Node {
        return cc.find("Canvas") || this.node;
    }

    private raiseCanvasAboveWorld() {
        const canvas = this.findCanvas();
        const scene = cc.director.getScene();
        if (!scene || canvas.parent !== scene) return;

        canvas.zIndex = 20000;
        canvas.setSiblingIndex(scene.childrenCount - 1);
    }

    private syncHudToCamera() {
        if (!this.hudRoot || !this.cameraNode) return;

        const canvas = this.findCanvas();
        const cameraWorld = this.cameraNode.convertToWorldSpaceAR(
            cc.Vec2.ZERO
        );
        this.hudRoot.setPosition(canvas.convertToNodeSpaceAR(cameraWorld));
    }

    private createDebugMarker() {
        if (!this.debugVisible || !this.hudRoot) return;

        const marker = new cc.Node("HUD Debug Marker");
        marker.zIndex = 30000;
        marker.setPosition(0, 0);
        this.hudRoot.addChild(marker);

        const graphics = marker.addComponent(cc.Graphics);
        graphics.fillColor = cc.Color.RED;
        graphics.rect(-15, -15, 30, 30);
        graphics.fill();
    }

}
