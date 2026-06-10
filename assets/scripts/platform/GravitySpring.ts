/**
 * GravitySpring.ts
 * Scene: Level2-part2
 * Attach to: A spring platform with a physics sensor.
 * Launches the player relative to gravity and briefly displays the extended spring frame.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        springFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        springOutFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        springOutOffsetY: 20,
        outDuration: 0.25,
        triggerCooldown: 0.4,
        colliderWidth: 56,
        colliderHeight: 20,
        colliderOffsetY: -18
    },

    onLoad: function () {
        this.sprite = this.createVisualSprite();
        this.cooldownTimer = 0;

        if (this.springFrame) {
            this.sprite.spriteFrame = this.springFrame;
        }

        var body = this.getComponent(cc.RigidBody) || this.node.addComponent(cc.RigidBody);
        body.type = cc.RigidBodyType.Static;
        body.enabledContactListener = true;

        var collider = this.getComponent(cc.PhysicsBoxCollider) ||
            this.node.addComponent(cc.PhysicsBoxCollider);
        collider.size = cc.size(this.colliderWidth, this.colliderHeight);
        collider.offset = cc.v2(0, this.colliderOffsetY);
        collider.friction = 0.8;
        collider.apply();
    },

    createVisualSprite: function () {
        var rootSprite = this.getComponent(cc.Sprite);
        var visualNode = this.node.getChildByName('Spring Visual');

        if (!visualNode) {
            visualNode = new cc.Node('Spring Visual');
            visualNode.setPosition(0, 0);
            this.node.addChild(visualNode);
        }

        var visualSprite = visualNode.getComponent(cc.Sprite) ||
            visualNode.addComponent(cc.Sprite);

        if (rootSprite) {
            visualSprite.spriteFrame = rootSprite.spriteFrame;
            visualSprite.sizeMode = rootSprite.sizeMode;
            rootSprite.enabled = false;
        }

        this.visualNode = visualNode;
        return visualSprite;
    },

    update: function (dt) {
        this.cooldownTimer = Math.max(this.cooldownTimer - dt, 0);
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        if (this.cooldownTimer > 0 || !otherCollider || !otherCollider.node) {
            return;
        }

        var player = this.findPlayerController(otherCollider.node);
        if (!player || !player.toggleGravityDirection) {
            return;
        }

        var normal = contact && contact.getWorldManifold
            ? contact.getWorldManifold().normal
            : null;

        if (normal && Math.abs(normal.y) <= 0.5) {
            return;
        }

        this.cooldownTimer = this.triggerCooldown;
        this.playSpringOut();
        player.toggleGravityDirection();
    },

    playSpringOut: function () {
        if (this.sprite && this.springOutFrame) {
            this.sprite.spriteFrame = this.springOutFrame;
        }
        this.visualNode.y = this.springOutOffsetY;

        this.unschedule(this.restoreSpringFrame);
        this.scheduleOnce(this.restoreSpringFrame, this.outDuration);
    },

    restoreSpringFrame: function () {
        if (this.sprite && this.springFrame) {
            this.sprite.spriteFrame = this.springFrame;
        }
        this.visualNode.y = 0;
    },

    findPlayerController: function (node) {
        while (node && node.parent) {
            var controller = node.getComponent('PinkMonsterPhysicsController');
            if (controller) {
                return controller;
            }

            node = node.parent;
        }

        return null;
    }
});
