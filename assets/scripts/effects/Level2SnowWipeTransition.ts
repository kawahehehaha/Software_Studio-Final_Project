/**
 * Level2SnowWipeTransition.ts
 * Scene: Level2
 * Attach to: A scene transition controller.
 * Watches the player position, draws the snow wipe, and loads Level2-part2.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        playerNodeName: 'Pink_Monster',
        playerComponentName: 'PinkMonsterController',
        cameraNodeName: 'Main Camera',
        targetScene: 'Level2-part2',
        triggerX: 2450,
        duration: 1.1,
        toothHeight: 22,
        toothDepth: 16,
        extraWidth: 120,
        extraHeight: 240,
        zIndex: 9000,
        testKey: true,
        debugLog: true,
        waitForTeam: { default: true, tooltip: '到達終點後等待隊友一起轉場' }
    },

    onLoad: function () {
        this.player = null;
        this.cameraNode = this.findNodeByName(this.cameraNodeName);
        this.overlayNode = null;
        this.graphics = null;
        this.progress = 0;
        this.isTransitioning = false;
        this.hasLoadedTarget = false;
        this.hasWarnedMissingPlayer = false;
        this.waitingForTeam = false;
        this.waitPanel = null;
        this.teamReadySent = false;
        this.airWallNode = null;

        this.createOverlay();

        if (this.testKey) {
            cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        }
    },

    onDestroy: function () {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.director.off('all-scene-ready', this.onAllSceneReady, this);
        this.removeAirWall();
    },

    update: function (dt) {
        if (!this.player) {
            this.player = this.findPlayerNode();

            if (this.player) {
                if (this.debugLog) {
                    cc.log('[Level2SnowWipeTransition] Player found. player=' + this.player.name +
                        ', parent=' + (this.player.parent ? this.player.parent.name : 'null') +
                        ', triggerX=' + this.triggerX);
                }
            } else if (!this.hasWarnedMissingPlayer) {
                this.hasWarnedMissingPlayer = true;
                cc.warn('[Level2SnowWipeTransition] Waiting for NetworkManager to assign player...');
            }
        }

        if (!this.player || !this.graphics || this.hasLoadedTarget) {
            return;
        }

        this.syncOverlayToCamera();

        if (!this.isTransitioning && !this.waitingForTeam && this.shouldStartTransition()) {
            this.enterWaitState();
        }

        if (!this.isTransitioning) {
            return;
        }

        this.progress = Math.min(this.progress + dt / Math.max(this.duration, 0.01), 1);
        this.drawWipe(this.easeInOut(this.progress));

        if (this.progress >= 1) {
            this.hasLoadedTarget = true;
            cc.director.emit('level2-part-transition');
            cc.director.loadScene(this.targetScene);
        }
    },

    // lateUpdate 在所有 component 的 update() 執行後才跑，確保 clamp 永遠最後發言
    lateUpdate: function (_dt) {
        if (!this.waitingForTeam || !this.player || !this.player.isValid) { return; }
        this.clampPlayerAtTrigger();
    },

    onKeyDown: function (event) {
        if (!this.testKey || this.isTransitioning || this.hasLoadedTarget) {
            return;
        }

        if (event.keyCode === cc.macro.KEY.t) {
            cc.log('[Level2SnowWipeTransition] Test key T pressed.');
            this.startTransition();
        }
    },

    // ── 等待隊友到達終點 ─────────────────────────────────────────
    enterWaitState: function () {
        if (!this.waitForTeam) {
            this.startTransition();
            return;
        }

        var nm = window['NM'];
        if (!nm || !nm.room) {
            // 單人 / 離線模式，直接轉場
            this.startTransition();
            return;
        }

        if (this.teamReadySent) {
            return;
        }

        this.teamReadySent = true;
        this.waitingForTeam = true;
        this.spawnAirWall();
        this.showWaitPanel();
        nm.room.send('scene_ready', { scene: this.targetScene });
        cc.director.on('all-scene-ready', this.onAllSceneReady, this);

        if (this.debugLog) {
            cc.log('[Level2SnowWipeTransition] Waiting for team. Sent scene_ready for ' + this.targetScene);
        }
    },

    onAllSceneReady: function () {
        cc.director.off('all-scene-ready', this.onAllSceneReady, this);
        this.waitingForTeam = false;
        this.removeAirWall();
        this.hideWaitPanel();
        this.startTransition();

        if (this.debugLog) {
            cc.log('[Level2SnowWipeTransition] All players ready — starting wipe!');
        }
    },

    // ── 空氣牆（CollisionManager BoxCollider）────────────────────
    spawnAirWall: function () {
        if (this.airWallNode && this.airWallNode.isValid) { return; }

        var wall = new cc.Node('AirWall_WaitForTeam');
        // 放到 Scene 根節點，local 座標 = world 座標
        var scene = cc.director.getScene();
        scene.addChild(wall);

        // 位置：trigger X，垂直置中在玩家可能的高度範圍
        wall.setPosition(this.triggerX, 200);

        var col = wall.addComponent(cc.BoxCollider);
        col.size = cc.size(16, 900);   // 細窄高牆，擋住任何高度
        col.offset = cc.v2(0, 0);

        // 確保 CollisionManager 已開啟
        cc.director.getCollisionManager().enabled = true;

        this.airWallNode = wall;

        if (this.debugLog) {
            cc.log('[Level2SnowWipeTransition] Air wall spawned at worldX=' + this.triggerX);
        }
    },

    removeAirWall: function () {
        if (this.airWallNode && this.airWallNode.isValid) {
            this.airWallNode.destroy();
        }
        this.airWallNode = null;
    },

    clampPlayerAtTrigger: function () {
        if (!this.player || !this.player.isValid) { return; }

        // 在物理層歸零向右速度（防止 rb._afterStep 把位置打回去）
        var spriteNode = this.player.getChildByName('sprite') || this.player;
        var rb = spriteNode.getComponent(cc.RigidBody);
        if (rb && rb.linearVelocity && rb.linearVelocity.x > 0) {
            rb.linearVelocity = cc.v2(0, rb.linearVelocity.y);
        }

        // 清零 controller 層速度
        var ctrl = this.player.getComponent(this.playerComponentName);
        if (ctrl && ctrl.velocityX !== undefined && ctrl.velocityX > 0) {
            ctrl.velocityX = 0;
        }

        // 鎖位置，確保不超過觸發線
        var worldPos = this.player.parent
            ? this.player.parent.convertToWorldSpaceAR(this.player.position)
            : cc.v2(this.player.x, this.player.y);
        if (worldPos.x > this.triggerX) {
            worldPos.x = this.triggerX;
            if (this.player.parent) {
                var localPos = this.player.parent.convertToNodeSpaceAR(worldPos);
                this.player.x = localPos.x;
            } else {
                this.player.x = this.triggerX;
            }
        }
    },

    showWaitPanel: function () {
        this.overlayNode.active = true;
        this.graphics.clear();

        if (this.waitPanel && this.waitPanel.isValid) {
            this.waitPanel.active = true;
            return;
        }

        var panel = new cc.Node('WaitPanel');

        // 半透明黑底
        var bg = panel.addComponent(cc.Graphics);
        bg.fillColor = new cc.Color(0, 0, 0, 180);
        bg.rect(-240, -28, 480, 56);
        bg.fill();

        // 文字
        var textNode = new cc.Node('WaitText');
        var label = textNode.addComponent(cc.Label);
        label.string = 'Please wait for your team...';
        label.fontSize = 26;
        label.lineHeight = 32;
        textNode.color = cc.Color.WHITE;
        panel.addChild(textNode);

        this.overlayNode.addChild(panel);
        this.waitPanel = panel;
    },

    hideWaitPanel: function () {
        if (this.waitPanel && this.waitPanel.isValid) {
            this.waitPanel.active = false;
        }
        this.overlayNode.active = false;
    },

    startTransition: function () {
        this.isTransitioning = true;
        this.progress = 0;
        this.syncOverlayToCamera();
        this.overlayNode.active = true;
        this.overlayNode.zIndex = this.zIndex;
        this.overlayNode.setSiblingIndex(this.overlayNode.parent.childrenCount - 1);
        this.drawWipe(0);

        if (this.debugLog) {
            cc.log('[Level2SnowWipeTransition] Start wipe. playerX=' + this.getPlayerX().toFixed(2) + ', targetScene=' + this.targetScene);
        }
    },

    createOverlay: function () {
        this.overlayNode = new cc.Node('Level2 Snow Wipe Transition');
        this.overlayNode.zIndex = this.zIndex;
        this.overlayNode.active = false;
        this.node.addChild(this.overlayNode);
        this.overlayNode.setSiblingIndex(this.overlayNode.parent.childrenCount - 1);
        this.syncOverlayToCamera();

        this.graphics = this.overlayNode.addComponent(cc.Graphics);
        this.graphics.fillColor = cc.Color.BLACK;
    },

    syncOverlayToCamera: function () {
        if (!this.overlayNode) {
            return;
        }

        if (!this.cameraNode || !this.cameraNode.parent || this.cameraNode.parent === this.node) {
            this.overlayNode.setPosition(this.cameraNode ? this.cameraNode.position : cc.Vec2.ZERO);
            return;
        }

        var cameraWorldPosition = this.cameraNode.parent.convertToWorldSpaceAR(this.cameraNode.position);
        var cameraLocalPosition = this.node.convertToNodeSpaceAR(cameraWorldPosition);
        this.overlayNode.setPosition(cameraLocalPosition);
    },

    shouldStartTransition: function () {
        if (this.getPlayerX() >= this.triggerX) {
            return true;
        }

        return this.isPlayerOnSnowRamp();
    },

    getPlayerX: function () {
        if (!this.player) {
            return 0;
        }

        if (!this.player.parent) {
            return this.player.x;
        }

        return this.player.parent.convertToWorldSpaceAR(this.player.position).x;
    },

    isPlayerOnSnowRamp: function () {
        var controller = this.player.getComponent(this.playerComponentName);
        if (!controller || !controller.currentRamp || !controller.currentRamp.node) {
            return false;
        }

        return this.hasSnowNameInParents(controller.currentRamp.node);
    },

    hasSnowNameInParents: function (node) {
        while (node) {
            if (node.name && node.name.toLowerCase().indexOf('snow') !== -1) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    findPlayerNode: function () {
        var nm = window['NM'];
        if (!nm || !nm.localPlayer) {
            return null;
        }
        return this.findControllerNodeInSubtree(nm.localPlayer, this.playerComponentName) || nm.localPlayer;
    },

    findControllerNodeInSubtree: function (node, componentName) {
        if (node.getComponent(componentName)) { return node; }
        for (var i = 0; i < node.childrenCount; i++) {
            var found = this.findControllerNodeInSubtree(node.children[i], componentName);
            if (found) { return found; }
        }
        return null;
    },

    drawWipe: function (progress) {
        var camera = this.cameraNode ? this.cameraNode.getComponent(cc.Camera) : null;
        var zoom = camera && camera.zoomRatio > 0 ? camera.zoomRatio : 1;
        var width = cc.winSize.width / zoom + this.extraWidth * 2;
        var height = cc.winSize.height / zoom;
        var top = height / 2 + this.extraHeight;
        var bottom = -height / 2 - this.extraHeight;
        var right = width / 2 + this.extraWidth;
        var left = right - width * progress;
        var toothInnerX = Math.min(left + Math.max(this.toothDepth, 0), right);
        var safeToothHeight = Math.max(this.toothHeight, 1);

        this.graphics.clear();

        if (progress <= 0) {
            return;
        }

        this.graphics.rect(toothInnerX, bottom, right - toothInnerX, top - bottom);
        this.graphics.fill();

        for (var y = bottom; y < top; y += safeToothHeight) {
            this.graphics.moveTo(toothInnerX, y);
            this.graphics.lineTo(toothInnerX, y + safeToothHeight);
            this.graphics.lineTo(left, y + safeToothHeight / 2);
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
