/*
 * Level2-only ramp surface used by PinkMonsterController.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        direction: 'left',
        height: 0,
        snapUpDistance: 12,
        snapDownDistance: 28
    },

    onLoad: function () {
        this.collider = this.getComponent(cc.BoxCollider);

        if (!this.collider) {
            cc.warn('Level2RampController needs a BoxCollider on the same node.');
        }
    },

    getAabb: function () {
        if (this.collider && this.collider.world) {
            return this.collider.world.aabb;
        }

        return this.node.getBoundingBoxToWorld();
    },

    getSurfaceY: function (worldX) {
        var aabb = this.getAabb();
        var width = aabb.xMax - aabb.xMin;
        var rampHeight = this.height > 0 ? this.height : (aabb.yMax - aabb.yMin);

        if (width <= 0) {
            return aabb.yMin;
        }

        var t = cc.misc.clampf((worldX - aabb.xMin) / width, 0, 1);
        if (this.direction === 'left') {
            t = 1 - t;
        }

        return aabb.yMin + t * rampHeight;
    },

    containsWorldX: function (worldX) {
        var aabb = this.getAabb();
        return worldX >= aabb.xMin && worldX <= aabb.xMax;
    },

    getDownhillDirection: function () {
        return this.direction === 'left' ? 1 : -1;
    }
});
