/**
 * Generates vertical Level 3 obstacle chunks with planets distributed along
 * a shifting route in front of the player.
 */
import Level3PlanetObstacle from "./Level3PlanetObstacle";

const { ccclass, property } = cc._decorator;

interface SpawnedCircle {
    x: number;
    y: number;
    radius: number;
    name: string;
    chunkIndex: number;
}

@ccclass
export default class Level3ProceduralMapGenerator extends cc.Component {
    @property(cc.Node)
    player: cc.Node = null;

    @property(cc.Node)
    obstacleLayer: cc.Node = null;

    @property([cc.Prefab])
    planetPrefabs: cc.Prefab[] = [];

    @property
    worldMinX = 0;

    @property
    worldMaxX = 1920;

    @property
    chunkHeight = 720;

    @property
    chunksAhead = 4;

    @property
    chunksBehind = 2;

    @property
    minPlanetsPerChunk = 2;

    @property
    maxPlanetsPerChunk = 4;

    @property
    minPlanetScale = 1;

    @property
    maxPlanetScale = 5;

    @property
    safeCorridorWidth = 420;

    @property
    corridorShiftPerChunk = 260;

    @property
    edgePadding = 80;

    @property
    obstacleSpacing = 120;

    @property
    samePlanetSpacing = 500;

    @property
    spawnSafeRadius = 500;

    @property
    spawnAttemptsPerPlanet = 30;

    @property
    initialPoolSizePerPrefab = 1;

    @property
    logGeneration = true;

    private chunks = new Map<number, cc.Node>();
    private corridorCenters = new Map<number, number>();
    private spawnedPlanets: SpawnedCircle[] = [];
    private planetPools: cc.NodePool[] = [];
    private playerSpawnPosition = cc.v2();
    private rng: () => number = Math.random;

    onLoad() {
        // Use a shared seed in multiplayer so both machines generate identical terrain
        const nm = (window as any).NM;
        if (nm && nm.mapSeed) {
            this.rng = this.makeSeededRng(nm.mapSeed);
        }
        cc.director.getCollisionManager().enabled = true;

        if (!this.obstacleLayer) {
            this.obstacleLayer = this.node;
        }

        this.playerSpawnPosition = this.player
            ? cc.v2(this.player.x, this.player.y)
            : cc.v2();
        this.initializePools();

        const startChunk = this.getChunkIndex(
            this.player ? this.player.y : 0
        );
        this.corridorCenters.set(
            startChunk,
            this.player
                ? cc.misc.clampf(
                    this.player.x,
                    this.getCorridorMinCenter(),
                    this.getCorridorMaxCenter()
                )
                : (this.worldMinX + this.worldMaxX) * 0.5
        );
        this.updateChunks(startChunk);

        if (this.logGeneration) {
            cc.log(
                `[Level3Map] started: playerChunk=${startChunk}, `
                + `prefabs=${this.planetPrefabs.length}, `
                + `chunks=${this.chunks.size}`
            );
        }
    }

    update() {
        if (!this.player || this.planetPrefabs.length === 0) return;
        this.updateChunks(this.getChunkIndex(this.player.y));
    }

    private updateChunks(playerChunk: number) {
        const minChunk = playerChunk - this.chunksBehind;
        const maxChunk = playerChunk + this.chunksAhead;

        for (let index = minChunk; index <= maxChunk; index++) {
            if (!this.chunks.has(index)) {
                this.generateChunk(index);
            }
        }

        this.chunks.forEach((chunk, index) => {
            if (index < minChunk || index > maxChunk) {
                this.recycleChunkPlanets(chunk);
                chunk.destroy();
                this.chunks.delete(index);
                this.spawnedPlanets = this.spawnedPlanets.filter(
                    planet => planet.chunkIndex !== index
                );
            }
        });
    }

