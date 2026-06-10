/*
 * ExclamationSwitchBlockController
 * --------------------------------
 * Put this on the special exclamation block node.
 * Assign:
 * - blockSprite: the cc.Sprite showing block_exclamation
 * - switchSprite: the cc.Sprite showing switch_blue
 * - normal/active block frames and normal/pressed switch frames
 *
 * The block becomes active only when a PushBlockController whose node or
 * sprite frame is named block_blue is pressing the switch from above.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        blockSprite: {
            default: null,
            type: cc.Sprite
        },
        switchNode: {
            default: null,
            type: cc.Node
        },
        switchSprite: {
            default: null,
            type: cc.Sprite
        },
        switchCollider: {
            default: null,
            type: cc.BoxCollider
        },
        blockNormalFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        blockActiveFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        switchNormalFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        switchPressedFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        requiredBlockName: 'block_blue',
        pressTolerance: 6,
        minHorizontalOverlap: 8,
        ladderNodes: {
            default: [],
            type: [cc.Node]
        },
        checkpointNodes: {
            default: [],
            type: [cc.Node]
        },
        revealLadderOnce: true,
        ladderRevealInterval: 0.12,
        ladderRevealDuration: 0.18
    },

    onLoad: function () {
        if (!this.blockSprite) {
            this.blockSprite = this.getComponent(cc.Sprite);
        }

        if (!this.switchNode) {
            this.switchNode = this.node.getChildByName('switch_blue') ||
                this.node.getChildByName('Switch_Blue') ||
                this.node.getChildByName('SwitchBlue');
        }

        if (!this.switchSprite && this.switchNode) {
            this.switchSprite = this.switchNode.getComponent(cc.Sprite);
        }

        if (!this.switchCollider && this.switchNode) {
            this.switchCollider = this.switchNode.getComponent(cc.BoxCollider);
        }

        if (!this.blockNormalFrame && this.blockSprite) {
            this.blockNormalFrame = this.blockSprite.spriteFrame;
        }

        if (!this.switchNormalFrame && this.switchSprite) {
            this.switchNormalFrame = this.switchSprite.spriteFrame;
        }

        this.isPressed = false;
        this.hasRevealedLadder = false;
        this.collectAutoCheckpointNodes();
        this.setupLadderNodes();
        this.setupCheckpointNodes();
        this.applyPressedState(false);

        var collisionManager = cc.director.getCollisionManager();
        collisionManager.enabled = true;
    },

    update: function () {
        this.applyPressedState(this.isBlueBlockPressingSwitch());
    },

    isBlueBlockPressingSwitch: function () {
        var switchAabb = this.getSwitchAabb();

        if (!switchAabb) {
            return false;
        }

        var scene = cc.director.getScene();
        var blocks = scene && scene.getComponentsInChildren ?
            scene.getComponentsInChildren('PushBlockController') :
            [];

        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i];

            if (!this.isRequiredBlock(block)) {
                continue;
            }

            var blockAabb = this.getNodeAabb(block.node);

            if (blockAabb && this.isPressingFromAbove(blockAabb, switchAabb)) {
                return true;
            }
        }

        return false;
    },

    isRequiredBlock: function (block) {
        if (!block || !block.node) {
            return false;
        }

        if (block.node.name === this.requiredBlockName) {
            return true;
        }

        var sprite = block.node.getComponent(cc.Sprite);
        var frameName = sprite && sprite.spriteFrame ? sprite.spriteFrame.name : '';

        return frameName === this.requiredBlockName;
    },

    isPressingFromAbove: function (blockAabb, switchAabb) {
        var horizontalOverlap = Math.min(blockAabb.xMax, switchAabb.xMax) -
            Math.max(blockAabb.xMin, switchAabb.xMin);
        var nearSwitchTop = blockAabb.yMin <= switchAabb.yMax + this.pressTolerance;
        var aboveSwitchBase = blockAabb.yMin >= switchAabb.yMin - this.pressTolerance;
        var blockReachesSwitch = blockAabb.yMax > switchAabb.yMin;

        return horizontalOverlap >= this.minHorizontalOverlap &&
            nearSwitchTop &&
            aboveSwitchBase &&
            blockReachesSwitch;
    },

    getSwitchAabb: function () {
        if (this.switchCollider && this.switchCollider.world) {
            return this.switchCollider.world.aabb;
        }

        return this.switchNode ? this.switchNode.getBoundingBoxToWorld() : null;
    },

    getNodeAabb: function (node) {
        var collider = node.getComponent(cc.BoxCollider);

        if (collider && collider.world) {
            return collider.world.aabb;
        }

        return node.getBoundingBoxToWorld();
    },

    applyPressedState: function (pressed) {
        if (this.isPressed === pressed) {
            return;
        }

        this.isPressed = pressed;

        if (this.blockSprite) {
            this.blockSprite.spriteFrame = pressed && this.blockActiveFrame ?
                this.blockActiveFrame :
                this.blockNormalFrame;
        }

        if (this.switchSprite) {
            this.switchSprite.spriteFrame = pressed && this.switchPressedFrame ?
                this.switchPressedFrame :
                this.switchNormalFrame;
        }

        if (pressed && (!this.revealLadderOnce || !this.hasRevealedLadder)) {
            this.revealLadder();
        }
    },

    collectAutoCheckpointNodes: function () {
        if (this.checkpointNodes.length > 0) {
            return;
        }

        var scene = cc.director.getScene();

        if (!scene) {
            return;
        }

        var checkpoint = this.findNodeByName(scene, 'checkpoint1');

        if (checkpoint) {
            this.checkpointNodes.push(checkpoint);
        }
    },

    setupLadderNodes: function () {
        for (var i = 0; i < this.ladderNodes.length; i++) {
            var ladder = this.ladderNodes[i];

            if (!ladder) {
                continue;
            }

            ladder.active = true;
            ladder.opacity = 0;
            ladder.scaleY = 0.05;
            this.setNodeCollidersEnabled(ladder, false);
        }
    },

    setupCheckpointNodes: function () {
        for (var i = 0; i < this.checkpointNodes.length; i++) {
            this.setupRevealNode(this.checkpointNodes[i]);
        }
    },

    revealLadder: function () {
        this.hasRevealedLadder = true;

        for (var i = 0; i < this.ladderNodes.length; i++) {
            this.scheduleRevealLadderNode(this.ladderNodes[i], i);
        }

        for (var j = 0; j < this.checkpointNodes.length; j++) {
            this.scheduleRevealLadderNode(this.checkpointNodes[j], this.ladderNodes.length + j);
        }
    },

    scheduleRevealLadderNode: function (ladder, index) {
        if (!ladder) {
            return;
        }

        this.scheduleOnce(function () {
            ladder.active = true;
            ladder.stopAllActions();
            this.setNodeOpacity(ladder, 0);
            ladder.scaleY = 0.05;
            ladder.runAction(cc.spawn(
                cc.fadeIn(this.ladderRevealDuration),
                cc.scaleTo(this.ladderRevealDuration, ladder.scaleX, 1).easing(cc.easeBackOut())
            ));
            this.fadeChildRenderNodes(ladder, this.ladderRevealDuration);
            this.setNodeCollidersEnabled(ladder, true);
            this.setNodeComponentsEnabled(ladder, 'CheckpointController', true);
        }, index * this.ladderRevealInterval);
    },

    setupRevealNode: function (node) {
        if (!node) {
            return;
        }

        node.active = true;
        this.setNodeOpacity(node, 0);
        node.scaleY = 0.05;
        this.setNodeCollidersEnabled(node, false);
        this.setNodeComponentsEnabled(node, 'CheckpointController', false);
    },

    findNodeByName: function (node, name) {
        if (!node) {
            return null;
        }

        if (node.name === name) {
            return node;
        }

        var children = node.getChildren ? node.getChildren() : [];

        for (var i = 0; i < children.length; i++) {
            var found = this.findNodeByName(children[i], name);

            if (found) {
                return found;
            }
        }

        return null;
    },

    setNodeCollidersEnabled: function (node, enabled) {
        var colliders = node.getComponentsInChildren(cc.BoxCollider);

        for (var i = 0; i < colliders.length; i++) {
            colliders[i].enabled = enabled;
        }
    },

    setNodeComponentsEnabled: function (node, componentName, enabled) {
        var components = node.getComponentsInChildren(componentName);

        for (var i = 0; i < components.length; i++) {
            components[i].enabled = enabled;
        }
    },

    setNodeOpacity: function (node, opacity) {
        node.opacity = opacity;

        var children = node.getChildren ? node.getChildren() : [];

        for (var i = 0; i < children.length; i++) {
            this.setNodeOpacity(children[i], opacity);
        }
    },

    fadeChildRenderNodes: function (node, duration) {
        var children = node.getChildren ? node.getChildren() : [];

        for (var i = 0; i < children.length; i++) {
            children[i].stopAllActions();
            children[i].opacity = 0;
            children[i].runAction(cc.fadeIn(duration));
            this.fadeChildRenderNodes(children[i], duration);
        }
    }
});
