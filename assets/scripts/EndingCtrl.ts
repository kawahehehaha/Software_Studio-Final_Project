/**
 * EndingCtrl.ts
 * 場景：Ending（Slide 16～18）
 * 掛載節點：Canvas
 *
 * 場景節點結構：
 * Canvas
 * ├── BadEnding     (節點，顯示壞結局畫面，active 預設 false)
 * ├── NormalEnding  (節點，顯示普通結局畫面，active 預設 false)
 * ├── GoodEnding    (節點，顯示好結局畫面，active 預設 false)
 * └── BackToMenuButton (cc.Button) 返回主選單
 *
 * 結局判斷（GameData.calcEnding() 已在 OutroCtrl 執行）：
 * - bad    → 道具 < 5
 * - normal → 道具 5～9
 * - good   → 道具 ≥ 10
 */
import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class EndingCtrl extends cc.Component {

    @property(cc.Node)
    badEnding: cc.Node = null;

    @property(cc.Node)
    normalEnding: cc.Node = null;

    @property(cc.Node)
    goodEnding: cc.Node = null;

    start() {
        // 根據結局類型顯示對應畫面
        if (this.badEnding)    this.badEnding.active    = (GameData.endingType === "bad");
        if (this.normalEnding) this.normalEnding.active = (GameData.endingType === "normal");
        if (this.goodEnding)   this.goodEnding.active   = (GameData.endingType === "good");

        cc.log(`結局類型：${GameData.endingType}，道具數量：${GameData.itemCount}`);

        this.bindButton("Canvas/BackToMenuButton", "onBackToMenu");
    }

    private bindButton(path: string, handler: string) {
        const node = cc.find(path);
        if (!node) { cc.warn(`EndingCtrl: 找不到 ${path}`); return; }
        const eh = new cc.Component.EventHandler();
        eh.target = this.node;
        eh.component = "EndingCtrl";
        eh.handler = handler;
        node.getComponent(cc.Button).clickEvents.push(eh);
    }

    onBackToMenu() {
        cc.director.loadScene("MainMenu");
    }
}
