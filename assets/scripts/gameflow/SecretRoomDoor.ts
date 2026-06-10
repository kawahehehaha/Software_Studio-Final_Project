/**
 * SecretRoomDoor.ts
 * Scene: Level2-part2
 * Attach to: A key-operated secret-room or final door.
 * Opens for a matching key, manages secret-room visibility, or loads a target scene.
 */
var PlayerDarknessOverlay = require('../effects/PlayerDarknessOverlay');

cc.Class({
    extends: cc.Component,

    properties: {
        closedFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        openFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        topSprite: {
            default: null,
            type: cc.Sprite
        },
        closedTopFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        openTopFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        roomBoundsNode: {
            default: null,
            type: cc.Node
        },
        hiddenRoomRoot: {
            default: null,
            type: cc.Node
        },
        hideRoomOnLoad: true,
        requireAnyKey: true,
        requiredKeyId: '',
        consumeKeyOnOpen: false,
        useSecretRoom: true,
        openedEventName: '',
        targetScene: '',
        loadSceneDelay: 0,
        visibleWidth: 300,
        visibleHeight: 220,
        darknessOpacity: 235,
        overlayZIndex: 15000
    },

    onLoad: function () {
        this.opened = false;
        this.playerInsideRoom = false;
        this.roomPlayer = null;
        this.doorReadyForReuse = true;
        this.lastDoorPlayer = null;
        this.sprite = this.getComponent(cc.Sprite);
        this.darknessNode = null;

        if (!this.topSprite) {
            var topNode = this.node.getChildByName('Door Top');
            this.topSprite = topNode ? topNode.getComponent(cc.Sprite) : null;
        }

        if (this.sprite && this.closedFrame) {
            this.sprite.spriteFrame = this.closedFrame;
        }
        if (this.topSprite && this.closedTopFrame) {
            this.topSprite.spriteFrame = this.closedTopFrame;
        }

        if (this.useSecretRoom && this.hiddenRoomRoot && this.hideRoomOnLoad) {
            this.hiddenRoomRoot.active = false;
        }

        var body = this.getComponent(cc.RigidBody);
        if (body) {
            body.type = cc.RigidBodyType.Static;
            body.enabledContactListener = true;
        }

        var collider = this.getComponent(cc.PhysicsCollider);
        if (collider) {
            collider.sensor = true;
            collider.apply();
        }
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        var player = this.findPlayerController(otherCollider && otherCollider.node);
        if (!player) {
            return;
        }

        if (this.opened) {
            if (!this.useSecretRoom) {
                return;
            }

            if (!this.doorReadyForReuse) {
                return;
            }

            this.doorReadyForReuse = false;
            if (this.playerInsideRoom) {
                this.exitSecretRoom();
            } else {
                this.enterSecretRoom(player);
            }
            return;
        }

        var key = this.findDoorKey(player);
        if (this.requireAnyKey && !key) {
            return;
        }

        this.openDoor(player, key);
    },

    lateUpdate: function () {
        this.updateDoorReuseState();

        if (!this.playerInsideRoom ||
            !this.roomPlayer ||
            !cc.isValid(this.roomPlayer.node) ||
            !this.roomBoundsNode ||
            !cc.isValid(this.roomBoundsNode)) {
            return;
        }

        this.keepPlayerInsideRoom(this.roomPlayer);
    },

    findDoorKey: function (player) {
        if (!this.requireAnyKey) {
            return null;
        }

        if (!player.carriedKeys) {
            return null;
        }

        for (var i = 0; i < player.carriedKeys.length; i += 1) {
            var key = player.carriedKeys[i];
            if (key && !key.consumed &&
                (!this.requiredKeyId || key.keyId === this.requiredKeyId)) {
                return key;
            }
        }

        return null;
    },

    openDoor: function (player, key) {
        this.opened = true;

        if (this.consumeKeyOnOpen && key && key.consume) {
            key.consume();
        }

        if (this.sprite && this.openFrame) {
            this.sprite.spriteFrame = this.openFrame;
        }
        if (this.topSprite && this.openTopFrame) {
            this.topSprite.spriteFrame = this.openTopFrame;
        }

        if (this.useSecretRoom && this.hiddenRoomRoot) {
            this.hiddenRoomRoot.active = true;
        }

        if (this.openedEventName) {
            cc.director.emit(this.openedEventName, player);
        }

        if (this.targetScene) {
            this.scheduleOnce(function () {
                cc.director.loadScene(this.targetScene);
            }, Math.max(this.loadSceneDelay, 0));
        }

        if (this.useSecretRoom) {
            this.enterSecretRoom(player);
        }
    },

    enterSecretRoom: function (player) {
        this.playerInsideRoom = true;
        this.roomPlayer = player;
        this.lastDoorPlayer = player;
        this.doorReadyForReuse = false;
        if (this.hiddenRoomRoot) {
            this.hiddenRoomRoot.active = true;
        }
        this.showDarkness(player.node);
    },

    exitSecretRoom: function () {
        this.lastDoorPlayer = this.roomPlayer;
        this.doorReadyForReuse = false;
        this.playerInsideRoom = false;
        this.roomPlayer = null;
        this.hideDarkness();
        if (this.hiddenRoomRoot) {
            this.hiddenRoomRoot.active = false;
        }
    },

    updateDoorReuseState: function () {
        if (this.doorReadyForReuse ||
            !this.lastDoorPlayer ||
            !cc.isValid(this.lastDoorPlayer.node)) {
            return;
        }

        if (!this.isPlayerOverlappingDoor(this.lastDoorPlayer)) {
            this.doorReadyForReuse = true;
        }
    },

    isPlayerOverlappingDoor: function (player) {
        var doorCollider = this.getComponent(cc.PhysicsCollider);
        var playerNode = player.node;
        var playerCollider = player.collider ||
            playerNode.getComponent(cc.PhysicsBoxCollider) ||
            playerNode.getComponent(cc.PhysicsPolygonCollider) ||
            playerNode.getComponent(cc.PhysicsCircleCollider);

        if (!doorCollider || !playerCollider) {
            return false;
        }

        var doorScaleX = Math.abs(this.node.scaleX || 1);
        var doorScaleY = Math.abs(this.node.scaleY || 1);
        var playerScaleX = Math.abs(playerNode.scaleX || 1);
        var playerScaleY = Math.abs(playerNode.scaleY || 1);
        var doorSize = this.getColliderSize(doorCollider, this.node);
        var playerSize = this.getColliderSize(playerCollider, playerNode);
        var doorOffset = doorCollider.offset || cc.v2();
        var playerOffset = playerCollider.offset || cc.v2();
        var doorCenter = this.node.convertToWorldSpaceAR(doorOffset);
        var playerCenter = playerNode.convertToWorldSpaceAR(playerOffset);
        var halfWidth = doorSize.width * doorScaleX / 2 +
            playerSize.width * playerScaleX / 2;
        var halfHeight = doorSize.height * doorScaleY / 2 +
            playerSize.height * playerScaleY / 2;

        return Math.abs(playerCenter.x - doorCenter.x) < halfWidth &&
            Math.abs(playerCenter.y - doorCenter.y) < halfHeight;
    },

    keepPlayerInsideRoom: function (player) {
        var playerNode = player.node;
        var roomCollider = this.roomBoundsNode.getComponent(cc.PhysicsBoxCollider);
        var roomScaleX = Math.abs(this.roomBoundsNode.scaleX || 1);
        var roomScaleY = Math.abs(this.roomBoundsNode.scaleY || 1);
        var roomSize = roomCollider
            ? roomCollider.size
            : this.roomBoundsNode.getContentSize();
        var roomOffset = roomCollider ? roomCollider.offset : cc.v2();
        var roomCenter = this.roomBoundsNode.convertToWorldSpaceAR(roomOffset);
        var roomHalfWidth = roomSize.width * roomScaleX / 2;
        var roomHalfHeight = roomSize.height * roomScaleY / 2;
        var playerCollider = player.collider ||
            playerNode.getComponent(cc.PhysicsBoxCollider) ||
            playerNode.getComponent(cc.PhysicsPolygonCollider) ||
            playerNode.getComponent(cc.PhysicsCircleCollider);
        var playerScaleX = Math.abs(playerNode.scaleX || 1);
        var playerScaleY = Math.abs(playerNode.scaleY || 1);
        var playerSize = this.getColliderSize(playerCollider, playerNode);
        var playerOffset = playerCollider
            ? playerCollider.offset
            : cc.v2();
        var halfWidth = playerSize.width * playerScaleX / 2;
        var halfHeight = playerSize.height * playerScaleY / 2;
        var worldPosition = playerNode.convertToWorldSpaceAR(cc.v2());
        var offsetX = playerOffset.x * playerScaleX;
        var offsetY = playerOffset.y * playerScaleY;
        var roomMinX = roomCenter.x - roomHalfWidth;
        var roomMaxX = roomCenter.x + roomHalfWidth;
        var roomMinY = roomCenter.y - roomHalfHeight;
        var roomMaxY = roomCenter.y + roomHalfHeight;
        var minX = roomMinX + halfWidth - offsetX;
        var maxX = roomMaxX - halfWidth - offsetX;
        var minY = roomMinY + halfHeight - offsetY;
        var maxY = roomMaxY - halfHeight - offsetY;

        if (minX > maxX || minY > maxY) {
            return;
        }

        var clampedX = cc.misc.clampf(worldPosition.x, minX, maxX);
        var clampedY = cc.misc.clampf(worldPosition.y, minY, maxY);

        if (clampedX === worldPosition.x && clampedY === worldPosition.y) {
            return;
        }

        var parentPosition = playerNode.parent.convertToNodeSpaceAR(cc.v2(clampedX, clampedY));
        playerNode.setPosition(parentPosition);

        var body = playerNode.getComponent(cc.RigidBody);
        if (body) {
            var velocity = body.linearVelocity;
            if (clampedX !== worldPosition.x) {
                velocity.x = 0;
            }
            if (clampedY !== worldPosition.y) {
                velocity.y = 0;
            }
            body.linearVelocity = velocity;
            body.syncPosition(false);
        }
    },

    getColliderSize: function (collider, playerNode) {
        if (!collider) {
            return playerNode.getContentSize();
        }

        if (collider.size) {
            return collider.size;
        }

        if (typeof collider.radius === 'number') {
            return cc.size(collider.radius * 2, collider.radius * 2);
        }

        if (collider.points && collider.points.length > 0) {
            var minX = collider.points[0].x;
            var maxX = minX;
            var minY = collider.points[0].y;
            var maxY = minY;

            for (var i = 1; i < collider.points.length; i += 1) {
                minX = Math.min(minX, collider.points[i].x);
                maxX = Math.max(maxX, collider.points[i].x);
                minY = Math.min(minY, collider.points[i].y);
                maxY = Math.max(maxY, collider.points[i].y);
            }

            return cc.size(maxX - minX, maxY - minY);
        }

        return playerNode.getContentSize();
    },

    showDarkness: function (playerNode) {
        if (this.darknessNode && cc.isValid(this.darknessNode)) {
            this.darknessNode.active = true;
            return;
        }

        var scene = cc.director.getScene();
        if (!scene) {
            return;
        }

        this.darknessNode = new cc.Node('Secret Room Darkness');
        this.darknessNode.zIndex = this.overlayZIndex;
        scene.addChild(this.darknessNode);

        var overlay = this.darknessNode.addComponent(PlayerDarknessOverlay);
        overlay.player = playerNode;
        overlay.visibleWidth = this.visibleWidth;
        overlay.visibleHeight = this.visibleHeight;
        overlay.darknessOpacity = this.darknessOpacity;
        overlay.overlayZIndex = this.overlayZIndex;
        this.darknessNode.zIndex = this.overlayZIndex;
        overlay.createDarknessPanels();
    },

    hideDarkness: function () {
        if (this.darknessNode && cc.isValid(this.darknessNode)) {
            this.darknessNode.active = false;
        }
    },

    findPlayerController: function (node) {
        while (node && node.parent) {
            var controller = node.getComponent('PinkMonsterPhysicsController') ||
                node.getComponent('PinkMonsterController');
            if (controller) {
                return controller;
            }

            node = node.parent;
        }

        return null;
    }
});
