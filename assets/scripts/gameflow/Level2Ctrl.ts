/**
 * Level2Ctrl.ts
 * 場景：Level2（第二關）
 * 掛載節點：Canvas
 *
 * 場景節點結構：
 * Canvas
 * ├── Main Camera   (cc.Camera，主攝影機；可掛 CameraFollow 追蹤角色)
 * ├── Background    (背景節點，掛載關卡背景素材)
 * ├── Level         (關卡地形／平台節點，掛載第二關場景素材與碰撞區域)
 * └── Pink_Monster  (玩家角色節點，掛載 PinkMonsterController、角色 Sprite／動畫素材)
 *
 * 節點掛載素材與腳本：
 * - Canvas：掛載 Level2Ctrl，作為第二關場景入口控制器
 * - Main Camera：負責呈現關卡畫面，可搭配 CameraFollow.js
 * - Background：放置背景圖片、雲層或遠景裝飾節點
 * - Level：放置地板、平台、障礙物與可互動物件
 * - Pink_Monster：玩家操作角色，負責移動、跳躍、碰撞與動畫播放
 *
 * 測試快捷鍵： (TODO:快捷鍵只是暫時的，之後拔掉)
 * - Esc：返回 Explore 主探索場景
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass } = cc._decorator;

@ccclass
export default class Level2Ctrl extends cc.Component {
    onLoad() {
        cc.log("Level2Ctrl loaded: press Esc to return Explore");
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    }
    start() {
        // 換BGM
        AudioBroadcast.playBgm("level2_bgm");
        cc.log("Level2Ctrl start: BGM should be playing");
    }

    private onKeyDown(e: cc.Event.EventKeyboard) {
        if (e.keyCode === cc.macro.KEY.escape || e.keyCode === 27) {
            cc.director.loadScene("Explore");
        }
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    }
}
