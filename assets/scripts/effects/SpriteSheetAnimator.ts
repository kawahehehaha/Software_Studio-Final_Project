/*
 * SpriteSheetAnimator
 * -------------------
 * Level 2 使用的簡易 spritesheet 動畫播放器。
 *
 * 這個元件會把一張橫向排列的 spritesheet 依照 frameWidth、frameHeight 與
 * frameCount 切成多個 SpriteFrame，並依照 framesPerSecond 在 update 中逐格播放。
 * PinkMonsterController 會透過 playSheet 動態切換不同動作的貼圖，例如 idle、
 * run、jump、attack、death 等。
 *
 * 可調參數：
 * - sprite：要顯示動畫的 cc.Sprite，可自動抓取同節點上的 Sprite。
 * - texture：spritesheet 貼圖。
 * - frameWidth / frameHeight：每一格動畫的尺寸。
 * - frameCount：總格數。
 * - framesPerSecond：播放速度。
 * - loop：是否循環播放。
 * - playOnLoad：載入或啟用時是否自動播放。
 */
cc.Class({
    extends: cc.Component,

    editor: {
        executeInEditMode: true
    },

    properties: {
        sprite: {
            default: null,
            type: cc.Sprite
        },
        texture: {
            default: null,
            type: cc.Texture2D
        },
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 4,
        framesPerSecond: 8,
        loop: true,
        playOnLoad: true
    },

    // 節點載入時建立並準備動畫資料。
    onLoad: function () {
        this.setupAnimation();
    },

    // 節點啟用時重新整理動畫資料，方便編輯器與重啟使用。
    onEnable: function () {
        this.setupAnimation();
    },

    // 初始化 Sprite、播放狀態與影格資料。
    setupAnimation: function () {
        if (!this.sprite) {
            this.sprite = this.getComponent(cc.Sprite);
        }

        this.frames = [];
        this.currentFrame = 0;
        this.elapsed = 0;
        this.isPlaying = false;

        this.buildFrames();

        if (this.playOnLoad) {
            this.play();
        }
    },

    // 依照 spritesheet 設定切出每一格 SpriteFrame。
    buildFrames: function () {
        this.frames.length = 0;

        if (!this.texture) {
            return;
        }

        for (var i = 0; i < this.frameCount; i++) {
            var rect = cc.rect(i * this.frameWidth, 0, this.frameWidth, this.frameHeight);
            var frame = new cc.SpriteFrame(this.texture, rect);
            this.frames.push(frame);
        }

        if (this.sprite && this.frames.length > 0) {
            this.sprite.spriteFrame = this.frames[0];
        }
    },

    // 從第一格開始播放目前已建立的動畫。
    play: function () {
        if (this.frames.length === 0) {
            this.buildFrames();
        }

        this.currentFrame = 0;
        this.elapsed = 0;
        this.isPlaying = true;

        if (this.sprite && this.frames.length > 0) {
            this.sprite.spriteFrame = this.frames[0];
        }
    },

    // 切換到新的 spritesheet 設定並立即播放。
    playSheet: function (texture, frameCount, framesPerSecond, loop) {
        this.texture = texture;
        this.frameCount = frameCount;
        this.framesPerSecond = framesPerSecond;
        this.loop = loop;
        this.buildFrames();
        this.play();
    },

    // 停止目前動畫播放。
    stop: function () {
        this.isPlaying = false;
    },

    // 依照時間累積切換到下一格動畫。
    update: function (dt) {
        if (!this.isPlaying || this.frames.length === 0 || this.framesPerSecond <= 0) {
            return;
        }

        this.elapsed += dt;
        var frameTime = 1 / this.framesPerSecond;

        while (this.elapsed >= frameTime) {
            this.elapsed -= frameTime;
            this.currentFrame += 1;

            if (this.currentFrame >= this.frames.length) {
                if (this.loop) {
                    this.currentFrame = 0;
                } else {
                    this.currentFrame = this.frames.length - 1;
                    this.isPlaying = false;
                }
            }

            this.sprite.spriteFrame = this.frames[this.currentFrame];
        }
    }
});
