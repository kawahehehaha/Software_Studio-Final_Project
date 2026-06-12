/**
 * Level 3 spaceship movement and engine animation.
 *
 * WASD moves on the screen plane. Up/Down arrows change the simulated
 * altitude by scaling the ship within a configurable range.
 */
const { ccclass, property } = cc._decorator;
import { AudioBroadcast } from "../Audio/AudioEvent";

@ccclass
export default class Level3SpaceshipController extends cc.Component {
    @property(cc.Sprite)
    engineEffectSprite: cc.Sprite = null;

    @property(cc.Texture2D)
    idleEngineTexture: cc.Texture2D = null;

    @property(cc.Texture2D)
    poweringEngineTexture: cc.Texture2D = null;

    @property
    engineFrameWidth = 48;

    @property
    engineFrameHeight = 48;

    @property
    idleFrameCount = 3;

    @property
    poweringFrameCount = 4;

    @property
    engineFramesPerSecond = 10;

    @property(cc.Sprite)
    weaponSprite: cc.Sprite = null;

    @property(cc.Texture2D)
    weaponTexture: cc.Texture2D = null;

    @property
    weaponFrameWidth = 48;

    @property
    weaponFrameHeight = 48;

    @property
    weaponFrameCount = 7;

    @property
    weaponFramesPerSecond = 18;

    @property
    moveSpeed = 260;

    @property
    acceleration = 900;

    @property
    deceleration = 1100;

    @property
    minX = 40;

    @property
    maxX = 1880;

    @property
    minY = 40;

    @property
    maxY = 1880;

    @property
    altitudeSpeed = 0.75;

    @property
    farScaleMultiplier = 0.65;

    @property
    nearScaleMultiplier = 1.5;

    @property
    startAltitude = 0.5;

    @property
    maxBankAngle = 12;

    @property
    bankSmoothness = 10;

    @property
    collisionRadius = 8;

    @property
    obstacleBounceSpeed = 360;

    @property
    obstacleSeparation = 2;

    @property
    maxPlanetGravitySpeed = 75;

    @property
    planetGravityDrag = 2.5;

    @property(cc.SpriteFrame)
    roundShieldSpriteFrame: cc.SpriteFrame = null;

    @property
    shieldDuration = 3;

    @property
    shieldFrameWidth = 64;

    @property
    shieldFrameHeight = 64;

    @property
    shieldFrameCount = 12;

    @property
    shieldFramesPerSecond = 16;

    @property
    shieldVisualScale = 1.2;

    @property
    maxHealth = 4;

    @property
    healthRegenDelay = 4;

    @property
    healthRegenPerSecond = 0.35;

    @property
    maxStamina = 100;

    @property
    staminaDrainPerSecond = 10;

    @property
    staminaRegenPerSecond = 32;

    @property
    staminaDrainSpeedRatio = 0.75;

    @property
    staminaSlowdownThreshold = 0.25;

    @property
    staminaRecoveryThreshold = 0.2;

    @property
    maxAmmo = 8;

    @property
    ammoRegenPerSecond = 1.25;

    @property
    maxShield = 4;

    @property
    shieldRegenDelay = 8;

    @property
    shieldChargeRegenInterval = 5;

    /** 設為 true 時：跳過輸入與移動，只播動畫（遠端 ghost 模式） */
    public _isRemote: boolean = false;
    private _lastRemoteX: number = 0;
    private _lastRemoteY: number = 0;

    private keys = new Set<number>();
    private velocity = cc.v2();
    private planetGravityVelocity = cc.v2();
    private baseScaleX = 1;
    private baseScaleY = 1;
    private altitude = 0.5;
    private idleFrames: cc.SpriteFrame[] = [];
    private poweringFrames: cc.SpriteFrame[] = [];
    private activeFrames: cc.SpriteFrame[] = [];
    private currentFrame = 0;
    private frameElapsed = 0;
    private usingPoweringAnimation = false;
    private weaponFrames: cc.SpriteFrame[] = [];
    private weaponFrame = 0;
    private weaponFrameElapsed = 0;
    private weaponAnimating = false;
    private pendingFireDirection = 1;
    private health = 4;
    private stamina = 100;
    private ammo = 8;
    private shield = 4;
    private timeSinceDamage = 999;
    private staminaExhausted = false;
    private shieldActive = false;
    private shieldTimeRemaining = 0;
    private timeSinceShieldUse = 999;
    private shieldRechargeActive = false;
    private shieldChargeRegenElapsed = 0;
    private shieldEffectNode: cc.Node = null;
    private shieldEffectSprite: cc.Sprite = null;
    private shieldFrames: cc.SpriteFrame[] = [];
    private shieldFrameIndex = 0;
    private shieldFrameElapsed = 0;

