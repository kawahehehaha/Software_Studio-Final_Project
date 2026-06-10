import { AudioBroadcast } from "../Audio/AudioEvent";

const { ccclass, property } = cc._decorator;

@ccclass
export default class SettingsCtrl extends cc.Component {

    @property(cc.Slider)
    bgmSlider: cc.Slider = null;

    @property(cc.Slider)
    effectSlider: cc.Slider = null;

    start() {
        // 初始化滑桿位置對應當前音量
        if (this.bgmSlider) {
            this.bgmSlider.progress = AudioBroadcast.getBgmVolume();
        }
        if (this.effectSlider) {
            this.effectSlider.progress = AudioBroadcast.getEffectVolume();
        }
    }

    onBgmSliderChanged() {
        AudioBroadcast.setBgmVolume(this.bgmSlider.progress);
    }

    onEffectSliderChanged() {
        AudioBroadcast.setEffectVolume(this.effectSlider.progress);
    }
}