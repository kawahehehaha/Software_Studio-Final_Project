/**
 * CrashCrewHud.ts
 * Scene: Level2 and Level2-part2
 * Attach to: The HUD root or a scene UI controller.
 * Displays resources, timer, and hearts while preserving run state across both scene parts.
 */
var level2RunState = null;

cc.Class({
    extends: cc.Component,

    properties: {
        coinIconFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        bombIconFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        timeIconFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        starIconFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        digitFrames: {
            default: [],
            type: [cc.SpriteFrame]
        },
        multiplyFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        heartFullFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        heartHalfFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        heartEmptyFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        countFont: {
            default: null,
            type: cc.BitmapFont
        },
        hudParentNodeName: 'Main Camera',
        hudLayerNodeName: 'HUD',
        attachToCamera: false,
        raiseCanvasAboveWorld: false,
        startHearts: 3,
        startTime: 300,
        bombGainPerCollect: 3,
        marginY: 28,
        leftMarginX: 54,
        itemGap: 130,
        rightMarginX: 96,
        iconScale: 1.1,
        coinIconScale: 1.1,
        starIconScale: 1.1,
        digitScale: 1.6,
        heartScale: 1.15,
        heartGap: 22,
        heartOffsetY: 0,
        coinBombOffsetX: 0,
        digitGap: 22,
        labelScale: 2.2,
        counterOffsetX: 24,
        counterOffsetY: -18,
        lifeRestoreInterval: 0.2,
        useTimer: true,
        debugVisible: false
    },

    onLoad: function () {
        this.loadedSceneName = this.getSceneName();
        this.coins = 0;
        this.bombs = 0;
        this.stars = 0;
        this.currentLifeHalves = Math.max(Math.floor(this.startHearts || 0), 0) * 2;
        this.remainingTime = Math.max(Math.floor(this.startTime || 0), 0);
        this.elapsedTime = 0;
        this.lifeRestoreTimer = 0;
        this.isRestoringLife = false;
        this.frozen = false;
        this.gameOverTriggered = false;
        this.labels = {};
        this.valueRoots = {};
        this.heartNodes = [];

        this.restoreLevel2RunState();
        this.createHud();
        this.updateAllValues();

        cc.director.on('coin-collected', this.addCoin, this);
        cc.director.on('bomb-collected', this.addBombs, this);
        cc.director.on('star-collected', this.addStars, this);
        cc.director.on('player-life-lost', this.loseLife, this);
        cc.director.on('player-life-restored', this.restoreFullLife, this);
        cc.director.on('level2-part-transition', this.saveLevel2RunState, this);
    },

    onDestroy: function () {
        this.saveLevel2RunState();

        cc.director.off('coin-collected', this.addCoin, this);
        cc.director.off('bomb-collected', this.addBombs, this);
        cc.director.off('star-collected', this.addStars, this);
        cc.director.off('player-life-lost', this.loseLife, this);
        cc.director.off('player-life-restored', this.restoreFullLife, this);
        cc.director.off('level2-part-transition', this.saveLevel2RunState, this);
    },

    restoreLevel2RunState: function () {
        var sceneName = this.loadedSceneName;

        if (sceneName === 'Level2') {
            level2RunState = null;
            return;
        }

        if (sceneName !== 'Level2-part2' || !level2RunState) {
            return;
        }

        this.coins = level2RunState.coins;
        this.bombs = level2RunState.bombs;
        this.stars = level2RunState.stars;
        this.currentLifeHalves = level2RunState.currentLifeHalves;
        this.remainingTime = level2RunState.remainingTime;
        this.elapsedTime = level2RunState.elapsedTime;
        this.lifeRestoreTimer = level2RunState.lifeRestoreTimer;
        this.isRestoringLife = level2RunState.isRestoringLife;
        this.frozen = level2RunState.frozen;
    },

    saveLevel2RunState: function () {
        var sceneName = this.loadedSceneName;
        if (sceneName !== 'Level2' && sceneName !== 'Level2-part2') {
            return;
        }

        level2RunState = {
            coins: this.coins,
            bombs: this.bombs,
            stars: this.stars,
            currentLifeHalves: this.currentLifeHalves,
            remainingTime: this.remainingTime,
            elapsedTime: this.elapsedTime,
            lifeRestoreTimer: this.lifeRestoreTimer,
            isRestoringLife: this.isRestoringLife,
            frozen: this.frozen
        };
    },

    getSceneName: function () {
        var scene = cc.director.getScene();
        return scene ? scene.name : '';
    },

    update: function (dt) {
        this.updateLifeRestore(dt);

        if (!this.useTimer || this.frozen || this.remainingTime <= 0) {
            return;
        }

        this.elapsedTime += dt;

        while (this.elapsedTime >= 1 && this.remainingTime > 0) {
            this.elapsedTime -= 1;
            this.remainingTime -= 1;
            this.updateCounter('time', this.remainingTime);
        }
    },

    lateUpdate: function () {
        this.syncHudLayerToCamera();
    },

    getCoinCount: function () {
        return Math.max(Math.floor(this.coins || 0), 0);
    },

    getBombCount: function () {
        return Math.max(Math.floor(this.bombs || 0), 0);
    },

    getStarCount: function () {
        return Math.max(Math.floor(this.stars || 0), 0);
    },

    spendBomb: function (amount) {
        var cost = Math.max(Math.floor(amount || 1), 1);
        if (this.bombs < cost) {
            return false;
        }

        this.bombs -= cost;
        this.updateCounter('bomb', this.bombs);
        return true;
    },

    freezeTime: function () {
        this.frozen = true;
    },

    addCoin: function () {
        this.coins += 1;
        this.updateCounter('coin', this.coins);
    },

    addBombs: function () {
        this.bombs += Math.max(Math.floor(this.bombGainPerCollect || 0), 0);
        this.updateCounter('bomb', this.bombs);
    },

    addStars: function (amount) {
        this.stars += Math.max(Math.floor(amount || 1), 1);
        this.updateCounter('star', this.stars);
    },

    loseLife: function () {
        if (this.gameOverTriggered) {
            return;
        }

        this.currentLifeHalves = Math.max(this.currentLifeHalves - 1, 0);
        this.updateHearts();

        if (this.currentLifeHalves <= 0) {
            this.gameOverTriggered = true;
            this.frozen = true;
            this.isRestoringLife = false;
            this.scheduleOnce(function () {
                cc.director.emit('player-out-of-life');
            }, 0);
        }
    },

    restoreFullLife: function () {
        var maxLifeHalves = Math.max(Math.floor(this.startHearts || 0), 0) * 2;
        if (this.currentLifeHalves >= maxLifeHalves) {
            this.isRestoringLife = false;
            return;
        }

        this.isRestoringLife = true;
        this.lifeRestoreTimer = 0;
    },

    updateLifeRestore: function (dt) {
        if (!this.isRestoringLife) {
            return;
        }

        var maxLifeHalves = Math.max(Math.floor(this.startHearts || 0), 0) * 2;
        var interval = Math.max(this.lifeRestoreInterval, 0.01);
        this.lifeRestoreTimer += dt;

        while (this.lifeRestoreTimer >= interval && this.currentLifeHalves < maxLifeHalves) {
            this.lifeRestoreTimer -= interval;
            this.currentLifeHalves += 1;
            this.updateHearts();
        }

        if (this.currentLifeHalves >= maxLifeHalves) {
            this.currentLifeHalves = maxLifeHalves;
            this.isRestoringLife = false;
            this.lifeRestoreTimer = 0;
        }
    },

    createHud: function () {
        var hudParent = this.findOrCreateHudLayer();

        this.hudRoot = new cc.Node('Crash Crew HUD');
        this.hudRoot.zIndex = 20000;
        this.hudRoot.setAnchorPoint(0.5, 0.5);
        this.hudRoot.setPosition(0, 0);
        hudParent.addChild(this.hudRoot);
        this.hudRoot.setSiblingIndex(hudParent.childrenCount - 1);

        var leftX = -cc.winSize.width / 2 + this.leftMarginX;
        var topY = cc.winSize.height / 2 - this.marginY;

        this.createHeartCounter(leftX, topY);
        this.createCounter('coin', this.coinIconFrame, leftX + this.itemGap + this.coinBombOffsetX, topY, true, this.coinIconScale);
        this.createCounter('bomb', this.bombIconFrame, leftX + this.itemGap * 2 + this.coinBombOffsetX, topY, true);
        this.createCounter(
            'star',
            this.starIconFrame,
            leftX + this.itemGap * 3 + this.coinBombOffsetX,
            topY,
            true,
            this.starIconScale
        );
        this.createCounter('time', this.timeIconFrame, cc.winSize.width / 2 - this.rightMarginX, topY, false);
        this.createDebugMarker();
    },

    createDebugMarker: function () {
        if (!this.debugVisible) {
            return;
        }

        var marker = new cc.Node('HUD Debug Marker');
        var graphics = marker.addComponent(cc.Graphics);
        graphics.fillColor = cc.Color.RED;
        graphics.rect(-20, -20, 40, 40);
        graphics.fill();
        marker.zIndex = 30000;
        marker.setPosition(0, 0);
        this.hudRoot.addChild(marker);
    },

    createWorldText: function (x, y) {
        var worldNode = new cc.Node('World Counter');
        worldNode.setAnchorPoint(0, 0.5);
        worldNode.setPosition(x, y + this.counterOffsetY);
        this.hudRoot.addChild(worldNode);

        var label = worldNode.addComponent(cc.Label);
        label.font = this.countFont;
        label.fontSize = 18;
        label.lineHeight = 20;
        label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
        label.string = this.worldText;
        worldNode.color = cc.Color.WHITE;
        worldNode.setScale(this.labelScale);

        var outline = worldNode.addComponent(cc.LabelOutline);
        outline.color = cc.Color.BLACK;
        outline.width = 2;

        this.labels.world = label;
    },

    createHeartCounter: function (x, y) {
        var counter = new cc.Node('Life Hearts');
        counter.setAnchorPoint(0, 0.5);
        counter.setPosition(x, y + this.counterOffsetY + this.heartOffsetY);
        this.hudRoot.addChild(counter);

        var heartCount = Math.max(Math.floor(this.startHearts || 0), 0);
        for (var i = 0; i < heartCount; i += 1) {
            var heart = new cc.Node('Heart ' + (i + 1));
            var sprite = heart.addComponent(cc.Sprite);
            sprite.spriteFrame = this.heartFullFrame || this.heartEmptyFrame;
            heart.setScale(this.heartScale);
            heart.setPosition(i * this.heartGap, 0);
            counter.addChild(heart);
            this.heartNodes.push(heart);
        }
    },

    createCounter: function (key, iconFrame, x, y, showMultiply, customIconScale) {
        var counter = new cc.Node(key + ' Counter');
        counter.setAnchorPoint(0, 0.5);
        counter.setPosition(x, y);
        this.hudRoot.addChild(counter);

        var valueX = this.counterOffsetX;

        if (iconFrame) {
            var icon = new cc.Node(key + ' Icon');
            var iconSprite = icon.addComponent(cc.Sprite);
            iconSprite.spriteFrame = iconFrame;
            icon.setScale(customIconScale || this.iconScale);
            icon.setPosition(0, 0);
            counter.addChild(icon);
        }

        if (showMultiply && this.multiplyFrame) {
            var multiply = new cc.Node(key + ' Multiply');
            var multiplySprite = multiply.addComponent(cc.Sprite);
            multiplySprite.spriteFrame = this.multiplyFrame;
            multiply.setScale(this.digitScale);
            multiply.setPosition(valueX, this.counterOffsetY);
            counter.addChild(multiply);
            valueX += this.digitGap;
        }

        var valueRoot = new cc.Node(key + ' Value');
        valueRoot.setAnchorPoint(0, 0.5);
        valueRoot.setPosition(valueX, this.counterOffsetY);
        counter.addChild(valueRoot);
        this.valueRoots[key] = valueRoot;

        var fallbackLabel = valueRoot.addComponent(cc.Label);
        fallbackLabel.font = this.countFont;
        fallbackLabel.fontSize = 18;
        fallbackLabel.lineHeight = 20;
        fallbackLabel.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
        valueRoot.color = cc.Color.WHITE;
        valueRoot.setScale(this.labelScale);

        var outline = valueRoot.addComponent(cc.LabelOutline);
        outline.color = cc.Color.BLACK;
        outline.width = 2;
        this.labels[key] = fallbackLabel;
    },

    updateAllValues: function () {
        this.updateHearts();
        this.updateCounter('coin', this.coins);
        this.updateCounter('bomb', this.bombs);
        this.updateCounter('star', this.stars);
        this.updateCounter('time', this.remainingTime);
    },

    updateHearts: function () {
        for (var i = 0; i < this.heartNodes.length; i += 1) {
            var heartValue = this.currentLifeHalves - i * 2;
            var frame = this.heartEmptyFrame;

            if (heartValue >= 2) {
                frame = this.heartFullFrame;
            } else if (heartValue === 1) {
                frame = this.heartHalfFrame || this.heartEmptyFrame;
            }

            var sprite = this.heartNodes[i].getComponent(cc.Sprite);
            if (sprite) {
                sprite.spriteFrame = frame;
            }
        }
    },

    updateCounter: function (key, value) {
        var safeValue = Math.max(Math.floor(value || 0), 0);

        if (this.hasDigitFrames()) {
            this.drawDigitValue(key, safeValue.toString());
            return;
        }

        if (this.labels && this.labels[key]) {
            this.labels[key].string = safeValue.toString();
        }
    },

    drawDigitValue: function (key, text) {
        var root = this.valueRoots[key];
        if (!root) {
            return;
        }

        root.removeAllChildren();
        root.setScale(1);

        if (this.labels && this.labels[key]) {
            this.labels[key].enabled = false;
        }

        for (var i = 0; i < text.length; i += 1) {
            var digit = parseInt(text.charAt(i), 10);
            var frame = this.digitFrames[digit];
            if (!frame) {
                continue;
            }

            var digitNode = new cc.Node('Digit ' + text.charAt(i));
            var sprite = digitNode.addComponent(cc.Sprite);
            sprite.spriteFrame = frame;
            digitNode.setScale(this.digitScale);
            digitNode.setPosition(i * this.digitGap, 0);
            root.addChild(digitNode);
        }
    },

    hasDigitFrames: function () {
        if (!this.digitFrames || this.digitFrames.length < 10) {
            return false;
        }

        for (var i = 0; i < 10; i += 1) {
            if (!this.digitFrames[i]) {
                return false;
            }
        }

        return true;
    },

    findCanvas: function () {
        return this.findNodeByName('Canvas') || this.node;
    },

    findOrCreateHudLayer: function () {
        this.cameraNode = this.findNodeByName(this.hudParentNodeName);

        var canvas = this.findCanvas();
        var parent = this.attachToCamera && this.cameraNode ? this.cameraNode : canvas;
        var hudLayer = parent.getChildByName(this.hudLayerNodeName);

        if (!hudLayer) {
            hudLayer = new cc.Node(this.hudLayerNodeName);
            hudLayer.setAnchorPoint(0.5, 0.5);
            parent.addChild(hudLayer);
        }

        this.hudLayer = hudLayer;
        hudLayer.zIndex = 20000;
        hudLayer.setSiblingIndex(parent.childrenCount - 1);
        hudLayer.setPosition(0, 0);
        hudLayer.group = parent.group;
        if (this.raiseCanvasAboveWorld) {
            this.moveCanvasToFront(canvas);
        }
        this.syncHudLayerToCamera();

        return hudLayer;
    },

    moveCanvasToFront: function (canvas) {
        var scene = cc.director.getScene();

        if (!scene || !canvas || canvas.parent !== scene) {
            return;
        }

        canvas.zIndex = 20000;
        canvas.setSiblingIndex(scene.childrenCount - 1);
    },

    syncHudLayerToCamera: function () {
        if (!this.hudLayer) {
            return;
        }

        if (this.attachToCamera && this.cameraNode && this.hudLayer.parent === this.cameraNode) {
            this.hudLayer.setPosition(0, 0);
            return;
        }

        var canvas = this.findCanvas();
        var camera = this.cameraNode || this.findNodeByName(this.hudParentNodeName);

        if (!canvas || !camera) {
            return;
        }

        this.cameraNode = camera;

        var cameraWorldPosition = camera.convertToWorldSpaceAR(cc.v2(0, 0));
        var cameraInCanvas = canvas.convertToNodeSpaceAR(cameraWorldPosition);

        this.hudLayer.setPosition(cameraInCanvas);
    },

    findNodeByName: function (nodeName) {
        var scene = cc.director.getScene();
        if (!scene) {
            return null;
        }

        return this.findNodeByNameRecursive(scene, nodeName);
    },

    findNodeByNameRecursive: function (node, nodeName) {
        if (node.name === nodeName) {
            return node;
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            var found = this.findNodeByNameRecursive(node.children[i], nodeName);
            if (found) {
                return found;
            }
        }

        return null;
    }
});