    onLoad() {
        cc.director.getCollisionManager().enabled = true;
        this.node.group = "Player";
        this.ensureCollider();

        this.baseScaleX = this.node.scaleX;
        this.baseScaleY = this.node.scaleY;
        this.altitude = cc.misc.clampf(this.startAltitude, 0, 1);
        this.health = this.maxHealth;
        this.stamina = this.maxStamina;
        this.ammo = this.maxAmmo;
        this.shield = this.maxShield;

        this.idleFrames = this.buildFrames(
            this.idleEngineTexture,
            this.idleFrameCount
        );
        this.poweringFrames = this.buildFrames(
            this.poweringEngineTexture,
            this.poweringFrameCount,
            this.engineFrameWidth,
            this.engineFrameHeight
        );
        this.weaponFrames = this.buildFrames(
            this.weaponTexture,
            this.weaponFrameCount,
            this.weaponFrameWidth,
            this.weaponFrameHeight
        );
        this.setEngineAnimation(false);
        this.resetWeaponAnimation();
        this.createShieldEffect();
        this.applyAltitudeScale();

        cc.systemEvent.on(
            cc.SystemEvent.EventType.KEY_DOWN,
            this.onKeyDown,
            this
        );
        cc.systemEvent.on(
            cc.SystemEvent.EventType.KEY_UP,
            this.onKeyUp,
            this
        );
    }
    start() {
        AudioBroadcast.playBgm("level3_bgm");
    }

    onDestroy() {
        cc.systemEvent.off(
            cc.SystemEvent.EventType.KEY_DOWN,
            this.onKeyDown,
            this
        );
        cc.systemEvent.off(
            cc.SystemEvent.EventType.KEY_UP,
            this.onKeyUp,
            this
        );
    }

    update(dt: number) {
        if (this._isRemote) {
            // 遠端 ghost：根據 NM 移動的位置差判斷引擎動畫
            const dx = this.node.x - this._lastRemoteX;
            const dy = this.node.y - this._lastRemoteY;
            this._lastRemoteX = this.node.x;
            this._lastRemoteY = this.node.y;
            this.setEngineAnimation(dx * dx + dy * dy > 1);
            this.updateEngineAnimation(dt);
            this.updateWeaponAnimation(dt);
            return;
        }

        const direction = this.getMoveDirection();
        this.updateVelocity(direction, dt);
        this.updatePosition(dt);
        this.updatePlanetGravity(dt);
        this.updateResources(direction, dt);
        this.updateShield(dt);
        this.updateAltitude(dt);
        this.updateBank(direction.x, dt);

        const isMoving = direction.magSqr() > 0
            || this.keys.has(cc.macro.KEY.up)
            || this.keys.has(cc.macro.KEY.down);
        this.setEngineAnimation(isMoving);
        this.updateEngineAnimation(dt);
        this.updateWeaponAnimation(dt);
    }

    private onKeyDown(event: cc.Event.EventKeyboard) {
        if (!this.enabled || this._isRemote) return;
        const isNewPress = !this.keys.has(event.keyCode);
        this.keys.add(event.keyCode);

        if (!isNewPress) return;

        if (event.keyCode === cc.macro.KEY.left) {
            this.playWeaponAnimation(-1);
        } else if (event.keyCode === cc.macro.KEY.right) {
            this.playWeaponAnimation(1);
        } else if (event.keyCode === 16) {
            this.activateShield();
        }
    }

    private onKeyUp(event: cc.Event.EventKeyboard) {
        if (!this.enabled || this._isRemote) return;
        this.keys.delete(event.keyCode);
    }

