/**
 * LevelBaseCtrl.ts
 * 所有關卡場景的基底類別（Level1、Level2、Level3 繼承此類別）
 *
 * 功能：
 * - 統一管理關卡完成流程
 * - 收集道具時呼叫 collectItem() 增加計數
 * - 完成後自動跳到結算場景
 */
import GameData from "./GameData";

const { ccclass, property } = cc._decorator;

// 取得全域 NetworkManager（若存在）
function getNM(): any { return (window as any).NM ?? null; }

@ccclass
export default class LevelBaseCtrl extends cc.Component {

    /** 玩家血量 */
    @property(cc.Integer)
    playerHP: number = 3;

    /** 此關卡最多可收集的道具數量 */
    @property(cc.Integer)
    maxItems: number = 5;

    protected itemsCollected: number = 0;
    protected isLevelComplete: boolean = false;

    /**
     * 子類別在 start() 中呼叫 super.start() 或直接呼叫此方法
     */
    protected initLevel() {
        this.itemsCollected = 0;
        this.isLevelComplete = false;
        cc.log(`關卡開始，目前道具總數：${GameData.itemCount}`);
    }

    /**
     * 撿到道具時呼叫
     */
    public collectItem(count: number = 1) {
        this.itemsCollected += count;
        GameData.itemCount += count;
        cc.log(`收集道具 +${count}，本關：${this.itemsCollected}，總計：${GameData.itemCount}`);

        // 多人：同步道具數給對方
        const nm = getNM();
        if (nm && nm.room) {
            nm.sendItemCollected(count);
        }
    }

    /**
     * 關卡完成時呼叫（子類別觸發）
     */
    protected completeLevel() {
        if (this.isLevelComplete) return;
        this.isLevelComplete = true;

        GameData.currentLevel += 1;
        cc.log(`關卡完成！跳轉結算畫面`);

        // 多人：廣播給雙方同步關卡進度並切換到結算畫面
        const nm = getNM();
        if (nm && nm.room) {
            nm.sendLevelComplete(GameData.currentLevel);
        } else {
            cc.director.loadScene("LevelResult");
        }
    }

    /**
     * 玩家死亡時呼叫
     */
    protected onPlayerDead() {
        cc.log("玩家死亡，回到探索場景");
        cc.director.loadScene("Explore");
    }
}
