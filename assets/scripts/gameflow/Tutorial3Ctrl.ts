/**
 * Tutorial3Ctrl.ts
 * 場景：Tutorial3
 * 掛載節點：Canvas
 *
 * 流程：
 *   啟動        → text / hint 顯示，text 下的 Label 淡入；tutorial 隱藏
 *   第一次點擊  → text / hint 隱藏，tutorial 顯示
 *   第二次點擊  → 載入 Level3
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class Tutorial3Ctrl extends cc.Component {

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
        cc.log('[Tutorial3] start()');
        if (!this.textNode || !this.hintNode || !this.tutorialNode) {
            cc.warn("Tutorial3Ctrl: 請在 Inspector 將 text / hint / tutorial 節點拖入");
            return;
        }

        this.textNode.active     = true;
        this.hintNode.active     = true;
        this.tutorialNode.active = false;

        this.fadeInLabels(this.textNode);

        // 延遲 0.3s 後才開始接受觸控，避免前一場景殘留的 TOUCH_END 立即觸發
        this.scheduleOnce(() => {
            cc.log('[Tutorial3] 開始接受 TOUCH_END');
            this.node.on(cc.Node.EventType.TOUCH_END, this.onTouchEnd, this);
        }, 0.3);
    }

    onDestroy() {
        this.node.off(cc.Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    private onTouchEnd() {
        cc.log(`[Tutorial3] onTouchEnd: switched=${this.switched}`);
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
            const nm = (window as any).NM;
            cc.log(`[Tutorial3] → Level3, nm=${!!nm}, room=${!!nm?.room}`);
            if (nm && nm.room) {
                nm.sendSceneChange('Level3');
            } else {
                cc.director.loadScene('Level3');
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