    private getMoveDirection(): cc.Vec2 {
        let x = 0;
        let y = 0;

        if (this.keys.has(cc.macro.KEY.a)) x -= 1;
        if (this.keys.has(cc.macro.KEY.d)) x += 1;
        if (this.keys.has(cc.macro.KEY.w)) y += 1;
        if (this.keys.has(cc.macro.KEY.s)) y -= 1;

        const direction = cc.v2(x, y);
        return direction.magSqr() > 1 ? direction.normalize() : direction;
    }

    private updateVelocity(direction: cc.Vec2, dt: number) {
        const staminaRatio = this.maxStamina > 0
            ? cc.misc.clampf(this.stamina / this.maxStamina, 0, 1)
            : 0;
        const minimumThrust = cc.misc.clampf(
            this.staminaDrainSpeedRatio,
            0,
            1
        );
        const slowdownThreshold = Math.max(
            0.001,
            this.staminaSlowdownThreshold
        );
        const lowStaminaProgress = cc.misc.clampf(
            staminaRatio / slowdownThreshold,
            0,
            1
        );
        const thrustRatio = this.staminaExhausted
            ? minimumThrust
            : cc.misc.lerp(minimumThrust, 1, lowStaminaProgress);
        const target = direction.mul(this.moveSpeed * thrustRatio);
        const rate = direction.magSqr() > 0
            ? this.acceleration
            : this.deceleration;

        this.velocity.x = this.approach(
            this.velocity.x,
            target.x,
            rate * dt
        );
        this.velocity.y = this.approach(
            this.velocity.y,
            target.y,
            rate * dt
        );
    }

    private updatePosition(dt: number) {
        const nextX = cc.misc.clampf(
            this.node.x
                + (this.velocity.x + this.planetGravityVelocity.x) * dt,
            this.minX,
            this.maxX
        );
        const nextY = cc.misc.clampf(
            this.node.y
                + (this.velocity.y + this.planetGravityVelocity.y) * dt,
            this.minY,
            this.maxY
        );

        if (nextX === this.minX || nextX === this.maxX) {
            this.velocity.x = 0;
            this.planetGravityVelocity.x = 0;
        }

        if (nextY === this.minY || nextY === this.maxY) {
            this.velocity.y = 0;
            this.planetGravityVelocity.y = 0;
        }

        this.node.setPosition(nextX, nextY);
    }

    public applyPlanetGravity(
        direction: cc.Vec2,
        acceleration: number,
        dt: number
    ) {
        if (!direction || acceleration <= 0 || dt <= 0) return;

        this.planetGravityVelocity.x += direction.x * acceleration * dt;
        this.planetGravityVelocity.y += direction.y * acceleration * dt;

        const speed = this.planetGravityVelocity.mag();
        if (speed > this.maxPlanetGravitySpeed) {
            this.planetGravityVelocity = this.planetGravityVelocity
                .normalize()
                .mul(this.maxPlanetGravitySpeed);
        }
    }

    public takeDamage(damage: number, source?: cc.Node) {
        AudioBroadcast.playEffect('damage');
        const amount = Math.max(0, damage || 0);
        if (amount <= 0 || this.shieldActive) return;

        this.timeSinceDamage = 0;
        this.health = Math.max(0, this.health - amount);

        // 通知 Level3Ctrl 計算被打次數（多人扣星用）
        cc.director.emit("level3-player-hit", this.node);
        cc.director.emit(
            "level3-player-resources-changed",
            this.getResourceState(),
            source
        );
    }

    public consumeAmmo(amount: number = 1): boolean {
        const cost = Math.max(0, amount);
        if (this.ammo + 0.0001 < cost) return false;

        this.ammo -= cost;
        return true;
    }

    private updatePlanetGravity(dt: number) {
        const damping = Math.max(0, 1 - this.planetGravityDrag * dt);
        this.planetGravityVelocity.mulSelf(damping);
    }

