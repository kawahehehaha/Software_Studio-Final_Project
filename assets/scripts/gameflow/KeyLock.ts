/**
 * KeyLock.ts
 * Scene: Level2-part2
 * Attach to: A lock or barrier with a physics sensor.
 * Consumes the matching carried key, removes the lock, and awards a star.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        keyId: 'blue',
        starFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        starReward: 1,
        unlockDuration: 0.3,
        starPopupOffsetY: 18,
        starPopupRiseHeight: 70,
        starPopupRiseDuration: 0.28,
        starPopupHoldDuration: 0.2,
        starPopupFadeDuration: 0.25,
        starPopupScale: 1
    },

    onLoad: function () {
        this.unlocked = false;

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
        if (this.unlocked) {
            return;
        }

        var player = this.findPlayerController(otherCollider && otherCollider.node);
        var key = this.findMatchingKey(player);

        if (player && key) {
            this.unlock(key, player);
        }
    },

    findMatchingKey: function (player) {
        if (!player || !player.carriedKeys) {
            return null;
        }

        for (var i = 0; i < player.carriedKeys.length; i += 1) {
            var key = player.carriedKeys[i];
            if (key && !key.consumed && key.keyId === this.keyId) {
                return key;
            }
        }

        return null;
    },

    unlock: function (key, player) {
        this.unlocked = true;
        key.consume();

        var collider = this.getComponent(cc.PhysicsCollider);
        if (collider) {
            collider.enabled = false;
        }

        this.spawnStarPopup(player);
        cc.director.emit('star-collected', Math.max(Math.floor(this.starReward || 1), 1));

        this.node.runAction(cc.sequence(
            cc.spawn(
                cc.fadeOut(this.unlockDuration),
                cc.scaleTo(this.unlockDuration, 1.25)
            ),
            cc.removeSelf()
        ));
    },

    spawnStarPopup: function (player) {
        if (!this.starFrame || !this.node.parent) {
            return;
        }

        var gravityDirection = player && player.gravityDirection
            ? player.gravityDirection
            : 1;
        var popupDirection = gravityDirection > 0 ? 1 : -1;
        var popup = new cc.Node('Star Popup');
        var sprite = popup.addComponent(cc.Sprite);
        sprite.spriteFrame = this.starFrame;
        popup.setScale(this.starPopupScale);
        this.node.parent.addChild(popup);
        popup.setPosition(
            this.node.x,
            this.node.y + this.starPopupOffsetY * popupDirection
        );

        var endPosition = cc.v2(
            popup.x,
            popup.y + this.starPopupRiseHeight * popupDirection
        );
        popup.runAction(cc.sequence(
            cc.spawn(
                cc.moveTo(this.starPopupRiseDuration, endPosition)
                    .easing(cc.easeCubicActionOut()),
                cc.scaleTo(this.starPopupRiseDuration, this.starPopupScale * 1.2)
            ),
            cc.delayTime(this.starPopupHoldDuration),
            cc.fadeOut(this.starPopupFadeDuration),
            cc.removeSelf()
        ));
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
