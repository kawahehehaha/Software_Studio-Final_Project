/**
 * IntroCtrl.ts
 * 場景：Intro（Slide 2～7，共 6 個過場分鏡）
 * 掛載節點：Canvas
 *
 * 場景節點結構範例：
 * Canvas
 * ├── Slide1  (cc.Sprite，顯示第 2 張分鏡圖)
 * ├── Slide2  (cc.Sprite，顯示第 3 張分鏡圖)
 * ├── Slide3  ...
 * ├── Slide4  ...
 * ├── Slide5  ...
 * └── Slide6  (cc.Sprite，顯示第 7 張分鏡圖)
 *
 * 每個 Slide 節點預設 active = false，由腳本控制顯示。
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
const { ccclass, property } = cc._decorator;

@ccclass
export default class IntroCtrl extends cc.Component {

    /** 每張分鏡停留秒數，依序對應 Slide1～Slide6 */
    @property([cc.Float])
    slideDelays: number[] = [5, 5, 5, 5, 5, 5];

    private slides: cc.Node[] = [];
    private currentIndex: number = 0;

    start() {
        // 換BGM
        AudioBroadcast.playBgm("story_line_bgm");
        // 收集場景中所有 Slide 節點
        for (let i = 1; i <= 6; i++) {
            const node = cc.find("Canvas/Slide" + i);
            if (node) {
                node.active = false;
                this.slides.push(node);
            } else {
                cc.warn(`IntroCtrl: 找不到 Canvas/Slide${i}`);
            }
        }

        if (this.slides.length === 0) {
            cc.warn("IntroCtrl: 沒有任何 Slide 節點，直接跳過");
            cc.director.loadScene("Tutorial");
            return;
        }

        this.showSlide(0);
    }

    private showSlide(index: number) {
        // 隱藏所有 slide，只顯示當前
        this.slides.forEach((s, i) => {
            s.active = (i === index);
        });

        const delay = this.slideDelays[index] ?? 5;

        this.scheduleOnce(() => {
            const next = index + 1;
            if (next < this.slides.length) {
                this.showSlide(next);
            } else {
                cc.director.loadScene("Tutorial");
            }
        }, delay);
    }
}
