/**
 * Level2Ctrl.ts
 * 場景：Level2（第二關）
 * 掛載節點：Canvas
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass } = cc._decorator;

@ccclass
export default class Level2Ctrl extends cc.Component {
    start() {
        AudioBroadcast.playBgm("level2_bgm");
    }
}
