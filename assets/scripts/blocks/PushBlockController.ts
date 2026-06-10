/*
 * PushBlockController
 * -------------------
 * 可被玩家水平推動的方塊控制腳本。
 *
 * 掛載節點：
 * - Level/PushBlocks/PushBlock_Blue
 *
 * 節點需求：
 * - cc.Sprite：圖片指定為 block_blue
 * - cc.BoxCollider：碰撞範圍對齊方塊圖片
 * - PushBlockController：控制重力、玩家推動與簡單邊界限制
 *
 * 使用方式：
 * - 玩家按住 S 並從左右側碰到方塊時，PinkMonsterController 會呼叫 tryPush()
 * - 方塊會受重力往下掉，碰到地面或平台的 BoxCollider 後停住
 */
cc.Class({
    extends: cc.Component,

    properties: {
        pushMultiplier: 1,
        gravity: 900,
        fallLimitY: -320,
        groundContactGrace: 0.2,
        useHorizontalBounds: false,
        minX: -99999,
        maxX: 99999,
        collisionSkin: 0.5,
        respawnYOffset: 80
    },

    onLoad: function () {
        this.spawnX = this.node.x;
        this.spawnY = this.node.y;
        this.previousX = this.node.x;
        this.previousY = this.node.y;
        this.velocityY = 0;
        this.isGrounded = false;
        this.groundContactTimer = 0;

        var collisionManager = cc.director.getCollisionManager();
        collisionManager.enabled = true;
    },

    update: function (dt) {
        this.previousX = this.node.x;
        this.previousY = this.node.y;

        this.updateGroundContact(dt);

        if (!this.isGrounded || this.velocityY !== 0) {
            this.velocityY -= this.gravity * dt;
            this.node.y += this.velocityY * dt;

            if (this.node.y <= this.fallLimitY) {
                this.respawnAfterFall();
            }
        }
    },

    respawnAfterFall: function () {
        this.node.x = this.spawnX;
        this.node.y = this.spawnY + this.respawnYOffset;
        this.previousX = this.node.x;
        this.previousY = this.node.y;
        this.velocityY = 0;
        this.isGrounded = false;
        this.groundContactTimer = 0;
    },

    tryPush: function (direction, distance) {
        if (direction === 0 || distance <= 0) {
            return false;
        }

        this.node.x += direction * distance * this.pushMultiplier;
        this.applyHorizontalBounds();
        return true;
    },

    updateGroundContact: function (dt) {
        if (!this.isGrounded) {
            return;
        }

        this.groundContactTimer -= dt;

        if (this.groundContactTimer <= 0) {
            this.isGrounded = false;
        }
    },

    applyHorizontalBounds: function () {
        if (!this.useHorizontalBounds) {
            return;
        }

        this.node.x = cc.misc.clampf(this.node.x, this.minX, this.maxX);
    },

    onCollisionEnter: function (other, self) {
        this.resolveSolidCollision(other, self);
    },

    onCollisionStay: function (other, self) {
        this.resolveSolidCollision(other, self);
    },

    resolveSolidCollision: function (other, self) {
        if (!other.world || !self.world || other.node.getComponent('PinkMonsterController')) {
            return;
        }

        var selfAabb = self.world.aabb;
        var otherAabb = other.world.aabb;

        if (!selfAabb.intersects(otherAabb)) {
            return;
        }

        var deltaX = this.node.x - this.previousX;
        var deltaY = this.node.y - this.previousY;
        var previousBottom = selfAabb.yMin - deltaY;
        var previousTop = selfAabb.yMax - deltaY;
        var previousLeft = selfAabb.xMin - deltaX;
        var previousRight = selfAabb.xMax - deltaX;
        var overlapLeft = selfAabb.xMax - otherAabb.xMin;
        var overlapRight = otherAabb.xMax - selfAabb.xMin;
        var overlapBottom = selfAabb.yMax - otherAabb.yMin;
        var overlapTop = otherAabb.yMax - selfAabb.yMin;
        var groundOverlap = 0.1;
        var tolerance = 3;
        var skin = this.collisionSkin;

        if (this.velocityY <= 0 && previousBottom >= otherAabb.yMax - tolerance) {
            this.node.y += Math.max(0, overlapTop - groundOverlap);
            this.velocityY = 0;
            this.isGrounded = true;
            this.groundContactTimer = this.groundContactGrace;
            return;
        }

        if (this.velocityY > 0 && previousTop <= otherAabb.yMin + tolerance) {
            this.node.y -= overlapBottom + skin;
            this.velocityY = 0;
            return;
        }

        if (deltaX < 0 && previousLeft >= otherAabb.xMax - tolerance) {
            this.node.x += overlapRight + skin;
        } else if (deltaX > 0 && previousRight <= otherAabb.xMin + tolerance) {
            this.node.x -= overlapLeft + skin;
        }

        this.applyHorizontalBounds();
    }
});
