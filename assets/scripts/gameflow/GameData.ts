/**
 * GameData.ts
 * 全局靜態資料，跨場景共享
 * 掛載方式：不需掛載節點，直接 import 使用
 */
export default class GameData {
    // 裝備 / 道具收集數量（決定結局）
    public static itemCount: number = 0;

    // 目前進行到第幾關（1~3）
    public static currentLevel: number = 1;

    // 是否獨自探險（Slide 4 選擇）；多人時由 NetworkManager 設為 false
    public static isSolo: boolean = true;

    // 結局類型（由 EndingCtrl 判斷後設定）
    public static endingType: "bad" | "normal" | "good" = "bad";

    // 多人時的本地玩家編號（0 = 先加入，1 = 後加入；-1 = 單人）
    public static playerId: number = -1;

    // Level3 用：本關剩餘時間（秒）、收集金幣數
    public static levelTime: number = 0;
    public static coins: number = 0;

    // 每關品質分數（0=銅 1=銀 2=金，-1=尚未通關）
    public static partQualities: number[] = [-1, -1, -1];
    public static highQualities: number[] = [-1, -1, -1];

    // 三關最高分
    public static bestScores: number[] = [0, 0, 0];

    /** 重置所有遊戲資料（回到主選單時呼叫） */
    public static reset() {
        GameData.itemCount = 0;
        GameData.currentLevel = 1;
        GameData.isSolo = true;
        GameData.endingType = "bad";
        GameData.playerId = -1;
        GameData.levelTime = 0;
        GameData.coins = 0;
        GameData.partQualities = [-1, -1, -1];
        GameData.highQualities = [-1, -1, -1];
        GameData.bestScores = [0, 0, 0];
    }

    /** 進入關卡時呼叫，記錄當前關卡編號 */
    public static enterlevel(level: number) {
        GameData.currentLevel = level;
    }

    /** 計算本次分數 */
    public static calcScore(): number {
        return GameData.levelTime * 10 + GameData.coins * 5;
    }

    /** 更新對應關卡的最高分，回傳本次分數 */
    public static updateBestScore(): number {
        const score = GameData.calcScore();
        const index = GameData.currentLevel - 1;
        if (index >= 0 && index < 3) {
            if (score > GameData.bestScores[index]) {
                GameData.bestScores[index] = score;
            }
        }
        return score;
    }

    public static updateHighQuality() {
        const index = GameData.currentLevel - 1;
        if (index >= 0 && index < 3) {
            if (GameData.partQualities[index] > GameData.highQualities[index]) {
                GameData.highQualities[index] = GameData.partQualities[index];
            }
        }
    }

    /** 根據三關最高品質判斷結局 */
    public static calcEnding() {
        GameData.itemCount = GameData.highQualities[0] + GameData.highQualities[1] + GameData.highQualities[2];
        if (GameData.highQualities[0] < 0 || GameData.highQualities[1] < 0 || GameData.highQualities[2] < 0) {
            GameData.endingType = "bad";
        } else if (GameData.itemCount >= 5) {
            GameData.endingType = "good";
        } else if (GameData.itemCount >= 3) {
            GameData.endingType = "normal";
        } else {
            GameData.endingType = "bad";
        }
    }
}