    private generateChunk(index: number) {
        if (this.planetPrefabs.length === 0 || !this.obstacleLayer) return;

        const chunkBottom = index * this.chunkHeight;
        const chunk = new cc.Node(`ObstacleChunk_${index}`);
        this.obstacleLayer.addChild(chunk);
        chunk.setPosition(0, chunkBottom);
        this.chunks.set(index, chunk);

        const corridorCenter = this.getCorridorCenter(index);
        const planetCount = this.randomInt(
            this.minPlanetsPerChunk,
            this.maxPlanetsPerChunk
        );

        for (let planetIndex = 0; planetIndex < planetCount; planetIndex++) {
            this.trySpawnPlanet(
                chunk,
                chunkBottom,
                index,
                planetIndex,
                planetCount
            );
        }

        if (this.logGeneration) {
            cc.log(
                `[Level3Map] chunk=${index}, planets=`
                + `${this.countPlanetsInChunk(index)}, `
                + `corridorX=${Math.round(corridorCenter)}`
            );
        }
    }

    private trySpawnPlanet(
        chunk: cc.Node,
        chunkBottom: number,
        chunkIndex: number,
        planetIndex: number,
        planetCount: number
    ) {
        for (
            let attempt = 0;
            attempt < this.spawnAttemptsPerPlanet;
            attempt++
        ) {
            const prefabIndex = this.randomInt(
                0,
                this.planetPrefabs.length - 1
            );
            const prefab = this.planetPrefabs[prefabIndex];
            if (!prefab) continue;

            const planet = this.acquirePlanet(prefabIndex);
            const obstacle = planet.getComponent(Level3PlanetObstacle);
            const scale = this.randomRange(
                this.minPlanetScale,
                this.maxPlanetScale
            );
            const radius = (
                obstacle ? obstacle.collisionRadius : 50
            ) * scale;
            const worldWidth = this.worldMaxX - this.worldMinX;
            const segmentWidth = worldWidth / Math.max(planetCount, 1);
            const minX = this.worldMinX + segmentWidth * planetIndex;
            const maxX = minX + segmentWidth;
            const x = this.randomRange(minX, maxX);
            const minY = chunkBottom + radius;
            const maxY = chunkBottom + this.chunkHeight - radius;
            const y = minY <= maxY
                ? this.randomRange(minY, maxY)
                : chunkBottom + this.chunkHeight * 0.5;

            if (this.isInsideSpawnSafeZone(x, y, obstacle, scale)) {
                this.recyclePlanet(planet);
                continue;
            }
            if (this.overlapsPlanet(
                x,
                y,
                radius,
                planet.name,
                this.spawnedPlanets
            )) {
                this.recyclePlanet(planet);
                continue;
            }

            planet.setPosition(x, y - chunkBottom);
            planet.scaleX = this.rng() < 0.5 ? -scale : scale;
            planet.scaleY = scale;
            planet.group = "Ground";
            chunk.addChild(planet);
            planet.active = true;

            if (obstacle) {
                obstacle.resetForSpawn();
            }
            const animator = planet.getComponent(
                "PlanetBackgroundAnimator"
            ) as any;
            if (animator && typeof animator.resetForSpawn === "function") {
                animator.resetForSpawn();
            }

            this.spawnedPlanets.push({
                x,
                y,
                radius,
                name: planet.name,
                chunkIndex
            });
            return;
        }
    }

    private isInsideSpawnSafeZone(
        x: number,
        y: number,
        obstacle: Level3PlanetObstacle,
        scale: number
    ): boolean {
        const gravityRange = obstacle
            ? obstacle.collisionRadius + obstacle.gravityRange
            : 190;
        const safeDistance = this.spawnSafeRadius + gravityRange * scale;
        const dx = x - this.playerSpawnPosition.x;
        const dy = y - this.playerSpawnPosition.y;
        return dx * dx + dy * dy < safeDistance * safeDistance;
    }

    onDestroy() {
        for (const pool of this.planetPools) {
            pool.clear();
        }
        this.planetPools.length = 0;
    }

