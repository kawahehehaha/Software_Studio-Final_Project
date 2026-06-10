/**
 * CoinCollectible.ts
 * Scene: Level2
 * Attach to: The reusable coin prefab.
 * Animates coin frames, detects either player controller, and emits coin-collected once.
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
var CoinCollectible = cc.Class({
    extends: cc.Component,

    properties: {
        frames: {
            default: [],
            type: [cc.SpriteFrame]
        },
        animationFps: 8,
        collectWidth: 40,
        collectHeight: 44,
        collectDuration: 0.12
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite);
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.playerSearchTimer = 0;
        this.player = null;
        this.collected = false;

        if (this.sprite && this.frames.length > 0) {
            this.applyFrame(this.frames[0]);
        }
    },

    update: function (dt) {
        if (this.collected) {
            AudioBroadcast.playEffect("coin");
            return;
        }

        this.updateAnimation(dt);
        this.updatePlayerReference(dt);

        if (this.player && this.isPlayerOverlapping(this.player)) {
            this.collect();
        }
    },

    updateAnimation: function (dt) {
        if (!this.sprite || this.frames.length < 2) {
            return;
        }

        this.frameTimer += dt;
        var frameDuration = 1 / Math.max(this.animationFps, 1);

        while (this.frameTimer >= frameDuration) {
            this.frameTimer -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
            this.applyFrame(this.frames[this.frameIndex]);
        }
    },

    applyFrame: function (frame) {
        if (!this.sprite || !frame) {
            return;
        }

        this.sprite.spriteFrame = frame;

        var rect = frame.getRect ? frame.getRect() : null;
        if (rect) {
            this.node.setContentSize(rect.width, rect.height);
        }
    },

    updatePlayerReference: function (dt) {
        // 多人模式：若快取的 controller 已被停用（遠端玩家），需重新搜尋本地玩家
        if (this.player && cc.isValid(this.player.node) && this.player.enabled) {
            return;
        }
        this.player = null;

        this.playerSearchTimer -= dt;
        if (this.playerSearchTimer > 0) {
            return;
        }

        this.playerSearchTimer = 0.25;
        var scene = cc.director.getScene();
        this.player = scene ? this.findPlayerInChildren(scene) : null;
    },

    findPlayerInChildren: function (node) {
        var player = node.getComponent('PinkMonsterPhysicsController') ||
            node.getComponent('PinkMonsterController');
        // 多人模式：只認 enabled 的 controller（disabled 的是遠端玩家）
        if (player && player.enabled) {
            return player;
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            player = this.findPlayerInChildren(node.children[i]);
            if (player) {
                return player;
            }
        }

        return null;
    },

    isPlayerOverlapping: function (player) {
        var playerNode = player.node;
        var playerCollider = player.collider ||
            playerNode.getComponent(cc.PhysicsBoxCollider) ||
            playerNode.getComponent(cc.PhysicsPolygonCollider) ||
            playerNode.getComponent(cc.PhysicsCircleCollider) ||
            playerNode.getComponent(cc.BoxCollider);
        var colliderNode = playerCollider ? playerCollider.node : playerNode;
        var playerSize = this.getColliderSize(playerCollider, playerNode);
        var playerOffset = playerCollider && playerCollider.offset ?
            playerCollider.offset :
            cc.v2();
        var coinCenter = this.node.convertToWorldSpaceAR(cc.v2());
        var playerCenter = colliderNode.convertToWorldSpaceAR(playerOffset);
        var coinScaleX = Math.abs(this.node.scaleX || 1);
        var coinScaleY = Math.abs(this.node.scaleY || 1);
        var playerScaleX = Math.abs(colliderNode.scaleX || 1);
        var playerScaleY = Math.abs(colliderNode.scaleY || 1);
        var halfWidth = this.collectWidth * coinScaleX / 2 +
            playerSize.width * playerScaleX / 2;
        var halfHeight = this.collectHeight * coinScaleY / 2 +
            playerSize.height * playerScaleY / 2;

        return Math.abs(playerCenter.x - coinCenter.x) <= halfWidth &&
            Math.abs(playerCenter.y - coinCenter.y) <= halfHeight;
    },

    getColliderSize: function (collider, node) {
        if (collider && collider.size) {
            return collider.size;
        }

        if (collider && typeof collider.radius === 'number') {
            return cc.size(collider.radius * 2, collider.radius * 2);
        }

        var size = node.getContentSize();
        return size.width > 0 && size.height > 0 ? size : cc.size(32, 48);
    },

    collect: function () {
        if (this.collected) {
            return;
        }

        this.collected = true;

        // 多人模式：通知對方也移除這枚金幣
        var nm = (window as any).NM;
        if (nm && nm.room) {
            var wp = this.node.convertToWorldSpaceAR(cc.v2(0, 0));
            nm.room.send('collect_coin', { x: Math.round(wp.x), y: Math.round(wp.y) });
        }

        cc.director.emit('coin-collected');
        this.node.runAction(cc.sequence(
            cc.spawn(
                cc.scaleTo(this.collectDuration, 1.3),
                cc.fadeOut(this.collectDuration)
            ),
            cc.removeSelf()
        ));
    }
});

module.exports = CoinCollectible;
