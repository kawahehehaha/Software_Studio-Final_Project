/**
 * OneWayPlatform.ts
 * Scene: Level2-part2
 * Attach to: A one-way physics platform.
 * Disables contacts from the pass-through side and accepts configured actor nodes.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        playerNodeName: 'Player',
        actorNodeNames: 'Player,Goomba,Turtle',
        ignoredActorNodeNames: '',
        skinWidth: 4,
        allowCollisionWhenFallingOnly: true
    },

    onLoad: function () {
        var body = this.getComponent(cc.RigidBody);

        if (body) {
            body.type = cc.RigidBodyType.Static;
            body.enabledContactListener = true;
        }
    },

    onPreSolve: function (contact, selfCollider, otherCollider) {
        if (!this.isOneWayActorCollider(otherCollider)) {
            return;
        }

        var platformBounds = this.getColliderWorldBounds(selfCollider);
        var actorBounds = this.getColliderWorldBounds(otherCollider);

        if (!platformBounds || !actorBounds) {
            contact.disabledOnce = true;
            return;
        }

        var actorBody = otherCollider.body;
        var actorVelocityY = actorBody ? actorBody.linearVelocity.y : 0;
        var verticalDirection = this.node.scaleY < 0 ? -1 : 1;
        var actorIsOnSolidSide;
        var actorIsMovingTowardPlatform;

        if (verticalDirection > 0) {
            actorIsOnSolidSide =
                actorBounds.yMin >= platformBounds.yMax - this.skinWidth;
            actorIsMovingTowardPlatform = actorVelocityY <= 0;
        } else {
            actorIsOnSolidSide =
                actorBounds.yMax <= platformBounds.yMin + this.skinWidth;
            actorIsMovingTowardPlatform = actorVelocityY >= 0;
        }

        var shouldCollide = actorIsOnSolidSide &&
            (!this.allowCollisionWhenFallingOnly || actorIsMovingTowardPlatform);

        if (!shouldCollide) {
            contact.disabledOnce = true;
        }
    },

    isOneWayActorCollider: function (collider) {
        if (!collider || !collider.node) {
            return false;
        }

        if (this.matchesNodeList(collider.node, this.ignoredActorNodeNames)) {
            return false;
        }

        var node = collider.node;
        while (node && node.parent) {
            if (this.matchesNodeList(node, this.actorNodeNames) ||
                node.name === this.playerNodeName ||
                node.getComponent('PinkMonsterPhysicsController')) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    matchesNodeList: function (node, namesText) {
        if (!node || !namesText) {
            return false;
        }

        var names = namesText.split(',');
        for (var i = 0; i < names.length; i += 1) {
            if (node.name === names[i].trim()) {
                return true;
            }
        }

        return false;
    },

    getColliderWorldBounds: function (collider) {
        if (!collider || !collider.node) {
            return null;
        }

        var offset = collider.offset || cc.v2();
        var size = collider.size || collider.node.getContentSize();
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
