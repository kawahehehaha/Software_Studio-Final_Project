/*
 * RampController
 * --------------
 * 掛在斜坡控制節點上，並搭配同節點的 BoxCollider 使用。
 *
 * BoxCollider 只負責提供矩形偵測範圍，不代表實際碰撞斜面。
 * PinkMonsterController 會用玩家腳底的世界 X 座標詢問這個腳本斜面高度，
 * 再把玩家吸附到計算出的斜線上。
 *
 * direction = "left" 代表左高右低；direction = "right" 代表右高左低。
 */
cc.Class({
    extends: cc.Component,

    properties: {
        // "left"：左高右低；"right"：右高左低。
        direction: 'left',
        height: 0,
        snapUpDistance: 12,
        snapDownDistance: 28
    },

    // 快取斜坡使用的 BoxCollider，作為世界座標偵測範圍。
    onLoad: function () {
        this.collider = this.getComponent(cc.BoxCollider);

        if (!this.collider) {
            cc.warn('RampController needs a BoxCollider on the same node.');
        }
    },

    // 取得斜坡偵測範圍的世界座標 AABB。
    getAabb: function () {
        if (this.collider && this.collider.world) {
            return this.collider.world.aabb;
        }

        return this.node.getBoundingBoxToWorld();
    },

    // 用世界 X 座標計算斜坡表面的世界 Y 座標。
    getSurfaceY: function (worldX) {
        var aabb = this.getAabb();
        var width = aabb.xMax - aabb.xMin;
        var rampHeight = this.height > 0 ? this.height : (aabb.yMax - aabb.yMin);

        if (width <= 0) {
            return aabb.yMin;
        }

        var t = (worldX - aabb.xMin) / width;
        t = cc.misc.clampf(t, 0, 1);

        if (this.direction === 'left') {
            t = 1 - t;
        }

        return aabb.yMin + t * rampHeight;
    },

    // 檢查世界 X 座標是否落在斜坡寬度內。
    containsWorldX: function (worldX) {
        var aabb = this.getAabb();
        return worldX >= aabb.xMin && worldX <= aabb.xMax;
    },

    // 回傳玩家在斜坡上受重力下滑時的水平方向。
    getDownhillDirection: function () {
        return this.direction === 'left' ? 1 : -1;
    }
});
