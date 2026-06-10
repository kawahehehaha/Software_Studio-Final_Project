/**
 * BombPowerup.ts
 * Scene: Level2-part2
 * Attach to: The bomb power-up spawned by BombBlockPhysics.
 * Reveals the item, settles it on the ground, and emits bomb-collected on pickup.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        playerNodeName: 'Player',
        revealHeight: 18,
        revealDuration: 0.28,
        groundNormalY: 0.55,
        stopOnGround: true,
        destroyOnPlayerTouch: true,
        emitBombEvent: true,
        bombEventName: 'bomb-collected'
    },

    onLoad: function () {
        this.body = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsCollider);
        this.revealed = false;
        this.landed = false;
        this.collected = false;
        this.initialGravityScale = 1;

        if (this.body) {
            this.initialGravityScale = this.body.gravityScale;
            this.body.type = cc.RigidBodyType.Dynamic;
            this.body.gravityScale = 0;
            this.body.enabledContactListener = true;
            this.body.fixedRotation = true;
            this.body.linearVelocity = cc.v2();
        }

        if (this.collider) {
            this.collider.enabled = false;
        }
    },

    update: function () {
        if (!this.body || !this.revealed || this.collected) {
            return;
        }

        var velocity = this.body.linearVelocity;
        if (velocity.x !== 0) {
            velocity.x = 0;
            this.body.linearVelocity = velocity;
        }
    },

    reveal: function (verticalDirection) {
        if (this.revealed) {
            return;
        }

        verticalDirection = verticalDirection < 0 ? -1 : 1;

        if (this.body) {
            this.body.gravityScale = 0;
            this.body.linearVelocity = cc.v2();
        }

        var startY = this.node.y;
        var rise = cc.moveTo(
            this.revealDuration,
            cc.v2(this.node.x, startY + this.revealHeight * verticalDirection)
        )
            .easing(cc.easeCubicActionOut());
        var activate = cc.callFunc(function () {
            this.revealed = true;

            if (this.body) {
                this.body.type = cc.RigidBodyType.Dynamic;
                this.body.gravityScale = this.initialGravityScale;
                this.body.awake = true;
                this.body.linearVelocity = cc.v2(0, 0);
            }

            if (this.collider) {
                this.collider.enabled = true;
                this.collider.apply();
            }
        }, this);

        this.node.runAction(cc.sequence(rise, activate));
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        if (!this.revealed || this.collected) {
            return;
        }

        if (this.isPlayerCollider(otherCollider)) {
            this.handlePlayerTouch();
            return;
        }

        if (this.stopOnGround && this.isGroundContact(contact)) {
            this.landAndStop();
        }
    },

    onPreSolve: function (contact, selfCollider, otherCollider) {
        if (!this.revealed || this.collected) {
            return;
        }

        if (this.isPlayerCollider(otherCollider)) {
            return;
        }

        contact.setFriction(1);

        if (this.stopOnGround && this.isGroundContact(contact)) {
            this.landAndStop();
        }
    },

    isGroundContact: function (contact) {
        if (!contact || !contact.getWorldManifold) {
            return false;
        }

        var normal = contact.getWorldManifold().normal;
        var velocityY = this.body ? this.body.linearVelocity.y : 0;
        return normal && Math.abs(normal.y) >= this.groundNormalY && velocityY <= 0;
    },

    landAndStop: function () {
        if (this.landed) {
            return;
        }

        this.landed = true;

        if (!this.body) {
            return;
        }

        this.body.linearVelocity = cc.v2(0, 0);
        this.body.angularVelocity = 0;
        this.body.gravityScale = 0;
        this.body.type = cc.RigidBodyType.Static;
        this.body.awake = true;
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
            if (node.getComponent('PinkMonsterPhysicsController') || node.getComponent('PinkMonsterController')) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    handlePlayerTouch: function () {
        if (!this.destroyOnPlayerTouch) {
            return;
        }

        this.collected = true;

        if (this.emitBombEvent) {
            cc.director.emit(this.bombEventName);
        }

        this.node.destroy();
    }
});