    private updateResources(direction: cc.Vec2, dt: number) {
        this.timeSinceDamage += dt;

        const movingFast = (
            direction.magSqr() > 0
            && !this.staminaExhausted
        );

        if (movingFast) {
            this.stamina = Math.max(
                0,
                this.stamina - this.staminaDrainPerSecond * dt
            );
            if (this.stamina <= 0) {
                this.staminaExhausted = true;
            }
        } else {
            this.stamina = Math.min(
                this.maxStamina,
                this.stamina + this.staminaRegenPerSecond * dt
            );
            if (
                this.staminaExhausted
                && this.stamina >= (
                    this.maxStamina * this.staminaRecoveryThreshold
                )
            ) {
                this.staminaExhausted = false;
            }
        }

        this.ammo = Math.min(
            this.maxAmmo,
            this.ammo + this.ammoRegenPerSecond * dt
        );

        if (!this.shieldActive && this.shieldRechargeActive) {
            this.timeSinceShieldUse += dt;
            if (this.timeSinceShieldUse >= this.shieldRegenDelay) {
                this.shieldChargeRegenElapsed += dt;
                const interval = Math.max(
                    0.1,
                    this.shieldChargeRegenInterval
                );
                while (
                    this.shieldChargeRegenElapsed >= interval
                    && this.shield < this.maxShield
                ) {
                    this.shieldChargeRegenElapsed -= interval;
                    this.shield = Math.min(
                        this.maxShield,
                        Math.floor(this.shield) + 1
                    );
                }

                if (this.shield >= this.maxShield) {
                    this.shieldRechargeActive = false;
                    this.shieldChargeRegenElapsed = 0;
                }
            }
        }
        if (this.timeSinceDamage >= this.healthRegenDelay) {
            this.health = Math.min(
                this.maxHealth,
                this.health + this.healthRegenPerSecond * dt
            );
        }

    }

    private activateShield() {
        if (
            this.shieldActive
            || this.maxShield <= 0
            || this.shield < 1
        ) {
            return;
        }

        this.shield = Math.max(0, Math.floor(this.shield) - 1);
        this.shieldActive = true;
        this.shieldTimeRemaining = this.shieldDuration;
        this.shieldFrameIndex = 0;
        this.shieldFrameElapsed = 0;

        if (this.shield <= 0 && !this.shieldRechargeActive) {
            this.shieldRechargeActive = true;
            this.timeSinceShieldUse = 0;
            this.shieldChargeRegenElapsed = 0;
        }

        if (this.shieldEffectNode) {
            this.shieldEffectNode.active = true;
        }
        if (this.shieldEffectSprite && this.shieldFrames.length > 0) {
            this.shieldEffectSprite.spriteFrame = this.shieldFrames[0];
            this.applyShieldEffectSize();
        }
    }

    private updateShield(dt: number) {
        if (!this.shieldActive) return;

        this.shieldTimeRemaining -= dt;
        this.updateShieldAnimation(dt);

        if (this.shieldTimeRemaining > 0) return;

        this.shieldActive = false;
        this.shieldTimeRemaining = 0;
        if (this.shieldEffectNode) {
            this.shieldEffectNode.active = false;
        }
    }

    private createShieldEffect() {
        if (!this.roundShieldSpriteFrame) return;

        const texture = this.roundShieldSpriteFrame.getTexture();
        if (!texture) return;

        const availableFrames = Math.floor(
            texture.width / this.shieldFrameWidth
        );
        const frameCount = Math.min(
            this.shieldFrameCount,
            availableFrames
        );

        this.shieldFrames.length = 0;
        for (let index = 0; index < frameCount; index++) {
            this.shieldFrames.push(new cc.SpriteFrame(
                texture,
                cc.rect(
                    index * this.shieldFrameWidth,
                    0,
                    this.shieldFrameWidth,
                    this.shieldFrameHeight
                )
            ));
        }

        this.shieldEffectNode = new cc.Node("Round Shield Effect");
        this.shieldEffectNode.zIndex = 100;
        this.shieldEffectNode.setScale(this.shieldVisualScale);
        this.node.addChild(this.shieldEffectNode);

        this.shieldEffectSprite = this.shieldEffectNode.addComponent(
            cc.Sprite
        );
        this.shieldEffectSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        if (this.shieldFrames.length > 0) {
            this.shieldEffectSprite.spriteFrame = this.shieldFrames[0];
        }
        this.applyShieldEffectSize();
        this.shieldEffectNode.active = false;
    }

