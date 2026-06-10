/**
 * Colyseus Server — 支援主專案全遊戲雙人聯機
 *
 * 啟動方式：
 *   cd TO_BE_CLONE/spaceship-server
 *   npm install
 *   node index.js
 *
 * 訊息一覽：
 *   Client → Server:
 *     move          {x, y, angle}        每幀位置
 *     trigger       {scene}              切換場景（ExploreCtrl 進關卡觸發）
 *     complete      {level}              關卡完成（LevelBaseCtrl 觸發）
 *     collect_item  {count}              收集道具
 *     reset                              重置遊戲
 *   Server → Client:
 *     init          {playerIndex}        告知玩家編號
 *     positions     {sessionId:{x,y,angle}} 所有玩家位置
 *     scene_change  {scene}              廣播切換場景
 *     unlock        {level}              同步關卡進度
 *     sync_items    {total}              同步道具總數
 *     do_reset                           廣播重置
 */

const { Server, Room } = require("colyseus");
const http = require("http");

class GameRoom extends Room {
    onCreate() {
        this.setState({
            players:   {},
            itemCount: 0,
            level:     1
        });

        // 記錄每個場景等待就緒的玩家 { sceneKey: { sessionId: true } }
        this.readySets = {};

        // ── 位置同步 ───────────────────────────────────────────────
        this.onMessage("move", (client, data) => {
            this.state.players[client.sessionId] = {
                x:        data.x,
                y:        data.y,
                angle:    data.angle,
                scaleX:   data.scaleX,
                scaleY:   data.scaleY,
                action:   data.action,
                isFlipped: !!data.isFlipped
            };
            this.broadcast("positions", this.state.players);
        });

        // ── 場景切換（由持有鑰匙的玩家觸發，廣播給雙方）──────────
        this.onMessage("trigger", (client, data) => {
            this.broadcast("scene_change", { scene: data.scene });
        });

        // ── 關卡完成 ───────────────────────────────────────────────
        this.onMessage("complete", (client, data) => {
            this.state.level = data.level;
            this.broadcast("unlock",       { level: data.level });
            this.broadcast("scene_change", { scene: "LevelResult" });
        });

        // ── 收集道具 ───────────────────────────────────────────────
        this.onMessage("collect_item", (client, data) => {
            this.state.itemCount += (data.count || 1);
            this.broadcast("sync_items", { total: this.state.itemCount });
        });

        // ── 場景就緒同步（兩人都到終點才一起轉場）────────────────
        this.onMessage("scene_ready", (client, data) => {
            const key = data.scene || "default";
            if (!this.readySets[key]) this.readySets[key] = {};
            this.readySets[key][client.sessionId] = true;
            const readyCount = Object.keys(this.readySets[key]).length;
            const totalCount = Object.keys(this.state.players).length;
            console.log(`[scene_ready] "${key}": ${readyCount}/${totalCount}`);
            if (readyCount >= totalCount) {
                delete this.readySets[key];
                this.broadcast("all_scene_ready", { scene: key });
            }
        });

        // ── 重置遊戲 ───────────────────────────────────────────────
        this.onMessage("reset", (client) => {
            this.state.itemCount = 0;
            this.state.level     = 1;
            this.broadcast("do_reset");
        });

        // ── 可移動物件位置同步（推箱子等）─────────────────────────
        this.onMessage("sync_objects", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("objects_synced", data);
        });

        // ── 炸彈擊中木箱，通知對方同步 ───────────────────────────
        this.onMessage("box_hit", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("box_hit", data);
        });

        // ── 金幣被吃掉，通知對方也移除 ────────────────────────────
        this.onMessage("collect_coin", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("coin_removed", data);
        });

        // ── 有玩家失去一條命，通知對方同步扣血 ───────────────────
        this.onMessage("sync_life_lost", (client) => {
            this.broadcast("life_lost_notify", { senderId: client.sessionId });
        });

        // ── 任一玩家生命歸零，廣播雙方一起結算 ───────────────────
        this.onMessage("game_over", () => {
            this.broadcast("game_over", {});
        });

        // ── 炸彈生成，通知對方也生成同一顆炸彈 ──────────────────
        this.onMessage("throw_bomb", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("throw_bomb", data);
        });

        // ── 怪物死亡，通知對方同步消除 ────────────────────────────
        this.onMessage("enemy_killed", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("enemy_killed", data);
        });

        // ── 碰到旗幟存檔點，通知對方也更新存檔 ───────────────────
        this.onMessage("checkpoint_reached", (client, data) => {
            data.senderId = client.sessionId;
            this.broadcast("checkpoint_reached", data);
        });
    }

    onJoin(client) {
        const playerIndex = Object.keys(this.state.players).length;
        this.state.players[client.sessionId] = { x: 0, y: 0, angle: 0 };
        client.send("init", { playerIndex });
        console.log(`[+] ${client.sessionId} 加入 → 玩家${playerIndex}`);

        // 超過 2 人時踢掉（選填）
        if (playerIndex >= 2) {
            client.send("error", { msg: "房間已滿" });
            client.leave();
        }
    }

    onLeave(client) {
        delete this.state.players[client.sessionId];
        console.log(`[-] ${client.sessionId} 離開`);
    }
}

const server = new Server({ server: http.createServer() });

// 保留舊房間名稱（space_room）相容 TO_BE_CLONE，同時也支援新名稱
server.define("space_room", GameRoom);

server.listen(2567);
console.log("✅  Server 跑在 port 2567  →  ws://localhost:2567");
