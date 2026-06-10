/*
 * MovingPlatformController
 * ------------------------
 * Attach this to a platform parent node. Child platform pieces move together.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        targetX: 2000,
        moveSpeed: 140,
        startOnLoad: true,
        pauseAtEnds: 0.2,
        showChildrenOnLoad: true
    },

    onLoad: function () {
        if (this.showChildrenOnLoad) {
            this.showNodeAndChildren(this.node);
        }

        this.startX = this.node.x;
        this.lastX = this.node.x;
        this.deltaX = 0;
        this.isMoving = false;
    },

    update: function () {
        this.deltaX = this.node.x - this.lastX;
        this.lastX = this.node.x;
    },

    getDeltaX: function () {
        return this.deltaX || 0;
    },

    start: function () {
        if (this.startOnLoad) {
            this.startMoving();
        }
    },

    startMoving: function () {
        if (this.isMoving) {
            return;
        }

        var distance = Math.abs(this.targetX - this.startX);

        if (distance <= 0 || this.moveSpeed <= 0) {
            return;
        }

        var duration = distance / this.moveSpeed;
        var startPosition = cc.v2(this.startX, this.node.y);
        var targetPosition = cc.v2(this.targetX, this.node.y);
        var moveLoop = cc.repeatForever(cc.sequence(
            cc.moveTo(duration, targetPosition),
            cc.delayTime(this.pauseAtEnds),
            cc.moveTo(duration, startPosition),
            cc.delayTime(this.pauseAtEnds)
        ));

        this.node.stopAllActions();
        this.node.setPosition(startPosition);
        this.lastX = this.node.x;
        this.deltaX = 0;
        this.node.runAction(moveLoop);
        this.isMoving = true;
    },

    stopMoving: function () {
        this.node.stopAllActions();
        this.isMoving = false;
    },

    showNodeAndChildren: function (node) {
        if (!node) {
            return;
        }

        node.active = true;
        node.opacity = 255;

        var children = node.getChildren ? node.getChildren() : [];

        for (var i = 0; i < children.length; i++) {
            this.showNodeAndChildren(children[i]);
        }
    }
});
