/**
 * Plays a horizontal planet sprite sheet and adds subtle background motion.
 *
 * Attach this component to a node with cc.Sprite, then assign the raw
 * Texture2D asset instead of its SpriteFrame in the Inspector.
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class PlanetBackgroundAnimator extends cc.Component {
    @property(cc.Sprite)
    sprite: cc.Sprite = null;

    @property(cc.Texture2D)
    texture: cc.Texture2D = null;

    @property
    frameWidth = 100;

    @property
    frameHeight = 100;

    @property
    frameCount = 50;

    @property
    framesPerSecond = 12;

    @property
    randomStartFrame = true;

    @property
    driftRangeX = 10;

    @property
    driftRangeY = 6;

    @property
    driftSpeed = 0.35;

    @property
    scalePulseAmount = 0.015;

    @property
    scalePulseSpeed = 0.6;

    private frames: cc.SpriteFrame[] = [];
    private currentFrame = 0;
    private frameElapsed = 0;
    private elapsed = 0;
    private startPosition = cc.v2();
    private startScaleX = 1;
    private startScaleY = 1;
    private phase = 0;

    onLoad() {
        if (!this.sprite) {
            this.sprite = this.getComponent(cc.Sprite);
        }

        this.startPosition = cc.v2(this.node.x, this.node.y);
        this.startScaleX = this.node.scaleX;
        this.startScaleY = this.node.scaleY;
        this.phase = Math.random() * Math.PI * 2;
        this.buildFrames();
    }

    private buildFrames() {
        this.frames.length = 0;

        if (!this.sprite || !this.texture || this.frameCount <= 0) {
            cc.warn(`[PlanetBackgroundAnimator] ${this.node.name} 缺少 Sprite 或 Texture`);
            return;
        }

        const textureWidth = this.texture.width;
        const availableFrames = Math.floor(textureWidth / this.frameWidth);
        const count = Math.min(this.frameCount, availableFrames);

        for (let index = 0; index < count; index++) {
            const rect = cc.rect(
                index * this.frameWidth,
                0,
                this.frameWidth,
                this.frameHeight
            );
            this.frames.push(new cc.SpriteFrame(this.texture, rect));
        }

        if (this.frames.length === 0) return;

        this.currentFrame = this.randomStartFrame
            ? Math.floor(Math.random() * this.frames.length)
            : 0;
        this.node.setContentSize(this.frameWidth, this.frameHeight);

        this.sprite.enabled = true;
        this.sprite.spriteFrame = this.frames[this.currentFrame];
    }

    update(dt: number) {
        this.elapsed += dt;
        this.updateFrame(dt);
        this.updateMotion();
    }

    public resetForSpawn() {
        this.startPosition = cc.v2(this.node.x, this.node.y);
        this.startScaleX = this.node.scaleX;
        this.startScaleY = this.node.scaleY;
        this.elapsed = 0;
        this.frameElapsed = 0;
        this.phase = Math.random() * Math.PI * 2;

        if (this.frames.length > 0 && this.sprite) {
            this.currentFrame = this.randomStartFrame
                ? Math.floor(Math.random() * this.frames.length)
                : 0;
            this.sprite.spriteFrame = this.frames[this.currentFrame];
        }
    }

    private updateFrame(dt: number) {
        if (this.frames.length <= 1 || this.framesPerSecond <= 0) return;

        this.frameElapsed += dt;
        const frameDuration = 1 / this.framesPerSecond;

        while (this.frameElapsed >= frameDuration) {
            this.frameElapsed -= frameDuration;
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.sprite.spriteFrame = this.frames[this.currentFrame];
        }
    }

    private updateMotion() {
        const wave = this.elapsed * this.driftSpeed + this.phase;
        const x = this.startPosition.x + Math.sin(wave) * this.driftRangeX;
        const y = this.startPosition.y + Math.cos(wave * 0.73) * this.driftRangeY;
        const pulse = 1 + Math.sin(
            this.elapsed * this.scalePulseSpeed + this.phase
        ) * this.scalePulseAmount;

        this.node.setPosition(x, y);
        this.node.scaleX = this.startScaleX * pulse;
        this.node.scaleY = this.startScaleY * pulse;
    }
}
