/**
 * TorchFlicker.ts
 * Scene: Any scene containing an animated torch.
 * Attach to: The torch Sprite node.
 * Alternates two sprite frames to create a lightweight flame flicker.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        frameA: {
            default: null,
            type: cc.SpriteFrame
        },
        frameB: {
            default: null,
            type: cc.SpriteFrame
        },
        frameInterval: 0.18,
        randomStartFrame: true
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite);
        this.showFrame(this.randomStartFrame && Math.random() >= 0.5);
    },

    onEnable: function () {
        this.unschedule(this.toggleFrame);
        this.schedule(this.toggleFrame, Math.max(this.frameInterval, 0.03));
    },

    onDisable: function () {
        this.unschedule(this.toggleFrame);
    },

    toggleFrame: function () {
        if (!this.sprite || !this.frameA || !this.frameB) {
            return;
        }

        this.sprite.spriteFrame = this.sprite.spriteFrame === this.frameA
            ? this.frameB
            : this.frameA;
    },

    showFrame: function (useFrameB) {
        if (!this.sprite) {
            return;
        }

        var frame = useFrameB ? this.frameB : this.frameA;
        if (frame) {
            this.sprite.spriteFrame = frame;
        }
    }
});
