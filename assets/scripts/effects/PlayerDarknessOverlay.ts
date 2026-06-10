/**
 * PlayerDarknessOverlay.ts
 * Scene: Secret-room gameplay areas.
 * Attach to: A runtime overlay node created for the current player.
 * Follows the player and leaves a configurable visible area inside a dark screen.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        player: {
            default: null,
            type: cc.Node
        },
        visibleWidth: 300,
        visibleHeight: 220,
        coverSize: 6000,
        darknessOpacity: 235,
        followSpeed: 12,
        overlayZIndex: 15000
    },

    onLoad: function () {
        this.node.zIndex = this.overlayZIndex;
        this.createDarknessPanels();
    },

    lateUpdate: function (dt) {
        if (!this.player || !cc.isValid(this.player) || !this.node.parent) {
            return;
        }

        var playerWorld = this.player.convertToWorldSpaceAR(cc.v2());
        var target = this.node.parent.convertToNodeSpaceAR(playerWorld);
        var blend = 1 - Math.exp(-this.followSpeed * dt);
        this.node.x = cc.misc.lerp(this.node.x, target.x, blend);
        this.node.y = cc.misc.lerp(this.node.y, target.y, blend);
    },

    createDarknessPanels: function () {
        this.node.removeAllChildren();

        var halfVisibleWidth = this.visibleWidth / 2;
        var halfVisibleHeight = this.visibleHeight / 2;
        var halfCover = this.coverSize / 2;

        this.createPanel(
            'Darkness Left',
            -halfVisibleWidth - halfCover,
            0,
            this.coverSize,
            this.coverSize
        );
        this.createPanel(
            'Darkness Right',
            halfVisibleWidth + halfCover,
            0,
            this.coverSize,
            this.coverSize
        );
        this.createPanel(
            'Darkness Top',
            0,
            halfVisibleHeight + halfCover,
            this.visibleWidth,
            this.coverSize
        );
        this.createPanel(
            'Darkness Bottom',
            0,
            -halfVisibleHeight - halfCover,
            this.visibleWidth,
            this.coverSize
        );
    },

    createPanel: function (name, x, y, width, height) {
        var panel = new cc.Node(name);
        panel.setPosition(x, y);
        panel.width = width;
        panel.height = height;
        panel.opacity = this.darknessOpacity;
        this.node.addChild(panel);

        var graphics = panel.addComponent(cc.Graphics);
        graphics.fillColor = cc.Color.BLACK;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }
});
