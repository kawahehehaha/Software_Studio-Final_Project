/**
 * ParallaxLayer.ts
 * Scene: Any scrolling gameplay scene.
 * Attach to: A background or foreground layer.
 * Moves the layer relative to the camera to create configurable parallax depth.
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class ParallaxLayer extends cc.Component {
    @property(cc.Node)
    cameraNode: cc.Node = null;

    @property
    factorX = 0.5;

    @property
    factorY = 0;

    @property
    lockY = true;

    private startPosition = cc.v2();
    private cameraStartPosition = cc.v2();

    onLoad() {
        this.startPosition = cc.v2(this.node.x, this.node.y);

        if (!this.cameraNode) {
            const canvas = cc.find('Canvas');
            const camera = canvas && canvas.getComponentInChildren(cc.Camera);
            this.cameraNode = camera ? camera.node : null;
        }

        if (this.cameraNode) {
            this.cameraStartPosition = cc.v2(this.cameraNode.x, this.cameraNode.y);
        }
    }

    lateUpdate() {
        if (!this.cameraNode) {
            return;
        }

        const cameraDeltaX = this.cameraNode.x - this.cameraStartPosition.x;
        const cameraDeltaY = this.cameraNode.y - this.cameraStartPosition.y;
        const nextX = this.startPosition.x + cameraDeltaX * this.factorX;
        const nextY = this.lockY
            ? this.startPosition.y
            : this.startPosition.y + cameraDeltaY * this.factorY;

        this.node.setPosition(nextX, nextY);
    }
}
