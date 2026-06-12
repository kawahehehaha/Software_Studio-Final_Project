import GameData from "../gameflow/GameData";
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass, property } = cc._decorator;

@ccclass
export default class GameOverCtrl extends cc.Component {
    start() {
        AudioBroadcast.playBgm("failure_bgm");
        this.bindButton("Canvas/RetryButton", "onRetry");
        this.bindButton("Canvas/BackButton", "onBack");
    }

    private bindButton(path: string, handler: string) {
        const node = cc.find(path);
        if (!node) { cc.warn(`GameOverCtrl: 找不到 ${path}`); return; }
        const eh        = new cc.Component.EventHandler();
        eh.target       = this.node;
        eh.component    = "GameOverCtrl";
        eh.handler      = handler;
        node.getComponent(cc.Button).clickEvents.push(eh);
    }

    onRetry() {
        AudioBroadcast.playEffect("btn_press");
        switch (GameData.currentLevel) {
            case 1: 
                cc.director.loadScene("Level1");
                break;
            case 2: 
                cc.director.loadScene("Level2"); 
                break;
            case 3: 
                cc.director.loadScene("Level3"); 
                break;
        }
    }
    onBack() {
        AudioBroadcast.playEffect("btn_press");
        cc.director.loadScene("Explore");
    }
}