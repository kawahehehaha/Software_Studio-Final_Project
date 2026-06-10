/**
 * GameData.ts
 * 全局靜態資料，跨場景共享
 * 掛載方式：不需掛載節點，直接 import 使用
 */
export default class GameData {
    // 裝備 / 道具收集數量（決定結局）
    public static itemCount: number = 0;

    // 目前進行到第幾關（1~3）
    // TODO : 我先改2做連接的測試，之後要改回1
    public static currentLevel: number = 2;

    // 是否獨自探險（Slide 4 選擇）；多人時由 NetworkManager 設為 false
    public static isSolo: boolean = true;

    // 結局類型（由 EndingCtrl 判斷後設定）
    public static endingType: "bad" | "normal" | "good" = "bad";

    // 多人時的本地玩家編號（0 = 先加入，1 = 後加入；-1 = 單人）
    public static playerId: number = -1;

    /** 重置所有遊戲資料（回到主選單時呼叫） */
    public static reset() {
        GameData.itemCount = 0;
        GameData.currentLevel = 1;
        GameData.isSolo = true;
        GameData.endingType = "bad";
        GameData.playerId = -1;
    }

    /** 根據收集數量判斷結局 */
    public static calcEnding() {
        if (GameData.itemCount >= 10) {
            GameData.endingType = "good";
        } else if (GameData.itemCount >= 5) {
            GameData.endingType = "normal";
        } else {
            GameData.endingType = "bad";
        }
    }
}
