// PlayerCollider.ts
// 掛在 Player 節點下的子節點，負責偵測與 Entry / Spaceship 的重疊
// 子節點需掛：PhysicsCircleCollider（sensor = true）+ RigidBody（Kinematic）

const { ccclass, property } = cc._decorator;

@ccclass
export default class PlayerCollider extends cc.Component {

    // 重疊時要顯示的提示節點（由 ExploreCtrl 設定）
    public onEnterSpaceship: () => void = null;
    public onExitSpaceship:  () => void = null;
    public onEnterLevel:     (index: number) => void = null;
    public onExitLevel:      (index: number) => void = null;

    onLoad() {
        const col = this.node.getComponent(cc.PhysicsCircleCollider);
        col.apply();

        const rb = this.node.getComponent(cc.RigidBody);

        // 啟用碰撞監聽
        const manager = cc.director.getCollisionManager();
        // 使用物理碰撞回調
        this.node.on(cc.Node.EventType.TOUCH_START, () => {});  // 確保節點啟用
    }

    onBeginContact(contact: cc.PhysicsContact, self: cc.PhysicsCollider, other: cc.PhysicsCollider) {
        const group = other.node.group;

        if (group === "Spaceship") {
            if (this.onEnterSpaceship) this.onEnterSpaceship();
            return;
        }

        if (group === "Entry") {
            const index = this.getEntryIndex(other.node);
            if (index >= 0 && this.onEnterLevel) this.onEnterLevel(index);
        }
    }

    onEndContact(contact: cc.PhysicsContact, self: cc.PhysicsCollider, other: cc.PhysicsCollider) {
        const group = other.node.group;

        if (group === "Spaceship") {
            if (this.onExitSpaceship) this.onExitSpaceship();
            return;
        }

        if (group === "Entry") {
            const index = this.getEntryIndex(other.node);
            if (index >= 0 && this.onExitLevel) this.onExitLevel(index);
        }
    }

    // entry 節點名稱為 entry1 / entry2 / entry3，取出數字轉成 0-based index
    private getEntryIndex(node: cc.Node): number {
        const match = node.name.match(/(\d+)$/);
        if (!match) return -1;
        return parseInt(match[1]) - 1;
    }
}