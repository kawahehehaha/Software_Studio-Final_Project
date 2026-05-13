/**
 * TutorialCtrl.ts
 * 場景：Tutorial（Slide 8）
 * 掛載節點：Canvas（需設定 ContentSize 覆蓋全螢幕，並開啟 Touch 事件）
 *
 * 點擊畫面任意處進入探索場景。
 */
const { ccclass } = cc._decorator;

@ccclass
export default class TutorialCtrl extends cc.Component {

    start() {
        // 讓 Canvas 節點可以接收觸控
        this.node.on(cc.Node.EventType.TOUCH_START, this.onAnyTouch, this);
    }

    private onAnyTouch() {
        // 只觸發一次，立刻移除監聽
        this.node.off(cc.Node.EventType.TOUCH_START, this.onAnyTouch, this);
        cc.director.loadScene("Explore");
    }

    onDestroy() {
        this.node.off(cc.Node.EventType.TOUCH_START, this.onAnyTouch, this);
    }
}
