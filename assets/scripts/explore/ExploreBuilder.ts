// GroundColliderBuilder.ts
// Cocos Creator 2.4.x
// 只處理 GROUND 類型的 tile，tile 大小為 64×64，合併為實心碰撞體

import { ALL_LEVELS, TileType } from "./ExploreData";

const { ccclass, property } = cc._decorator;

const TILE_SIZE = 64;

@ccclass
export default class GroundColliderBuilder extends cc.Component {

    @property(cc.Prefab) groundPrefab: cc.Prefab = null;
    @property(cc.Node)   cameraNode:   cc.Node   = null;

    private readonly CANVAS_W = 960;
    private readonly CANVAS_H = 640;

    private _mapCols: number = 0;
    private _mapRows: number = 0;

    onLoad() {
        const physics = cc.director.getPhysicsManager();
        physics.enabled = true;
        physics.gravity  = cc.v2(0, -980);

        // physics.debugDrawFlags =
        // cc.PhysicsManager.DrawBits.e_shapeBit |
        // cc.PhysicsManager.DrawBits.e_jointBit;

        this.buildLevel();
    }

    onDestroy() {
        const physics = cc.director.getPhysicsManager();
        if (physics) physics.debugDrawFlags = 0;
    }

    // ─────────────────────────────────────────────────────────
    private buildLevel() {
        const mapData    = ALL_LEVELS[0];

        this._mapRows = mapData.length;
        this._mapCols = mapData[0].length;

        const originX = -this.CANVAS_W / 2;
        const originY = -this.CANVAS_H / 2;

        const groundLayer = this.createLayer("GroundLayer");


        // ── 合併碰撞體（GROUND 實心）────────────────────────
        this.buildMergedColliders(mapData, originX, originY, groundLayer);
        // this.setupCamera(originX, this._mapCols * TILE_SIZE);
    }

    // ─────────────────────────────────────────────────────────
    /**
     * 掃描 mapData，將相鄰的 GROUND tile 合併成一個最大矩形，
     * 並為每個矩形建立一個 Static 實心碰撞體節點。
     */
    private buildMergedColliders(
        mapData: number[][],
        originX: number,
        originY: number,
        layer:   cc.Node
    ) {
        const rows = mapData.length;
        const cols = mapData[0].length;

        const processed: boolean[][] = Array.from(
            { length: rows }, () => new Array(cols).fill(false)
        );

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (mapData[row][col] !== TileType.GROUND) continue;
                if (processed[row][col]) continue;

                // 向右擴展
                let endCol = col;
                while (
                    endCol + 1 < cols &&
                    mapData[row][endCol + 1] === TileType.GROUND &&
                    !processed[row][endCol + 1]
                ) {
                    endCol++;
                }

                // 向下擴展（整行都必須符合）
                let endRow = row;
                outer:
                while (endRow + 1 < rows) {
                    for (let c = col; c <= endCol; c++) {
                        if (
                            mapData[endRow + 1][c] !== TileType.GROUND ||
                            processed[endRow + 1][c]
                        ) break outer;
                    }
                    endRow++;
                }

                // 標記已處理
                for (let r = row; r <= endRow; r++)
                    for (let c = col; c <= endCol; c++)
                        processed[r][c] = true;

                // 計算世界座標（中心點）
                const w  = (endCol - col + 1) * TILE_SIZE;
                const h  = (endRow - row + 1) * TILE_SIZE;
                const cx = originX + col * TILE_SIZE + w / 2;
                const cy = originY + (rows - 1 - endRow) * TILE_SIZE + h / 2;

                this.createStaticCollider(cx, cy, w, h, layer);
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    private createStaticCollider(
        cx: number, cy: number,
        w:  number, h:  number,
        layer: cc.Node
    ) {
        const node = new cc.Node("Ground_Collider");
        node.setPosition(cx, cy);
        node.group = "Ground";

        const body = node.addComponent(cc.RigidBody);
        body.type                   = cc.RigidBodyType.Static;
        body.fixedRotation          = true;
        body.enabledContactListener = false;

        const col = node.addComponent(cc.PhysicsBoxCollider);
        col.friction = 0;
        col.size     = cc.size(w, h);
        col.offset   = cc.v2(0, 0);
        col.sensor   = false;
        col.apply();

        layer.addChild(node);
    }

    // private setupCamera(originX: number, mapWidth: number) {
    //     if (!this.cameraNode) return;
    //     const cam = this.cameraNode.getComponent("ExploreCameraFollow") as any;
    //     if (!cam) { cc.error("[LevelBuilder] 找不到 CameraFollow"); return; }

    //     cam.mapMinX = originX;
    //     cam.mapMaxX = originX + mapWidth;
    //     cam.mapMinY = -this.CANVAS_H / 2;                    // 新增
    //     cam.mapMaxY = -this.CANVAS_H / 2 + this.getMapHeight(); // 新增
    // }

    private createLayer(name: string): cc.Node {
        const node = new cc.Node(name);
        node.setAnchorPoint(0.5, 0.5);
        node.setPosition(0, 0);
        this.node.addChild(node);
        return node;
    }

    public getMapWidth():   number  { return this._mapCols * TILE_SIZE; }
    public getMapHeight():  number  { return this._mapRows * TILE_SIZE; }
}