/**
 * Tutorial2Ctrl.ts
 * 場景：Tutorial2
 * 掛載節點：Canvas
 *
 * 流程：
 *   啟動        → text / hint 顯示，text 下的 Label 淡入；tutorial 隱藏
 *   第一次點擊  → text / hint 隱藏，tutorial 顯示
 *   第二次點擊  → 載入 Level2（多人模式下透過 NM 同步）
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class Tutorial2Ctrl extends cc.Component {

    @property(cc.Node)
    textNode: cc.Node = null;

    @property(cc.Node)
    hintNode: cc.Node = null;

    @property(cc.Node)
    tutorialNode: cc.Node = null;

    @property
    fadeDuration: number = 2.0;

    private switched: boolean = false;

    start() {
        if (!this.textNode || !this.hintNode || !this.tutorialNode) {
            cc.warn("Tutorial2Ctrl: 請在 Inspector 將 text / hint / tutorial 節點拖入");
            return;
        }

        this.textNode.active     = true;
        this.hintNode.active     = true;
        this.tutorialNode.active = false;

        this.fadeInLabels(this.textNode);

        this.node.on(cc.Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    onDestroy() {
        this.node.off(cc.Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private onTouchEnd() {
        if (!this.switched) {
            this.collectLabels(this.textNode).forEach(label => {
                label.stopAllActions();
                label.opacity = 255;
            });

            this.textNode.active     = false;
            this.hintNode.active     = false;
            this.tutorialNode.active = true;
            this.switched = true;

        } else {
            // 多人模式：透過 NM 廣播，確保雙方同步進入 Level2
            const nm = (window as any).NM;
            if (nm && nm.room) {
                nm.sendSceneChange("Level2");
            } else {
                cc.director.loadScene("Level2");
            }
        }
    }

    private fadeInLabels(root: cc.Node) {
        const labels = this.collectLabels(root);
        if (labels.length === 0) return;

        labels.forEach(label => {
            const originalOpacity = label.opacity > 0 ? label.opacity : 255;
            label.opacity = 0;
            label.runAction(cc.fadeTo(this.fadeDuration, originalOpacity));
        });
    }

    private collectLabels(node: cc.Node): cc.Node[] {
        const result: cc.Node[] = [];
        if (node.getComponent(cc.Label)) {
            result.push(node);
        }
        node.children.forEach(child => {
            result.push(...this.collectLabels(child));
        });
        return result;
    }
}
