/**
 * FollowKey.ts
 * Scene: Level2-part2
 * Attach to: A collectible key with a physics sensor.
 * Registers with the player, follows behind them, and can be consumed by a matching lock.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        keyId: 'blue',
        followDistanceX: 34,
        followOffsetY: 16,
        followSpeed: 9,
        floatHeight: 4,
        floatSpeed: 3
    },

    onLoad: function () {
        this.collected = false;
        this.consumed = false;
        this.player = null;
        this.floatTime = 0;

        var body = this.getComponent(cc.RigidBody);
        if (body) {
            body.type = cc.RigidBodyType.Static;
            body.enabledContactListener = true;
        }
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        if (this.collected || this.consumed) {
            return;
        }

        var player = this.findPlayerController(otherCollider && otherCollider.node);
        if (player) {
            this.collect(player);
        }
    },

    collect: function (player) {
        this.collected = true;
        this.player = player;

        var collider = this.getComponent(cc.PhysicsCollider);
        if (collider) {
            collider.enabled = false;
        }

        var body = this.getComponent(cc.RigidBody);
        if (body) {
            body.enabled = false;
        }

        player.carriedKeys = player.carriedKeys || [];
        player.carriedKeys.push(this);
        this.node.zIndex = 100;
    },

    lateUpdate: function (dt) {
        if (!this.collected || this.consumed || !this.player || !cc.isValid(this.player.node)) {
            return;
        }

        this.floatTime += dt;

        var playerNode = this.player.node;
        var facingDirection = playerNode.scaleX < 0 ? -1 : 1;
        if (this.player.gravityDirection < 0) {
            facingDirection *= -1;
        }

        var gravityDirection = this.player.gravityDirection || 1;
        var targetWorld = playerNode.convertToWorldSpaceAR(cc.v2(
            -facingDirection * this.followDistanceX,
            this.followOffsetY * gravityDirection +
                Math.sin(this.floatTime * this.floatSpeed) * this.floatHeight
        ));
        var targetLocal = this.node.parent.convertToNodeSpaceAR(targetWorld);
        var blend = 1 - Math.exp(-this.followSpeed * dt);

        this.node.x = cc.misc.lerp(this.node.x, targetLocal.x, blend);
        this.node.y = cc.misc.lerp(this.node.y, targetLocal.y, blend);
    },

    consume: function () {
        if (this.consumed) {
            return;
        }

        this.consumed = true;

        if (this.player && this.player.carriedKeys) {
            var index = this.player.carriedKeys.indexOf(this);
            if (index >= 0) {
                this.player.carriedKeys.splice(index, 1);
            }
        }

        this.node.destroy();
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
