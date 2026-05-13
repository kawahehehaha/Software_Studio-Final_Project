/**
 * MainMenuCtrl.ts
 * 場景：MainMenu（Slide 1）
 * 掛載節點：Canvas
 * 子節點需求：Canvas/StartButton（cc.Button）
 */
import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class MainMenuCtrl extends cc.Component {

    start() {
        // 每次回到主選單都重置遊戲資料
        GameData.reset();

        const handler = new cc.Component.EventHandler();
        handler.target = this.node;
        handler.component = "MainMenuCtrl";
        handler.handler = "onStartGame";

        const startBtn = cc.find("Canvas/StartButton");
        if (startBtn) {
            startBtn.getComponent(cc.Button).clickEvents.push(handler);
        } else {
            cc.warn("MainMenuCtrl: 找不到 Canvas/StartButton");
        }
    }

    onStartGame() {
        cc.director.loadScene("Intro");
    }
}
