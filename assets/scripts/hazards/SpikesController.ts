/**
 * SpikesController.ts
 * Scene: Level2 and Level2-part2
 * Attach to: A spike hazard collider.
 * Supports both collision systems, applies knockback, and emits player-life-lost.
 */
var SpikesController = cc.Class({
    extends: cc.Component,

    properties: {
        damageCooldown: 0.8,
        knockbackX: 140,
        knockbackY: 220
    },

    onLoad: function () {
        this.damageTimer = 0;
        this.contactPlayers = [];

        var body = this.getComponent(cc.RigidBody);
        if (body) {
            body.enabledContactListener = true;
        }
    },

    update: function (dt) {
        this.damageTimer = Math.max(this.damageTimer - dt, 0);

        for (var i = this.contactPlayers.length - 1; i >= 0; i -= 1) {
            var player = this.contactPlayers[i];
            if (!player || !cc.isValid(player.node)) {
                this.contactPlayers.splice(i, 1);
                continue;
            }

            this.damagePlayer(player);
        }
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        var player = this.findPlayerController(otherCollider && otherCollider.node);
        if (!player) {
            return;
        }

        if (this.contactPlayers.indexOf(player) < 0) {
            this.contactPlayers.push(player);
        }
        this.damagePlayer(player);
    },

    onEndContact: function (contact, selfCollider, otherCollider) {
        var player = this.findPlayerController(otherCollider && otherCollider.node);
        var index = this.contactPlayers.indexOf(player);
        if (index >= 0) {
            this.contactPlayers.splice(index, 1);
        }
    },

    onCollisionEnter: function (other) {
        this.tryDamagePlayer(other && other.node);
    },

    onCollisionStay: function (other) {
        this.tryDamagePlayer(other && other.node);
    },

    tryDamagePlayer: function (node) {
        var player = this.findPlayerController(node);
        if (player) {
            this.damagePlayer(player);
        }
    },

    damagePlayer: function (player) {
        if (this.damageTimer > 0 || player.isDead) {
            return;
        }

        this.damageTimer = Math.max(this.damageCooldown, 0);

        if (player.receiveBombHit) {
            player.receiveBombHit();
        }

        cc.director.emit('player-life-lost');
        this.knockbackPlayer(player);
    },

    knockbackPlayer: function (player) {
        var direction = player.node.x < this.node.x ? -1 : 1;
        var gravityDirection = player.gravityDirection || 1;

        if (player.body) {
            var velocity = player.body.linearVelocity;
            velocity.x = direction * Math.abs(this.knockbackX);
            velocity.y = Math.abs(this.knockbackY) * gravityDirection;
            player.body.linearVelocity = velocity;
            player.body.awake = true;
            return;
        }

        if (typeof player.horizontalVelocity === 'number') {
            player.horizontalVelocity = direction * Math.abs(this.knockbackX);
        }
        if (typeof player.velocityY === 'number') {
            player.velocityY = Math.abs(this.knockbackY);
        }
    },

    findPlayerController: function (node) {
        while (node && node.parent) {
            var player = node.getComponent('PinkMonsterPhysicsController') ||
                node.getComponent('PinkMonsterController');
            if (player && player.enabled) {
                return player;
            }
            node = node.parent;
        }

        return null;
    }
});

module.exports = SpikesController;
