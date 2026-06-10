/*
 * CloudLayerDrift
 * ----------------
 * Level 2 背景雲層的自動漂移腳本。
 *
 * 這個元件會記錄節點一開始的位置，並在每一幀依照設定的水平 / 垂直速度
 * 讓雲層持續位移。同時也可以透過 sin / cos 產生小幅度的浮動效果，讓背景
 * 看起來更自然、有空氣流動感。
 *
 * 可調參數：
 * - speedX / speedY：雲層每秒固定漂移的速度。
 * - floatRangeX / floatRangeY：週期性浮動的最大範圍。
 * - floatSpeed：浮動波形的變化速度。
 */
cc.Class({
    extends: cc.Component,

    properties: {
        speedX: 0,
        speedY: 0,
        floatRangeX: 0,
        floatRangeY: 0,
        floatSpeed: 0.25
    },

    // 初始化雲層起始位置與累積時間。
    onLoad: function () {
        this.startPos = this.node.position.clone();
        this.elapsed = 0;
    },

    // 每幀更新雲層的線性漂移與週期浮動位置。
    update: function (dt) {
        this.elapsed += dt;

        var driftX = this.speedX * this.elapsed;
        var driftY = this.speedY * this.elapsed;
        var waveX = Math.sin(this.elapsed * this.floatSpeed) * this.floatRangeX;
        var waveY = Math.cos(this.elapsed * this.floatSpeed) * this.floatRangeY;

        this.node.setPosition(
            this.startPos.x + driftX + waveX,
            this.startPos.y + driftY + waveY
        );
    }
});