    private applyShieldEffectSize() {
        if (!this.shieldEffectNode) return;

        this.shieldEffectNode.setContentSize(
            this.shieldFrameWidth,
            this.shieldFrameHeight
        );
        this.shieldEffectNode.setScale(this.shieldVisualScale);
    }

    private updateShieldAnimation(dt: number) {
        if (
            !this.shieldEffectSprite
            || this.shieldFrames.length <= 1
            || this.shieldFramesPerSecond <= 0
        ) {
            return;
        }

        this.shieldFrameElapsed += dt;
        const frameDuration = 1 / this.shieldFramesPerSecond;
        while (this.shieldFrameElapsed >= frameDuration) {
            this.shieldFrameElapsed -= frameDuration;
            this.shieldFrameIndex = (
                this.shieldFrameIndex + 1
            ) % this.shieldFrames.length;
            this.shieldEffectSprite.spriteFrame =
                this.shieldFrames[this.shieldFrameIndex];
            this.applyShieldEffectSize();
        }
    }

    private updateAltitude(dt: number) {
        let altitudeInput = 0;
        if (this.keys.has(cc.macro.KEY.up)) altitudeInput += 1;
        if (this.keys.has(cc.macro.KEY.down)) altitudeInput -= 1;

        this.altitude = cc.misc.clampf(
            this.altitude + altitudeInput * this.altitudeSpeed * dt,
            0,
            1
        );
        this.applyAltitudeScale();
    }

    private applyAltitudeScale() {
        const multiplier = cc.misc.lerp(
            this.farScaleMultiplier,
            this.nearScaleMultiplier,
            this.altitude
        );
        this.node.scaleX = this.baseScaleX * multiplier;
        this.node.scaleY = this.baseScaleY * multiplier;
    }

    private updateBank(horizontalInput: number, dt: number) {
        const targetAngle = -horizontalInput * this.maxBankAngle;
        const blend = Math.min(1, this.bankSmoothness * dt);
        this.node.angle = cc.misc.lerp(this.node.angle, targetAngle, blend);
    }

    public bounceFromObstacle(obstacle: cc.Node, obstacleRadius: number) {
        if (!obstacle || !obstacle.isValid) return;

        const playerWorld = this.node.convertToWorldSpaceAR(cc.Vec2.ZERO);
        const obstacleWorld = obstacle.convertToWorldSpaceAR(cc.Vec2.ZERO);
        let normal = playerWorld.sub(obstacleWorld);

        if (normal.magSqr() < 0.0001) {
            normal = this.velocity.magSqr() > 0.0001
                ? this.velocity.normalize().neg()
                : cc.v2(1, 0);
        } else {
            normal.normalizeSelf();
        }

        const velocityTowardObstacle = this.velocity.dot(normal);
        let bouncedVelocity = velocityTowardObstacle < 0
            ? this.velocity.sub(normal.mul(2 * velocityTowardObstacle))
            : normal.mul(this.obstacleBounceSpeed);
        const bounceSpeed = Math.max(
            this.obstacleBounceSpeed,
            bouncedVelocity.mag()
        );

        if (bouncedVelocity.magSqr() < 0.0001) {
            bouncedVelocity = normal;
        }
        this.velocity = bouncedVelocity.normalize().mul(bounceSpeed);

        const playerScale = Math.max(
            Math.abs(this.node.scaleX),
            Math.abs(this.node.scaleY)
        );
        const obstacleScale = Math.max(
            Math.abs(obstacle.scaleX),
            Math.abs(obstacle.scaleY)
        );
        const separation = (
            this.collisionRadius * playerScale
            + obstacleRadius * obstacleScale
            + this.obstacleSeparation
        );
        const separatedWorld = obstacleWorld.add(normal.mul(separation));

        const separatedPosition = this.node.parent
            ? this.node.parent.convertToNodeSpaceAR(separatedWorld)
            : separatedWorld;
        this.node.setPosition(separatedPosition);
    }

    private ensureCollider() {
        let collider = this.getComponent(cc.CircleCollider);
        if (!collider) {
            collider = this.node.addComponent(cc.CircleCollider);
        }
        collider.radius = this.collisionRadius;
    }

