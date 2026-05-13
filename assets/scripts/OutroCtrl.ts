/**
 * OutroCtrl.ts
 * 場景：Outro（Slide 15，所有關卡完成後的過渡）
 * 掛載節點：Canvas
 *
 * 停留 5 秒後，根據道具數量計算結局並跳轉 Ending 場景。
 */
import GameData from "./GameData";

const { ccclass } = cc._decorator;

@ccclass
export default class OutroCtrl extends cc.Component {

    start() {
        // 計算結局類型
        GameData.calcEnding();

        this.scheduleOnce(() => {
            cc.director.loadScene("Ending");
        }, 5);
    }
}
