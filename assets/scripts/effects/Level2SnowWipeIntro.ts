/**
 * Level2SnowWipeIntro.ts
 * Scene: Level2-part2
 * Attach to: A persistent scene controller or transition node.
 * Draws the opening snow wipe and keeps the overlay aligned with the camera.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        cameraNodeName: 'Main Camera',
        duration: 1.1,
        toothHeight: 22,
        toothDepth: 16,
        extraWidth: 120,
        extraHeight: 240,
        zIndex: 9000,
        playOnLoad: true,
        debugLog: false
    },

    onLoad: function () {
        this.cameraNode = this.findNodeByName(this.cameraNodeName);
        this.overlayNode = null;
        this.graphics = null;
        this.progress = 0;
        this.isPlaying = false;

        this.createOverlay();

        if (this.playOnLoad) {
            this.startIntro();
        }
    },

    update: function (dt) {
        if (!this.isPlaying || !this.graphics) {
            return;
        }

        this.syncOverlayToCamera();
        this.progress = Math.min(this.progress + dt / Math.max(this.duration, 0.01), 1);
        this.drawReverseWipe(1 - this.easeInOut(this.progress));

        if (this.progress >= 1) {
            this.isPlaying = false;
            this.graphics.clear();
            this.overlayNode.active = false;
        }
    },

    startIntro: function () {
        this.progress = 0;
        this.isPlaying = true;
        this.syncOverlayToCamera();
        this.overlayNode.active = true;
        this.overlayNode.zIndex = this.zIndex;
        this.overlayNode.setSiblingIndex(this.overlayNode.parent.childrenCount - 1);
        this.drawReverseWipe(1);

        if (this.debugLog) {
            cc.log('[Level2SnowWipeIntro] Start intro wipe.');
        }
    },

    createOverlay: function () {
        this.overlayNode = new cc.Node('Level2 Snow Wipe Intro');
        this.overlayNode.zIndex = this.zIndex;
        this.overlayNode.active = false;
        this.getOverlayParent().addChild(this.overlayNode);
        this.overlayNode.setSiblingIndex(this.overlayNode.parent.childrenCount - 1);
        this.syncOverlayToCamera();

        this.graphics = this.overlayNode.addComponent(cc.Graphics);
        this.graphics.fillColor = cc.Color.BLACK;
    },

    getOverlayParent: function () {
        return cc.director.getScene() || this.node;
    },

    syncOverlayToCamera: function () {
        if (!this.overlayNode) {
            return;
        }

        var overlayParent = this.overlayNode.parent || this.node;

        if (!this.cameraNode || !this.cameraNode.parent || this.cameraNode.parent === overlayParent) {
            this.overlayNode.setPosition(this.cameraNode ? this.cameraNode.position : cc.Vec2.ZERO);
            return;
        }

        var cameraWorldPosition = this.cameraNode.parent.convertToWorldSpaceAR(this.cameraNode.position);
        var cameraLocalPosition = overlayParent.convertToNodeSpaceAR(cameraWorldPosition);
        this.overlayNode.setPosition(cameraLocalPosition);
    },

    drawReverseWipe: function (progress) {
        var camera = this.cameraNode ? this.cameraNode.getComponent(cc.Camera) : null;
        var zoom = camera && camera.zoomRatio > 0 ? camera.zoomRatio : 1;
        var width = cc.winSize.width / zoom + this.extraWidth * 2;
        var height = cc.winSize.height / zoom;
        var top = height / 2 + this.extraHeight;
        var bottom = -height / 2 - this.extraHeight;
        var left = -width / 2 - this.extraWidth;
        var right = left + width * progress;
        var toothInnerX = Math.max(right - Math.max(this.toothDepth, 0), left);
        var safeToothHeight = Math.max(this.toothHeight, 1);

        this.graphics.clear();

        if (progress <= 0) {
            return;
        }

        this.graphics.rect(left, bottom, toothInnerX - left, top - bottom);
        this.graphics.fill();

        for (var y = bottom; y < top; y += safeToothHeight) {
            this.graphics.moveTo(toothInnerX, y);
            this.graphics.lineTo(toothInnerX, y + safeToothHeight);
            this.graphics.lineTo(right, y + safeToothHeight / 2);
            this.graphics.close();
            this.graphics.fill();
        }
    },

    easeInOut: function (t) {
        return t * t * (3 - 2 * t);
    },

    findNodeByName: function (nodeName) {
        var scene = cc.director.getScene();
        if (!scene) {
            return null;
        }

        return this.findNodeByNameRecursive(scene, nodeName);
    },

    findNodeByNameRecursive: function (node, nodeName) {
        if (node.name === nodeName) {
            return node;
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            var found = this.findNodeByNameRecursive(node.children[i], nodeName);
            if (found) {
                return found;
            }
        }

        return null;
    }
});
