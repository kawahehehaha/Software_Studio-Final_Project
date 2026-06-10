/*
 * CameraFollow
 * ------------
 * Level 2 的鏡頭跟隨控制腳本。
 *
 * 這個元件會讓掛載的 Camera 節點平滑追蹤一個或多個目標，預設會自動尋找
 * 名稱為 Pink_Monster 的角色節點。鏡頭會先計算所有有效目標的中心點，再依照
 * offset、followX、followY 決定目標鏡頭位置，最後用 smoothSpeed 做平滑插值。
 *
 * 邊界控制可透過 useBounds 開啟。當 useViewportEdgeBounds 為 true 時，左邊界
 * 會考慮鏡頭視窗寬度，避免畫面左側露出關卡外的區域；leftEdgeUsesTargetParent
 * 則用來處理角色與鏡頭不在同一個父節點座標系時的轉換。
 *
 * 主要用途：
 * - 跟隨玩家或多個角色中心。
 * - 讓鏡頭移動更平滑，不會瞬間跳動。
 * - 限制鏡頭不要超出關卡可視範圍。
 */
cc.Class({
    extends: cc.Component,

    properties: {
        target: {
            default: null,
            type: cc.Node
        },
        targets: {
            default: [],
            type: cc.Node
        },
        autoFindTargetName: 'Pink_Monster',
        offset: cc.v2(0, 80),
        smoothSpeed: 6,
        followX: true,
        followY: true,
        // 目標超過指定 X 座標後，切換成完整跟隨設定。
        switchToFullFollowAfterX: true,
        fullFollowStartX: 2378,
        fullFollowX: true,
        fullFollowY: true,
        useBounds: false,
        useViewportEdgeBounds: true,
        leftEdgeUsesTargetParent: true,
        leftEdgeX: -200,
        debugBounds: false,
        minX: -99999,
        maxX: 99999,
        minY: -99999,
        maxY: 99999
    },

    // 初始化時自動尋找預設追蹤目標。
    onLoad: function () {
        if (!this.target && this.targets.length === 0 && this.autoFindTargetName) {
            this.target = cc.find(this.autoFindTargetName);
        }
    },

    // 在角色更新後平滑移動鏡頭，確保畫面跟上目標。
    lateUpdate: function (dt) {
        var center = this.getTargetsCenter();
        if (!center) {
            return;
        }

        var fullFollowActive = this.isFullFollowActive(center);
        var activeFollowX = fullFollowActive ? this.fullFollowX : this.followX;
        var activeFollowY = fullFollowActive ? this.fullFollowY : this.followY;
        var desiredX = activeFollowX ? center.x + this.offset.x : this.node.x;
        var desiredY = activeFollowY ? center.y + this.offset.y : this.node.y;
        var minCameraX = this.getMinCameraX();
        this.logBoundsOnce(minCameraX);

        if (this.useBounds) {
            desiredX = cc.misc.clampf(desiredX, minCameraX, this.maxX);
            desiredY = cc.misc.clampf(desiredY, this.minY, this.maxY);
        }

        var t = 1 - Math.exp(-this.smoothSpeed * dt);
        var nextX = cc.misc.lerp(this.node.x, desiredX, t);
        var nextY = cc.misc.lerp(this.node.y, desiredY, t);

        if (this.useBounds) {
            nextX = cc.misc.clampf(nextX, minCameraX, this.maxX);
            nextY = cc.misc.clampf(nextY, this.minY, this.maxY);
        }

        this.node.x = nextX;
        this.node.y = nextY;
    },

    // 追蹤中心越過 fullFollowStartX 後切換鏡頭行為。
    isFullFollowActive: function (center) {
        return this.switchToFullFollowAfterX &&
            center &&
            center.x >= this.fullFollowStartX;
    },

    // 在除錯模式下輸出一次鏡頭邊界資訊。
    logBoundsOnce: function (minCameraX) {
        if (!this.debugBounds || this.didLogBounds) {
            return;
        }

        this.didLogBounds = true;
        cc.log('[CameraFollow] cameraX=' + this.node.x +
            ', minCameraX=' + minCameraX +
            ', leftEdge=' + this.getLeftEdgeInCameraParent() +
            ', halfWidth=' + this.getViewportHalfWidth() +
            ', useBounds=' + this.useBounds);
    },

    // 計算鏡頭可移動的最小 X 座標。
    getMinCameraX: function () {
        if (!this.useViewportEdgeBounds) {
            return this.minX;
        }

        return this.getLeftEdgeInCameraParent() + this.getViewportHalfWidth();
    },

    // 將左邊界轉換到鏡頭父節點的座標系。
    getLeftEdgeInCameraParent: function () {
        if (!this.leftEdgeUsesTargetParent || !this.target || !this.target.parent || !this.node.parent) {
            return this.leftEdgeX;
        }

        var worldPos = this.target.parent.convertToWorldSpaceAR(cc.v2(this.leftEdgeX, 0));
        return this.node.parent.convertToNodeSpaceAR(worldPos).x;
    },

    // 取得目前鏡頭視窗的一半寬度。
    getViewportHalfWidth: function () {
        var camera = this.getComponent(cc.Camera);
        var canvas = cc.find('Canvas');
        var width = canvas ? canvas.width : cc.winSize.width;

        if (camera && camera.zoomRatio > 0) {
            width = width / camera.zoomRatio;
        }

        return width * 0.5;
    },

    // 計算所有有效追蹤目標在鏡頭父節點中的中心位置。
    getTargetsCenter: function () {
        var validTargets = [];

        if (this.target && this.target.isValid) {
            validTargets.push(this.target);
        }

        for (var i = 0; i < this.targets.length; i++) {
            if (this.targets[i] && this.targets[i].isValid) {
                validTargets.push(this.targets[i]);
            }
        }

        if (validTargets.length === 0) {
            return null;
        }

        var sum = cc.v2(0, 0);

        for (var j = 0; j < validTargets.length; j++) {
            var localPos = this.getTargetPositionInCameraParent(validTargets[j]);
            sum.x += localPos.x;
            sum.y += localPos.y;
        }

        return cc.v2(sum.x / validTargets.length, sum.y / validTargets.length);
    },

    // 將單一目標的位置轉換成鏡頭父節點座標。
    getTargetPositionInCameraParent: function (targetNode) {
        if (!this.node.parent || targetNode.parent === this.node.parent) {
            return targetNode.position;
        }

        var worldPos = targetNode.convertToWorldSpaceAR(cc.Vec2.ZERO);
        return this.node.parent.convertToNodeSpaceAR(worldPos);
    }
});