    private buildFrames(
        texture: cc.Texture2D,
        frameCount: number,
        frameWidth: number = this.engineFrameWidth,
        frameHeight: number = this.engineFrameHeight
    ): cc.SpriteFrame[] {
        const frames: cc.SpriteFrame[] = [];
        if (!texture || frameCount <= 0) return frames;

        const available = Math.floor(texture.width / frameWidth);
        const count = Math.min(frameCount, available);

        for (let index = 0; index < count; index++) {
            frames.push(new cc.SpriteFrame(
                texture,
                cc.rect(
                    index * frameWidth,
                    0,
                    frameWidth,
                    frameHeight
                )
            ));
        }
        return frames;
    }

    private playWeaponAnimation(direction: number) {
        if (
            this.weaponAnimating
            || !this.weaponSprite
            || this.weaponFrames.length === 0
            || !this.consumeAmmo(1)
        ) {
            return;
        }

        this.pendingFireDirection = direction < 0 ? -1 : 1;
        this.weaponAnimating = true;
        this.weaponFrame = this.weaponFrames.length > 1 ? 1 : 0;
        this.weaponFrameElapsed = 0;
        this.weaponSprite.spriteFrame = this.weaponFrames[this.weaponFrame];

        cc.director.emit("level3-player-fire", this.pendingFireDirection, this.node);

        // 廣播給對方，讓對方也看到子彈
        const nm = (window as any).NM;
        if (nm && nm.room) {
            nm.room.send('l3_player_fire', { direction: this.pendingFireDirection });
        }

        if (this.weaponFrames.length === 1) {
            this.resetWeaponAnimation();
        }
    }

    private updateWeaponAnimation(dt: number) {
        if (
            !this.weaponAnimating
            || !this.weaponSprite
            || this.weaponFrames.length <= 1
            || this.weaponFramesPerSecond <= 0
        ) {
            return;
        }

        this.weaponFrameElapsed += dt;
        const frameDuration = 1 / this.weaponFramesPerSecond;

        while (this.weaponFrameElapsed >= frameDuration) {
            this.weaponFrameElapsed -= frameDuration;
            this.weaponFrame += 1;

            if (this.weaponFrame >= this.weaponFrames.length) {
                this.resetWeaponAnimation();
                return;
            }

            this.weaponSprite.spriteFrame =
                this.weaponFrames[this.weaponFrame];
        }
    }

    private resetWeaponAnimation() {
        this.weaponAnimating = false;
        this.weaponFrame = 0;
        this.weaponFrameElapsed = 0;

        if (this.weaponSprite && this.weaponFrames.length > 0) {
            this.weaponSprite.spriteFrame = this.weaponFrames[0];
        }
    }

    private setEngineAnimation(powering: boolean) {
        if (
            this.activeFrames.length > 0
            && this.usingPoweringAnimation === powering
        ) {
            return;
        }

        this.usingPoweringAnimation = powering;
        this.activeFrames = powering
            ? this.poweringFrames
            : this.idleFrames;
        this.currentFrame = 0;
        this.frameElapsed = 0;

        if (this.engineEffectSprite && this.activeFrames.length > 0) {
            this.engineEffectSprite.spriteFrame = this.activeFrames[0];
        }
    }

    private updateEngineAnimation(dt: number) {
        if (
            !this.engineEffectSprite
            || this.activeFrames.length <= 1
            || this.engineFramesPerSecond <= 0
        ) {
            return;
        }

        this.frameElapsed += dt;
        const frameDuration = 1 / this.engineFramesPerSecond;

        while (this.frameElapsed >= frameDuration) {
            this.frameElapsed -= frameDuration;
            this.currentFrame = (
                this.currentFrame + 1
            ) % this.activeFrames.length;
            this.engineEffectSprite.spriteFrame =
                this.activeFrames[this.currentFrame];
        }
    }

    public getResourceState() {
        return {
            health: this.health,
            maxHealth: this.maxHealth,
            stamina: this.stamina,
            maxStamina: this.maxStamina,
            ammo: this.ammo,
            maxAmmo: this.maxAmmo,
            shield: this.shield,
            maxShield: this.maxShield
        };
    }

    private approach(current: number, target: number, amount: number): number {
        if (current < target) return Math.min(current + amount, target);
        if (current > target) return Math.max(current - amount, target);
        return target;
    }
}