    private initializePools() {
        this.planetPools = this.planetPrefabs.map(() => new cc.NodePool());
        const initialSize = Math.max(
            0,
            Math.floor(this.initialPoolSizePerPrefab)
        );

        for (
            let prefabIndex = 0;
            prefabIndex < this.planetPrefabs.length;
            prefabIndex++
        ) {
            const prefab = this.planetPrefabs[prefabIndex];
            if (!prefab) continue;

            for (let count = 0; count < initialSize; count++) {
                const planet = cc.instantiate(prefab);
                (planet as any).__level3PlanetPoolIndex = prefabIndex;
                this.planetPools[prefabIndex].put(planet);
            }
        }
    }

    private acquirePlanet(prefabIndex: number): cc.Node {
        const pool = this.planetPools[prefabIndex];
        const planet = pool && pool.size() > 0
            ? pool.get()
            : cc.instantiate(this.planetPrefabs[prefabIndex]);

        (planet as any).__level3PlanetPoolIndex = prefabIndex;
        return planet;
    }

    private recyclePlanet(planet: cc.Node) {
        if (!planet || !planet.isValid) return;

        const obstacle = planet.getComponent(Level3PlanetObstacle);
        if (obstacle) {
            obstacle.resetForPool();
        }

        planet.active = false;
        const prefabIndex = (planet as any).__level3PlanetPoolIndex;
        const pool = this.planetPools[prefabIndex];
        if (pool) {
            pool.put(planet);
        } else {
            planet.destroy();
        }
    }

    private recycleChunkPlanets(chunk: cc.Node) {
        const planets = chunk.children.slice();
        for (const planet of planets) {
            this.recyclePlanet(planet);
        }
    }

    private getCorridorCenter(index: number): number {
        const existing = this.corridorCenters.get(index);
        if (existing !== undefined) return existing;

        const previousIndex = index - 1;
        const nextIndex = index + 1;
        let reference = this.corridorCenters.get(previousIndex);

        if (reference === undefined) {
            reference = this.corridorCenters.get(nextIndex);
        }
        if (reference === undefined) {
            reference = (this.worldMinX + this.worldMaxX) * 0.5;
        }

        const center = cc.misc.clampf(
            reference + this.randomRange(
                -this.corridorShiftPerChunk,
                this.corridorShiftPerChunk
            ),
            this.getCorridorMinCenter(),
            this.getCorridorMaxCenter()
        );
        this.corridorCenters.set(index, center);
        return center;
    }

    private overlapsPlanet(
        x: number,
        y: number,
        radius: number,
        name: string,
        placed: SpawnedCircle[]
    ): boolean {
        for (const other of placed) {
            const dx = x - other.x;
            const dy = y - other.y;
            const spacing = name === other.name
                ? this.samePlanetSpacing
                : this.obstacleSpacing;
            const minDistance = radius + other.radius + spacing;
            if (dx * dx + dy * dy < minDistance * minDistance) return true;
        }
        return false;
    }

    private countPlanetsInChunk(index: number): number {
        return this.spawnedPlanets.filter(
            planet => planet.chunkIndex === index
        ).length;
    }

    private getCorridorMinCenter(): number {
        return (
            this.worldMinX
            + this.edgePadding
            + this.safeCorridorWidth * 0.5
        );
    }

    private getCorridorMaxCenter(): number {
        return (
            this.worldMaxX
            - this.edgePadding
            - this.safeCorridorWidth * 0.5
        );
    }

    private getChunkIndex(y: number): number {
        return Math.floor(y / this.chunkHeight);
    }

    private randomRange(min: number, max: number): number {
        return min + this.rng() * (max - min);
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(this.randomRange(min, max + 1));
    }

    /** Mulberry32 — fast, good-quality 32-bit seeded PRNG */
    private makeSeededRng(seed: number): () => number {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
        };
    }
}
