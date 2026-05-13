/**
 * LevelResultCtrl.ts
 * 場景：LevelResult（Slide 13）
 * 掛載節點：Canvas
 *
 * 場景節點結構：
 * Canvas
 * ├── ItemCountLabel  (cc.Label) 顯示本次收集道具數量
 * ├── TotalLabel      (cc.Label) 顯示累積道具總數
 * ├── LevelLabel      (cc.Label) 顯示已完成關卡
 * └── ContinueButton  (cc.Button) 繼續按鈕
 */
import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class LevelResultCtrl extends cc.Component {

    @property(cc.Label)
    totalLabel: cc.Label = null;

    @property(cc.Label)
    levelLabel: cc.Label = null;

    start() {
        // 更新 UI 文字
        const completedLevel = GameData.currentLevel - 1; // currentLevel 已在完成時 +1
        if (this.totalLabel)  this.totalLabel.string  = `收集道具：${GameData.itemCount}`;
        if (this.levelLabel)  this.levelLabel.string  = `已完成關卡：${completedLevel} / 3`;

        this.bindButton("Canvas/ContinueButton", "onContinue");
    }

    private bindButton(path: string, handler: string) {
        const node = cc.find(path);
        if (!node) { cc.warn(`LevelResultCtrl: 找不到 ${path}`); return; }
        const eh = new cc.Component.EventHandler();
        eh.target = this.node;
        eh.component = "LevelResultCtrl";
        eh.handler = handler;
        node.getComponent(cc.Button).clickEvents.push(eh);
    }

    onContinue() {
        const completedLevel = GameData.currentLevel - 1;

        if (completedLevel >= 3) {
            // 三關全破，進入過渡場景
            cc.director.loadScene("Outro");
        } else {
            // 繼續下一關
            cc.director.loadScene("Explore");
        }
    }
}
