/**
 * InventoryCtrl.ts
 * 場景：Inventory（Slide 14，飛船裝備管理）
 * 掛載節點：Canvas
 *
 * 場景節點結構：
 * Canvas
 * ├── ItemCountLabel  (cc.Label) 顯示目前道具數量
 * └── BackButton      (cc.Button) 返回探索場景
 */
import GameData from "../gameflow/GameData";

const { ccclass, property } = cc._decorator;

@ccclass
export default class InventoryCtrl extends cc.Component {

    @property(cc.Label)
    itemCountLabel: cc.Label = null;

    start() {
        if (this.itemCountLabel) {
            this.itemCountLabel.string = `已收集道具：${GameData.itemCount}`;
        }

        this.bindButton("Canvas/BackButton", "onBack");
    }

    private bindButton(path: string, handler: string) {
        const node = cc.find(path);
        if (!node) { cc.warn(`InventoryCtrl: 找不到 ${path}`); return; }
        const eh = new cc.Component.EventHandler();
        eh.target = this.node;
        eh.component = "InventoryCtrl";
        eh.handler = handler;
        node.getComponent(cc.Button).clickEvents.push(eh);
    }

    onBack() {
        cc.director.loadScene("Explore");
    }
}
