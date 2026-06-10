/**
 * QuestionBlockPhysics.ts
 * Scene: Level2-part2
 * Attach to: A physics question block that awards a coin.
 * Animates the block, validates player hits, shows the coin, and emits coin-collected.
 */
import { AudioBroadcast } from "../Audio/AudioEvent";

cc.Class({
    extends: cc.Component,

    properties: {
        activeFrames: {
            default: [],
            type: [cc.SpriteFrame]
        },
        usedFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        animationFps: 4,
        playerNodeName: 'Player',
        playerComponentName: 'PinkMonsterPhysicsController',
        bumpHeight: 10,
        bumpDuration: 0.16,
        hitTolerance: 8,
        horizontalHitPadding: 4,
        stopPlayerUpwardVelocity: true,
        coinPopupPrefab: {
            default: null,
            type: cc.Prefab
        },
        coinPopupFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        coinPopupOffsetY: 24,
        coinRiseHeight: 56,
        coinRiseDuration: 0.25,
        coinFallDuration: 0.22,
        emitCoinEvent: true,
        coinEventName: 'coin-collected'
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite);
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.used = false;
        this.bumping = false;
        this.startY = this.node.y;

        var body = this.getComponent(cc.RigidBody);
        if (body) {
            body.type = cc.RigidBodyType.Static;
            body.enabledContactListener = true;
        }

        if (this.sprite && this.activeFrames.length > 0) {
            this.sprite.spriteFrame = this.activeFrames[0];
        }
    },

    update: function (dt) {
        if (this.used || !this.sprite || this.activeFrames.length <= 1) {
            return;
        }

        this.frameTimer += dt;
        var frameDuration = 1 / Math.max(this.animationFps, 1);

        while (this.frameTimer >= frameDuration) {
            this.frameTimer -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.activeFrames.length;
            this.sprite.spriteFrame = this.activeFrames[this.frameIndex];
        }
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        if (this.used || this.bumping || !this.isPlayerCollider(otherCollider)) {
            return;
        }

        if (!this.isHitFromActiveSide(selfCollider, otherCollider)) {
            return;
        }

        if (this.stopPlayerUpwardVelocity && otherCollider.body) {
            var velocity = otherCollider.body.linearVelocity;
            velocity.y = this.getVerticalDirection() > 0
                ? Math.min(velocity.y, 0)
                : Math.max(velocity.y, 0);
            otherCollider.body.linearVelocity = velocity;
        }
        
        AudioBroadcast.playEffect("questionblock");
        this.bump();
        this.spawnCoinPopup();

        if (this.emitCoinEvent) {
            cc.director.emit(this.coinEventName);
        }

        this.markUsed();
    },

    isPlayerCollider: function (collider) {
        if (!collider || !collider.node) {
            return false;
        }

        if (collider.node.name === this.playerNodeName) {
            return true;
        }

        var node = collider.node;
        while (node && node.parent) {
            if (node.getComponent(this.playerComponentName)) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    isHitFromActiveSide: function (selfCollider, otherCollider) {
        var playerBody = otherCollider.body;
        var playerVelocityY = playerBody ? playerBody.linearVelocity.y : 0;
        var blockBounds = this.getColliderWorldBounds(selfCollider);
        var playerBounds = this.getColliderWorldBounds(otherCollider);

        if (!blockBounds || !playerBounds) {
            return false;
        }

        var playerOverlapsBlockX = playerBounds.xMax > blockBounds.xMin + this.horizontalHitPadding &&
            playerBounds.xMin < blockBounds.xMax - this.horizontalHitPadding;
        var verticalDirection = this.getVerticalDirection();

        if (verticalDirection > 0) {
            var playerTopIsNearBlockBottom =
                playerBounds.yMax <= blockBounds.yMin + this.hitTolerance;
            return playerTopIsNearBlockBottom && playerOverlapsBlockX && playerVelocityY > 0;
        }

        var playerBottomIsNearBlockTop =
            playerBounds.yMin >= blockBounds.yMax - this.hitTolerance;
        return playerBottomIsNearBlockTop && playerOverlapsBlockX && playerVelocityY < 0;
    },

    getVerticalDirection: function () {
        return this.node.scaleY < 0 ? -1 : 1;
    },

    markUsed: function () {
        this.used = true;
        this.frameTimer = 0;
        this.frameIndex = 0;

        if (this.sprite && this.usedFrame) {
            this.sprite.spriteFrame = this.usedFrame;
        }
    },

    bump: function () {
        this.bumping = true;
        this.node.stopAllActions();
        this.node.y = this.startY;
        var verticalDirection = this.getVerticalDirection();

        var rise = cc.moveTo(
            this.bumpDuration / 2,
            cc.v2(this.node.x, this.startY + this.bumpHeight * verticalDirection)
        )
            .easing(cc.easeCubicActionOut());
        var fall = cc.moveTo(this.bumpDuration / 2, cc.v2(this.node.x, this.startY))
            .easing(cc.easeCubicActionIn());
        var finish = cc.callFunc(function () {
            this.node.y = this.startY;
            this.bumping = false;
        }, this);

        this.node.runAction(cc.sequence(rise, fall, finish));
    },

    spawnCoinPopup: function () {
        var parent = this.node.parent || this.node;
        var verticalDirection = this.getVerticalDirection();

        if (this.coinPopupPrefab) {
            var popup = cc.instantiate(this.coinPopupPrefab);
            parent.addChild(popup);
            popup.setPosition(
                this.node.x,
                this.node.y + this.coinPopupOffsetY * verticalDirection
            );

            var popupController = popup.getComponent('CoinPopup');
            if (popupController && popupController.play) {
                popupController.play(verticalDirection);
            }

            return;
        }

        if (!this.coinPopupFrame) {
            return;
        }

        var coin = new cc.Node('Question_Block_Coin_Popup');
        var sprite = coin.addComponent(cc.Sprite);
        sprite.spriteFrame = this.coinPopupFrame;
        parent.addChild(coin);
        coin.setPosition(
            this.node.x,
            this.node.y + this.coinPopupOffsetY * verticalDirection
        );

        var start = cc.v2(coin.x, coin.y);
        var top = cc.v2(start.x, start.y + this.coinRiseHeight * verticalDirection);
        var rise = cc.moveTo(this.coinRiseDuration, top).easing(cc.easeCubicActionOut());
        var fall = cc.moveTo(this.coinFallDuration, start).easing(cc.easeCubicActionIn());
        var cleanup = cc.callFunc(function () {
            coin.destroy();
        });

        coin.runAction(cc.sequence(rise, fall, cleanup));
    },

    getColliderWorldBounds: function (collider) {
        if (!collider || !collider.node) {
            return null;
        }

        var box = collider;
        var offset = box.offset || cc.v2();
        var size = box.size || collider.node.getContentSize();
        var halfWidth = size.width / 2;
        var halfHeight = size.height / 2;
        var points = [
            cc.v2(offset.x - halfWidth, offset.y - halfHeight),
            cc.v2(offset.x + halfWidth, offset.y - halfHeight),
            cc.v2(offset.x - halfWidth, offset.y + halfHeight),
            cc.v2(offset.x + halfWidth, offset.y + halfHeight)
        ];
        var xMin = Number.POSITIVE_INFINITY;
        var xMax = Number.NEGATIVE_INFINITY;
        var yMin = Number.POSITIVE_INFINITY;
        var yMax = Number.NEGATIVE_INFINITY;

        for (var i = 0; i < points.length; i += 1) {
            var worldPoint = collider.node.convertToWorldSpaceAR(points[i]);
            xMin = Math.min(xMin, worldPoint.x);
            xMax = Math.max(xMax, worldPoint.x);
            yMin = Math.min(yMin, worldPoint.y);
            yMax = Math.max(yMax, worldPoint.y);
        }

        return {
            xMin: xMin,
            xMax: xMax,
            yMin: yMin,
            yMax: yMax
        };
    }
});
