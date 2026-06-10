/*
 * PinkMonsterController
 * ---------------------
 * Level 2 的粉紅怪角色控制腳本。
 *
 * 這個元件負責角色的鍵盤輸入、水平移動、跳躍 / 二段跳、重力、碰撞修正、
 * 動作動畫切換，以及死亡與重置流程。角色動畫本身交由 SpriteSheetAnimator
 * 播放，本腳本只決定目前應該播放哪一個動作 spritesheet。
 *
 * 操作方式： (TODO:動畫案件只是暫時的，用來確認動畫沒有問題)
 * - A / 左方向鍵：向左移動。
 * - D / 右方向鍵：向右移動。
 * - W / 上方向鍵 / Space：跳躍，可依 maxJumpCount 進行二段跳。
 * - K：攻擊動畫。
 * - R：丟炸彈。
 * - T：投擲動畫。
 * - S / 下方向鍵：推動動畫。
 * - 玩家按住 S 並從左右側碰到 PushBlockController 方塊時，可用 A / D 推動。
 * - C：攀爬動畫。
 * - H：受傷動畫。
 * - K：死亡動畫。
 * - R：重置角色。
 *
 * 主要系統：
 * - 移動系統：根據輸入更新 moveDirection 並套用 moveSpeed。
 * - 跳躍系統：使用 velocityY、gravity、jumpCount 管理跳躍與二段跳。
 * - 碰撞系統：透過 Cocos collision aabb 判斷地面、天花板與牆面修正。
 * - 動畫系統：依照角色狀態切換 idle / run / jump / attack 等動作。
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
var ThrownBomb = require('../effects/ThrownBomb');

cc.Class({
    extends: cc.Component,

    properties: {
        animator: {
            default: null,
            type: cc.Component
        },
        idleTexture: {
            default: null,
            type: cc.Texture2D
        },
        runTexture: {
            default: null,
            type: cc.Texture2D
        },
        jumpTexture: {
            default: null,
            type: cc.Texture2D
        },
        attackTexture: {
            default: null,
            type: cc.Texture2D
        },
        throwTexture: {
            default: null,
            type: cc.Texture2D
        },
        pushTexture: {
            default: null,
            type: cc.Texture2D
        },
        climbTexture: {
            default: null,
            type: cc.Texture2D
        },
        hurtTexture: {
            default: null,
            type: cc.Texture2D
        },
        deathTexture: {
            default: null,
            type: cc.Texture2D
        },
        doubleJumpDustTexture: {
            default: null,
            type: cc.Texture2D
        },
        bombPrefab: {
            default: null,
            type: cc.Prefab
        },
        bombFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        bombActiveFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        explosionFrames: {
            default: [],
            type: [cc.SpriteFrame]
        },
        bombThrowSpeedX: 260,
        bombThrowSpeedY: 180,
        bombThrowOffsetX: 42,
        bombThrowOffsetY: 12,
        moveSpeed: 160,
        jumpSpeed: 360,
        doubleJumpSpeed: 330,
        gravity: 900,
        maxJumpCount: 2,
        dustYOffset: 0,
        fallLimitY: -320,
        groundContactGrace: 0.2,
        useHorizontalBounds: true,
        minX: 0,
        maxX: 99999,
        collisionSkin: 0.5,
        pullGrabDistance: 16,
        respawnYOffset: 80,
        climbSpeed: 130,
        ladderHorizontalTolerance: 18,
        ropeHorizontalTolerance: 40,
        ropeCenterPullStrength: 0.25,
        ropePlatformSnapDistance: 10,
        ropePlatformExitVerticalSearch: 96,
        ropePlatformExitHorizontalTolerance: 36,
        snowAcceleration: 430,
        snowFriction: 45,
        snowTurnBrake: 180,
        rampAcceleration: 360,
        rampFriction: 18,
        rampGravityAcceleration: 260,
        rampMaxSlideSpeed: 260,
        airborneAnimationDelay: 0.08,
        airborneAnimationSpeed: 20
    },

    // 初始化動畫器、角色狀態、碰撞系統與鍵盤事件。
    onLoad: function () {
        if (!this.animator) {
            this.animator = this.getComponent('SpriteSheetAnimator');
        }

        if (!this.animator) {
            this.animator = this.node.getComponentInChildren('SpriteSheetAnimator');
        }

        if (!this.animator) {
            cc.warn('PinkMonsterController needs a SpriteSheetAnimator on this node or one of its children.');
        }

        this.currentAction = '';
        this.moveDirection = 0;
        this.velocityY = 0;
        this.spawnX = this.node.x;
        this.spawnY = this.node.y;
        this.groundY = this.spawnY;
        this.isGrounded = false;
        this.isActionLocked = false;
        this.isDead = false;
        this.actionTimer = 0;
        this.leftPressed = false;
        this.rightPressed = false;
        this.attackPressed = false;
        this.attackSequence = 0;
        this.throwPressed = false;
        this.pushPressed = false;
        this.climbPressed = false;
        this.upPressed = false;
        this.hurtPressed = false;
        this.jumpPressed = false;
        this.jumpCount = 0;
        this.groundContactTimer = 0;
        this.pushBlockTimer = 0;
        this.activePushBlock = null;
        this.activePushBlockSide = 0;
        this.activePushBlockContactTimer = 0;
        this.currentMovingPlatform = null;
        this.currentClimbType = '';
        this.currentGroundNode = null;
        this.currentRamp = null;
        this.horizontalVelocity = 0;
        this.isOnSnowGround = false;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.isRunning = false;

        var collisionManager = cc.director.getCollisionManager();
        collisionManager.enabled = true;
        collisionManager.enabledDebugDraw = false;

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        cc.director.on('player-out-of-life', this.handleOutOfLife, this);

        this.playIdle();
    },

    // 節點銷毀時移除鍵盤事件監聽。
    onDestroy: function () {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        cc.director.off('player-out-of-life', this.handleOutOfLife, this);
    },

    // 播放待機動畫。
    playIdle: function () {
        this.playAction('idle', this.idleTexture, 4, 8, true);
    },

    // 播放跑步動畫。
    playRun: function () {
        this.playAction('run', this.runTexture, 6, 12, true);
    },

    // 播放跳躍動畫。
    playJump: function () {
        this.playAction('jump', this.jumpTexture, 8, 8, true);
    },

    // 播放攻擊動畫。
    playAttack: function () {
        this.playAction('attack', this.attackTexture, 4, 8, true);
    },

    // 播放投擲動畫。
    playThrow: function () {
        this.playAction('throw', this.throwTexture, 4, 7, true);
    },

    // 播放推動動畫。
    playPush: function () {
        this.playAction('push', this.pushTexture, 6, 8, true);
    },

    // 播放攀爬動畫。
    playClimb: function () {
        this.playAction('climb', this.climbTexture, 4, 8, true);
    },

    // 播放受傷動畫。
    playHurt: function () {
        this.playAction('hurt', this.hurtTexture, 4, 7, true);
    },

    receiveBombHit: function () {
        if (this.isDead) {
            return;
        }

        this.playTemporaryAction(this.playHurt, 0.5);
    },

    // 播放死亡動畫。
    playDeath: function () {
        this.playAction('death', this.deathTexture, 8, 10, false);
    },

    // 切換角色目前動作並交給 SpriteSheetAnimator 播放。
    playAction: function (actionName, texture, frameCount, fps, loop) {
        if (!this.animator || !texture || this.currentAction === actionName) {
            return;
        }

        this.currentAction = actionName;
        this.animator.playSheet(texture, frameCount, fps, loop);
    },

    // 每幀更新角色輸入、移動、重力與動畫狀態。
    update: function (dt) {
        if (this.isDead) {
            return;
        }

        if (this.actionTimer > 0) {
            this.actionTimer -= dt;

            if (this.actionTimer <= 0) {
                this.isActionLocked = false;
            }
        }

        if (this.pushBlockTimer > 0) {
            this.pushBlockTimer -= dt;
        }

        if (this.activePushBlockContactTimer > 0) {
            this.activePushBlockContactTimer -= dt;
        }

        if (!this.pushPressed || this.activePushBlockContactTimer <= 0) {
            this.activePushBlock = null;
            this.activePushBlockSide = 0;
        }

        this.updateMoveDirection();
        this.updateGroundContact(dt);
        this.applyMovingPlatformDelta();
        this.applyClimbablePlatformDelta();
        this.refreshPullBlockCandidate();
        this.refreshLadderContact();
        this.updateSnowGroundState();

        this.previousX = this.node.x;
        this.previousY = this.node.y;

        if (this.isClimbingLadder()) {
            this.node.y += this.climbSpeed * dt;
            this.velocityY = 0;
            this.isGrounded = false;
            this.groundContactTimer = 0;
            this.jumpCount = 0;
            this.horizontalVelocity = 0;
            this.alignToRopeCenter();
            this.tryExitRopeToPlatform();
        } else {
            this.applyHorizontalMovement(dt);
        }

        this.applyHorizontalBounds();
        this.tryPullActivePushBlock();

        if (!this.isGrounded || this.velocityY !== 0) {
            this.velocityY -= this.gravity * dt;
            this.node.y += this.velocityY * dt;

            var worldY = this.node.parent ?
                this.node.parent.convertToWorldSpaceAR(this.node.position).y :
                this.node.y;
            if (worldY <= this.fallLimitY) {
                this.respawnAfterFall();
            }
        }

        this.updateAirborneAnimationState(dt);
        this.updateMovementAnimation();
    },

    respawnAfterFall: function () {
        cc.director.emit('player-life-lost');
        this.node.x = this.spawnX;
        this.node.y = this.spawnY + this.respawnYOffset;
        this.previousX = this.node.x;
        this.previousY = this.node.y;
        this.velocityY = 0;
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.jumpCount = 0;
        this.isActionLocked = false;
        this.actionTimer = 0;
        this.activePushBlock = null;
        this.activePushBlockSide = 0;
        this.activePushBlockContactTimer = 0;
        this.pushBlockTimer = 0;
        this.currentLadder = null;
        this.currentMovingPlatform = null;
        this.currentClimbType = '';
        this.currentGroundNode = null;
        this.currentRamp = null;
        this.horizontalVelocity = 0;
        this.isOnSnowGround = false;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
    },

    setCheckpoint: function (x, y) {
        this.spawnX = x;
        this.spawnY = y - this.respawnYOffset;
        this.groundY = y;
    },

    // 剛進入碰撞時修正角色位置。
    onCollisionEnter: function (other, self) {
        this.resolveSolidCollision(other, self);
    },

    // 持續碰撞時維持角色不穿透平台或牆面。
    onCollisionStay: function (other, self) {
        this.resolveSolidCollision(other, self);
    },

    // 根據碰撞前後位置判斷角色撞到地板、天花板或牆面。
    resolveSolidCollision: function (other, self) {
        if (this.isDead || !other.world || !self.world) {
            return;
        }

        if (other.node.getComponent('CheckpointController')) {
            return;
        }

        if (this.isNonSolidClimbNode(other.node)) {
            return;
        }

        var selfAabb = self.world.aabb;
        var otherAabb = other.world.aabb;

        if (!selfAabb.intersects(otherAabb)) {
            return;
        }

        var previousNodeX = typeof this.previousX === 'number' ? this.previousX : this.node.x;
        var previousNodeY = typeof this.previousY === 'number' ? this.previousY : this.node.y;
        var deltaX = this.node.x - previousNodeX;
        var deltaY = this.node.y - previousNodeY;
        var previousBottom = selfAabb.yMin - deltaY;
        var previousTop = selfAabb.yMax - deltaY;
        var previousLeft = selfAabb.xMin - deltaX;
        var previousRight = selfAabb.xMax - deltaX;
        var overlapLeft = selfAabb.xMax - otherAabb.xMin;
        var overlapRight = otherAabb.xMax - selfAabb.xMin;
        var overlapBottom = selfAabb.yMax - otherAabb.yMin;
        var overlapTop = otherAabb.yMax - selfAabb.yMin;
        var skin = this.collisionSkin;
        var groundOverlap = 0.1;
        var tolerance = 3;
        var climbingUpRope = this.isClimbingLadder() && this.currentClimbType === 'rope' && deltaY > 0;

        var ramp = other.node.getComponent('Level2RampController') ||
            other.node.getComponent('RampController');
        if (ramp) {
            this.resolveRampCollision(ramp, selfAabb, previousBottom, tolerance);
            return;
        }

        if (climbingUpRope && this.tryStandOnRopeExitPlatform(other.node, selfAabb, otherAabb, previousBottom, tolerance)) {
            return;
        }

        if (this.velocityY <= 0 && previousBottom >= otherAabb.yMax - tolerance) {
            this.node.y += Math.max(0, overlapTop - groundOverlap);
            this.velocityY = 0;
            this.isGrounded = true;
            this.isAirborneAnimation = false;
            this.airborneAnimationTimer = 0;
            this.currentMovingPlatform = this.getMovingPlatformController(other.node);
            this.currentGroundNode = other.node;
            this.currentRamp = null;
            this.jumpCount = 0;
            this.groundContactTimer = this.groundContactGrace;
            return;
        }

        if (this.velocityY > 0 && previousTop <= otherAabb.yMin + tolerance) {
            this.node.y -= overlapBottom + skin;
            this.velocityY = 0;
            return;
        }

        var pushBlock = other.node.getComponent('PushBlockController');
        if (pushBlock && this.tryPushBlock(pushBlock, previousLeft, previousRight, otherAabb, overlapLeft, overlapRight, tolerance, skin)) {
            return;
        }

        var horizontalDirection = this.getHorizontalCollisionDirection();

        if (horizontalDirection < 0 && previousLeft >= otherAabb.xMax - tolerance) {
            this.node.x += overlapRight + skin;
            this.horizontalVelocity = 0;
        } else if (horizontalDirection > 0 && previousRight <= otherAabb.xMin + tolerance) {
            this.node.x -= overlapLeft + skin;
            this.horizontalVelocity = 0;
        }
    },

    tryStandOnRopeExitPlatform: function (groundNode, selfAabb, groundAabb, previousBottom, tolerance) {
        var currentBottom = selfAabb.yMin;
        var crossedPlatformTop = previousBottom < groundAabb.yMax - tolerance &&
            currentBottom >= groundAabb.yMax - this.ropePlatformSnapDistance;

        if (!crossedPlatformTop) {
            return false;
        }

        this.node.y += groundAabb.yMax - currentBottom;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.currentMovingPlatform = this.getMovingPlatformController(groundNode);
        this.currentGroundNode = groundNode;
        this.currentRamp = null;
        this.currentLadder = null;
        this.currentClimbType = '';
        this.jumpCount = 0;
        this.groundContactTimer = this.groundContactGrace;
        return true;
    },

    tryExitRopeToPlatform: function () {
        if (this.currentClimbType !== 'rope' || !this.currentLadder) {
            return false;
        }

        var selfCollider = this.getComponent(cc.BoxCollider);
        var ropeAabb = this.getLadderAabb(this.currentLadder);

        if (!selfCollider || !selfCollider.world || !ropeAabb) {
            return false;
        }

        var platformCollider = this.findRopeExitPlatform(ropeAabb);

        if (!platformCollider || !platformCollider.world) {
            return false;
        }

        var selfAabb = selfCollider.world.aabb;
        var platformAabb = platformCollider.world.aabb;
        var bottomNearPlatformTop = selfAabb.yMin >= platformAabb.yMax - this.ropePlatformSnapDistance;
        var bodyReachedPlatformTop = selfAabb.yMax >= platformAabb.yMax - this.ropePlatformSnapDistance &&
            selfAabb.yMin < platformAabb.yMax;

        if (!bottomNearPlatformTop && !bodyReachedPlatformTop) {
            return false;
        }

        this.node.y += platformAabb.yMax - selfAabb.yMin;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.currentMovingPlatform = this.getMovingPlatformController(platformCollider.node);
        this.currentGroundNode = platformCollider.node;
        this.currentRamp = null;
        this.currentLadder = null;
        this.currentClimbType = '';
        this.jumpCount = 0;
        this.groundContactTimer = this.groundContactGrace;
        return true;
    },

    findRopeExitPlatform: function (ropeAabb) {
        var scene = cc.director.getScene();

        if (!scene || !scene.getComponentsInChildren) {
            return null;
        }

        var colliders = scene.getComponentsInChildren(cc.BoxCollider);
        var ropeCenterX = (ropeAabb.xMin + ropeAabb.xMax) * 0.5;
        var bestCollider = null;
        var bestTopY = Number.POSITIVE_INFINITY;

        for (var i = 0; i < colliders.length; i++) {
            var collider = colliders[i];

            if (!this.isValidRopeExitPlatform(collider, ropeAabb, ropeCenterX)) {
                continue;
            }

            var aabb = collider.world.aabb;

            if (aabb.yMax < bestTopY) {
                bestCollider = collider;
                bestTopY = aabb.yMax;
            }
        }

        return bestCollider;
    },

    isValidRopeExitPlatform: function (collider, ropeAabb, ropeCenterX) {
        if (!collider || !collider.enabled || !collider.world || collider.node === this.node) {
            return false;
        }

        if (this.isNonSolidClimbNode(collider.node) ||
            collider.node.getComponent('CheckpointController')) {
            return false;
        }

        var aabb = collider.world.aabb;
        var horizontalReach = this.ropePlatformExitHorizontalTolerance;
        var overlapsRopeX = ropeCenterX >= aabb.xMin - horizontalReach &&
            ropeCenterX <= aabb.xMax + horizontalReach;
        var platformAboveRope = aabb.yMax >= ropeAabb.yMax - this.ropePlatformSnapDistance;
        var platformCloseToRope = aabb.yMax <= ropeAabb.yMax + this.ropePlatformExitVerticalSearch;

        return overlapsRopeX && platformAboveRope && platformCloseToRope;
    },

    // 玩家從左右側碰到可推方塊時，將本幀水平移動量轉給方塊。
    // 按住 S 時，把玩家本幀的側向位移轉給可推方塊。
    tryPushBlock: function (pushBlock, previousLeft, previousRight, otherAabb, overlapLeft, overlapRight, tolerance, skin) {
        var deltaX = this.node.x - this.previousX;
        var pushDistance = Math.abs(deltaX);
        var playerSide = 0;

        if (previousRight <= otherAabb.xMin + tolerance) {
            playerSide = -1;
        } else if (previousLeft >= otherAabb.xMax - tolerance) {
            playerSide = 1;
        }

        if (playerSide !== 0) {
            this.activePushBlock = pushBlock;
            this.activePushBlockSide = playerSide;
            this.activePushBlockContactTimer = 0.16;
        }

        if (!this.pushPressed || pushDistance <= 0 || this.moveDirection === 0) {
            return false;
        }

        if (this.moveDirection < 0 && playerSide === 1) {
            if (pushBlock.tryPush(-1, pushDistance)) {
                this.node.x += overlapRight + skin;
                this.pushBlockTimer = 0.12;
                return true;
            }
        } else if (this.moveDirection > 0 && playerSide === -1) {
            if (pushBlock.tryPush(1, pushDistance)) {
                this.node.x -= overlapLeft + skin;
                this.pushBlockTimer = 0.12;
                return true;
            }
        }

        return false;
    },

    // 使用 RampController 計算斜面高度，避免把斜坡當成普通矩形碰撞。
    resolveRampCollision: function (ramp, selfAabb, previousBottom, tolerance) {
        var footX = (selfAabb.xMin + selfAabb.xMax) * 0.5;

        if (!ramp.containsWorldX(footX)) {
            return false;
        }

        var surfaceY = ramp.getSurfaceY(footX);
        var bottom = selfAabb.yMin;
        var distanceToSurface = bottom - surfaceY;
        var snapUp = ramp.snapUpDistance || 0;
        var snapDown = ramp.snapDownDistance || 0;
        var canSnapUp = distanceToSurface <= snapUp;
        var canSnapDown = distanceToSurface >= -snapDown;
        var cameFromAbove = previousBottom >= surfaceY - tolerance;

        if (this.velocityY > 0 || !canSnapUp || !canSnapDown || !cameFromAbove) {
            return false;
        }

        this.node.y -= distanceToSurface;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.currentMovingPlatform = this.getMovingPlatformController(ramp.node);
        this.currentGroundNode = ramp.node;
        this.currentRamp = ramp;
        this.jumpCount = 0;
        this.groundContactTimer = this.groundContactGrace;
        return true;
    },

    // 依照普通地面、雪地或斜坡選擇不同的水平移動手感。
    applyHorizontalMovement: function (dt) {
        if (this.currentRamp && this.isGrounded) {
            this.applyRampHorizontalMovement(dt);
            return;
        }

        if (this.isOnSnowGround) {
            this.applySnowHorizontalMovement(dt);
            return;
        }

        this.horizontalVelocity = this.moveDirection * this.moveSpeed;

        if (this.moveDirection !== 0) {
            this.node.x += this.horizontalVelocity * dt;
            this.node.scaleX = Math.abs(this.node.scaleX) * this.getFacingDirection();
        }
    },

    // 雪地會保留水平慣性，放開方向鍵後仍會滑行。
    applySnowHorizontalMovement: function (dt) {
        if (this.moveDirection !== 0) {
            var targetVelocity = this.moveDirection * this.moveSpeed;
            var acceleration = this.snowAcceleration;

            if (this.horizontalVelocity !== 0 &&
                this.getSign(this.horizontalVelocity) !== this.moveDirection) {
                acceleration += this.snowTurnBrake;
            }

            this.horizontalVelocity = this.moveToward(
                this.horizontalVelocity,
                targetVelocity,
                acceleration * dt
            );
            this.node.scaleX = Math.abs(this.node.scaleX) * this.getFacingDirection();
        } else {
            this.horizontalVelocity = this.moveToward(
                this.horizontalVelocity,
                0,
                this.snowFriction * dt
            );
        }

        if (Math.abs(this.horizontalVelocity) > 0.01) {
            this.node.x += this.horizontalVelocity * dt;
        }
    },

    // 斜坡會套用更滑的摩擦，並每幀增加下坡方向的加速度。
    applyRampHorizontalMovement: function (dt) {
        var downhillDirection = this.currentRamp.getDownhillDirection ?
            this.currentRamp.getDownhillDirection() :
            0;

        if (this.moveDirection !== 0) {
            var targetVelocity = this.moveDirection * this.moveSpeed;
            this.horizontalVelocity = this.moveToward(
                this.horizontalVelocity,
                targetVelocity,
                this.rampAcceleration * dt
            );
            this.node.scaleX = Math.abs(this.node.scaleX) * this.getFacingDirection();
        } else {
            this.horizontalVelocity = this.moveToward(
                this.horizontalVelocity,
                0,
                this.rampFriction * dt
            );
        }

        this.horizontalVelocity += downhillDirection * this.rampGravityAcceleration * dt;
        this.horizontalVelocity = cc.misc.clampf(
            this.horizontalVelocity,
            -this.rampMaxSlideSpeed,
            this.rampMaxSlideSpeed
        );

        if (Math.abs(this.horizontalVelocity) > 0.01) {
            this.node.x += this.horizontalVelocity * dt;
        }
    },

    // 將數值往目標靠近，並避免超過目標值。
    moveToward: function (current, target, amount) {
        if (current < target) {
            return Math.min(current + amount, target);
        }

        if (current > target) {
            return Math.max(current - amount, target);
        }

        return target;
    },

    getSign: function (value) {
        if (value > 0) {
            return 1;
        }

        if (value < 0) {
            return -1;
        }

        return 0;
    },

    // 優先使用本幀實際位移方向，讓滑行撞牆時能正確修正。
    getHorizontalCollisionDirection: function () {
        var deltaX = this.node.x - this.previousX;

        if (Math.abs(deltaX) > 0.001) {
            return this.getSign(deltaX);
        }

        return this.moveDirection;
    },

    isPullingActivePushBlock: function () {
        if (!this.pushPressed || !this.activePushBlock || this.activePushBlockSide === 0 || this.moveDirection === 0) {
            return false;
        }

        return (this.activePushBlockSide === -1 && this.moveDirection < 0) ||
            (this.activePushBlockSide === 1 && this.moveDirection > 0);
    },

    getFacingDirection: function () {
        if (this.isPullingActivePushBlock()) {
            return -this.activePushBlockSide;
        }

        return this.moveDirection;
    },

    // 按住 S 時，尋找可從旁邊拉動的方塊。
    refreshPullBlockCandidate: function () {
        if (!this.pushPressed || this.moveDirection === 0) {
            return;
        }

        var candidate = this.findPullBlockCandidate();

        if (!candidate) {
            return;
        }

        this.activePushBlock = candidate.block;
        this.activePushBlockSide = candidate.side;
        this.activePushBlockContactTimer = 0.16;
    },

    // 找出玩家移動方向反側最近的可拉方塊。
    findPullBlockCandidate: function () {
        var selfCollider = this.getComponent(cc.BoxCollider);
        var scene = cc.director.getScene();

        if (!selfCollider || !selfCollider.world || !scene || !scene.getComponentsInChildren) {
            return null;
        }

        var selfAabb = selfCollider.world.aabb;
        var blocks = scene.getComponentsInChildren('PushBlockController');
        var best = null;
        var bestGap = this.pullGrabDistance;

        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i];
            var blockCollider = block.node.getComponent(cc.BoxCollider);

            if (!blockCollider || !blockCollider.world) {
                continue;
            }

            var blockAabb = blockCollider.world.aabb;
            var verticalOverlap = selfAabb.yMax > blockAabb.yMin && selfAabb.yMin < blockAabb.yMax;

            if (!verticalOverlap) {
                continue;
            }

            var gap = 0;
            var side = 0;

            if (this.moveDirection < 0 && selfAabb.xMax <= blockAabb.xMin + this.pullGrabDistance) {
                gap = Math.max(0, blockAabb.xMin - selfAabb.xMax);
                side = -1;
            } else if (this.moveDirection > 0 && selfAabb.xMin >= blockAabb.xMax - this.pullGrabDistance) {
                gap = Math.max(0, selfAabb.xMin - blockAabb.xMax);
                side = 1;
            }

            if (side !== 0 && gap <= bestGap) {
                best = {
                    block: block,
                    side: side
                };
                bestGap = gap;
            }
        }

        return best;
    },

    // While holding S, moving away from the touched side pulls the same block along.
    tryPullActivePushBlock: function () {
        var pullDistance = Math.abs(this.node.x - this.previousX);

        if (pullDistance <= 0 || !this.isPullingActivePushBlock()) {
            return false;
        }

        if (this.activePushBlock.tryPush(this.moveDirection, pullDistance)) {
            this.activePushBlockContactTimer = 0.16;
            this.pushBlockTimer = 0.12;
            return true;
        }

        return false;
    },

    // 根據左右按鍵狀態決定水平移動方向。
    updateMoveDirection: function () {
        if (this.leftPressed && !this.rightPressed) {
            this.moveDirection = -1;
        } else if (this.rightPressed && !this.leftPressed) {
            this.moveDirection = 1;
        } else {
            this.moveDirection = 0;
        }
    },

    // 使用短暫容錯時間判斷角色是否仍接觸地面。
    updateGroundContact: function (dt) {
        if (!this.isGrounded) {
            return;
        }

        this.groundContactTimer -= dt;

        if (this.groundContactTimer <= 0) {
            this.isGrounded = false;
            this.currentMovingPlatform = null;
            this.currentGroundNode = null;
            this.currentRamp = null;
            this.isOnSnowGround = false;
        }
    },

    // 只有站在名稱或 SpriteFrame 含 snow 的地面時才啟用雪地滑行。
    updateSnowGroundState: function () {
        this.isOnSnowGround = this.isGrounded && this.isSnowNode(this.currentGroundNode);

        if (!this.isOnSnowGround && this.moveDirection === 0) {
            this.horizontalVelocity = 0;
        }
    },

    updateAirborneAnimationState: function (dt) {
        if (this.isGrounded || this.isClimbingLadder()) {
            this.isAirborneAnimation = false;
            this.airborneAnimationTimer = 0;
            return;
        }

        if (Math.abs(this.velocityY) < this.airborneAnimationSpeed) {
            return;
        }

        this.airborneAnimationTimer += dt;

        if (this.airborneAnimationTimer >= this.airborneAnimationDelay) {
            this.isAirborneAnimation = true;
        }
    },

    // 檢查節點與父節點名稱，以及 SpriteFrame 名稱是否包含 snow。
    isSnowNode: function (node) {
        var scene = cc.director.getScene();
        while (node && node !== scene) {
            if (this.hasSnowName(node.name)) {
                return true;
            }

            var sprite = node.getComponent(cc.Sprite);
            var frameName = sprite && sprite.spriteFrame ? sprite.spriteFrame.name : '';

            if (this.hasSnowName(frameName)) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    hasSnowName: function (name) {
        return !!name && name.toLowerCase().indexOf('snow') !== -1;
    },

    applyMovingPlatformDelta: function () {
        if (!this.isGrounded || !this.currentMovingPlatform) {
            return;
        }

        var platformDeltaX = this.currentMovingPlatform.getDeltaX ?
            this.currentMovingPlatform.getDeltaX() :
            0;

        if (platformDeltaX !== 0) {
            this.node.x += platformDeltaX;
        }
    },

    applyClimbablePlatformDelta: function () {
        if (!this.isClimbingLadder()) {
            return;
        }

        var movingPlatform = this.getMovingPlatformController(this.currentLadder);
        var platformDeltaX = movingPlatform && movingPlatform.getDeltaX ?
            movingPlatform.getDeltaX() :
            0;

        if (platformDeltaX !== 0) {
            this.node.x += platformDeltaX;
        }
    },

    alignToRopeCenter: function () {
        if (this.currentClimbType !== 'rope' || !this.currentLadder) {
            return;
        }

        var ropeAabb = this.getLadderAabb(this.currentLadder);

        if (!ropeAabb) {
            return;
        }

        var ropeCenterX = (ropeAabb.xMin + ropeAabb.xMax) * 0.5;

        if (this.node.parent) {
            var nodeWorldPosition = this.node.parent.convertToWorldSpaceAR(this.node.position);
            var worldCenter = cc.v2(ropeCenterX, nodeWorldPosition.y);
            var localCenter = this.node.parent.convertToNodeSpaceAR(worldCenter);
            ropeCenterX = localCenter.x;
        }

        this.node.x = cc.misc.lerp(this.node.x, ropeCenterX, this.ropeCenterPullStrength);
    },

    getMovingPlatformController: function (node) {
        var scene = cc.director.getScene();
        while (node && node !== scene) {
            var movingPlatform = node.getComponent('MovingPlatformController');

            if (movingPlatform) {
                return movingPlatform;
            }

            node = node.parent;
        }

        return null;
    },

    // 將角色 X 座標限制在關卡水平範圍內。
    applyHorizontalBounds: function () {
        if (!this.useHorizontalBounds) {
            return;
        }

        this.node.x = cc.misc.clampf(this.node.x, this.minX, this.maxX);
    },

    refreshLadderContact: function () {
        this.currentLadder = this.findCurrentLadder();
        this.currentClimbType = this.currentLadder ? this.getClimbableType(this.currentLadder) : '';
    },

    findCurrentLadder: function () {
        var selfCollider = this.getComponent(cc.BoxCollider);
        var scene = cc.director.getScene();

        if (!selfCollider || !selfCollider.world || !scene) {
            return null;
        }

        var selfAabb = selfCollider.world.aabb;
        var ladderNodes = [];

        this.collectLadderNodes(scene, ladderNodes);

        for (var i = 0; i < ladderNodes.length; i++) {
            var ladderAabb = this.getLadderAabb(ladderNodes[i]);

            if (ladderAabb && this.isOverlappingLadder(selfAabb, ladderAabb, this.getClimbableType(ladderNodes[i]))) {
                return ladderNodes[i];
            }
        }

        return null;
    },

    collectLadderNodes: function (node, ladderNodes) {
        if (!node) {
            return;
        }
        if (node !== cc.director.getScene() && !node.active) {
            return;
        }

        if (node.name && this.isClimbableNodeName(node.name) && node.opacity > 0) {
            ladderNodes.push(node);
        }

        var children = node.getChildren ? node.getChildren() : [];

        for (var i = 0; i < children.length; i++) {
            this.collectLadderNodes(children[i], ladderNodes);
        }
    },

    getLadderAabb: function (ladder) {
        var collider = ladder.getComponent(cc.BoxCollider);

        if (collider && collider.enabled && collider.world) {
            return collider.world.aabb;
        }

        return ladder.getBoundingBoxToWorld();
    },

    isOverlappingLadder: function (selfAabb, ladderAabb, climbType) {
        var selfCenterX = (selfAabb.xMin + selfAabb.xMax) * 0.5;
        var ladderCenterX = (ladderAabb.xMin + ladderAabb.xMax) * 0.5;
        var verticalOverlap = selfAabb.yMax > ladderAabb.yMin && selfAabb.yMin < ladderAabb.yMax;
        var horizontalTolerance = climbType === 'rope' ?
            this.ropeHorizontalTolerance :
            this.ladderHorizontalTolerance;
        var closeToCenter = Math.abs(selfCenterX - ladderCenterX) <=
            ((ladderAabb.xMax - ladderAabb.xMin) * 0.5 + horizontalTolerance);

        return verticalOverlap && closeToCenter;
    },

    isClimbingLadder: function () {
        return !!this.currentLadder && (this.climbPressed || this.upPressed);
    },

    isClimbableNodeName: function (name) {
        return name.indexOf('ladder_') === 0 ||
            name.indexOf('rope') === 0 ||
            name.indexOf('rop_') === 0;
    },

    isNonSolidClimbNode: function (node) {
        while (node) {
            if (node.name && (
                this.isClimbableNodeName(node.name) ||
                node.name.indexOf('rop_') === 0
            )) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    getClimbableType: function (node) {
        if (!node || !node.name) {
            return '';
        }

        return node.name.indexOf('rope') === 0 ?
            'rope' :
            node.name.indexOf('rop_') === 0 ?
                'rope' :
                'ladder';
    },

    // 依照目前輸入與狀態選擇要播放的角色動畫。
    updateMovementAnimation: function () {
        if (this.isActionLocked) {
            return;
        }

        if (this.isClimbingLadder()) {
            this.playClimb();
        } else if (this.attackPressed) {
            this.playAttack();
        } else if (this.throwPressed) {
            this.playThrow();
        } else if (this.hurtPressed) {
            this.playHurt();
        } else if (this.climbPressed) {
            this.playClimb();
        } else if (this.pushPressed || this.pushBlockTimer > 0) {
            this.playPush();
        } else if (this.isAirborneAnimation) {
            this.playJump();
        } else if (this.moveDirection !== 0 || Math.abs(this.horizontalVelocity) > 12) {
            this.playRun();
        } else {
            this.playIdle();
        }
    },

    // 執行跳躍或二段跳，並更新垂直速度。
    jump: function () {
        if (this.isActionLocked || this.isDead || this.jumpCount >= this.maxJumpCount) {
            return;
        }

        var isDoubleJump = !this.isGrounded;
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.currentGroundNode = null;
        this.currentRamp = null;
        this.isOnSnowGround = false;
        this.jumpCount += 1;
        this.velocityY = isDoubleJump ? this.doubleJumpSpeed : this.jumpSpeed;
        this.isAirborneAnimation = true;
        this.airborneAnimationTimer = this.airborneAnimationDelay;

        if (isDoubleJump) {
            this.spawnDoubleJumpDust();
        }

        this.playJump();
    },

    // 產生二段跳時腳下的煙霧特效。
    spawnDoubleJumpDust: function () {
        if (!this.doubleJumpDustTexture || !this.node.parent) {
            return;
        }

        var dustNode = new cc.Node('Double_Jump_Dust');
        var sprite = dustNode.addComponent(cc.Sprite);
        var animator = dustNode.addComponent('SpriteSheetAnimator');
        var scaleX = Math.abs(this.node.scaleX || 1);
        var scaleY = Math.abs(this.node.scaleY || 1);
        var footOffset = ((this.node.height || 32) * scaleY * 0.5) + this.dustYOffset;

        this.node.parent.addChild(dustNode);
        dustNode.setPosition(this.node.x, this.node.y - footOffset);
        dustNode.scaleX = scaleX;
        dustNode.scaleY = scaleY;

        animator.sprite = sprite;
        animator.playSheet(this.doubleJumpDustTexture, 5, 14, false);

        dustNode.runAction(cc.sequence(
            cc.delayTime(0.4),
            cc.removeSelf()
        ));
    },

    tryThrowBomb: function () {
        if (!this.bombPrefab || !this.node.parent || !this.spendBombFromHud()) {
            return false;
        }

        var direction = this.node.scaleX < 0 ? -1 : 1;
        var bomb = cc.instantiate(this.bombPrefab);
        this.node.parent.addChild(bomb);
        bomb.setPosition(
            this.node.x + direction * this.bombThrowOffsetX,
            this.node.y + this.bombThrowOffsetY
        );

        var thrownBomb = bomb.addComponent(ThrownBomb);
        thrownBomb.launch(
            direction,
            this.bombFrame,
            this.bombActiveFrame,
            this.explosionFrames,
            this.bombThrowSpeedX,
            this.bombThrowSpeedY
        );

        // 廣播炸彈給對方
        var nm = (window as any).NM;
        if (nm && nm.room) {
            var worldPos = bomb.convertToWorldSpaceAR(cc.v2());
            nm.room.send('throw_bomb', {
                x: worldPos.x,
                y: worldPos.y,
                direction: direction,
                speedX: this.bombThrowSpeedX,
                speedY: this.bombThrowSpeedY
            });
        }
        return true;
    },

    // 由 NetworkManager 呼叫：在遠端客戶端生成炸彈（不扣 HUD）
    spawnNetworkBomb: function (worldX, worldY, direction, speedX, speedY) {
        if (!this.bombPrefab || !this.node.parent) { return; }
        var bomb = cc.instantiate(this.bombPrefab);
        this.node.parent.addChild(bomb);
        var localPos = this.node.parent.convertToNodeSpaceAR(cc.v2(worldX, worldY));
        bomb.setPosition(localPos.x, localPos.y);
        var thrownBomb = bomb.addComponent(ThrownBomb);
        thrownBomb.launch(direction, this.bombFrame, this.bombActiveFrame, this.explosionFrames, speedX, speedY);
    },

    spendBombFromHud: function () {
        var scene = cc.director.getScene();
        var hud = this.findComponentRecursive(scene, 'CrashCrewHud');
        return !!(hud && hud.spendBomb && hud.spendBomb(1));
    },

    findComponentRecursive: function (node, componentName) {
        if (!node) {
            return null;
        }

        var component = node.getComponent(componentName);
        if (component) {
            return component;
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            component = this.findComponentRecursive(node.children[i], componentName);
            if (component) {
                return component;
            }
        }

        return null;
    },

    // 播放一段會暫時鎖住狀態切換的動作。
    playTemporaryAction: function (playAction, duration) {
        if (this.isDead) {
            return;
        }

        this.isActionLocked = true;
        this.actionTimer = duration;
        playAction.call(this);
    },

    // 讓角色進入死亡狀態並停止所有輸入。
    die: function () {
        if (this.isDead) {
            return;
        }

        this.isDead = true;
        this.moveDirection = 0;
        this.leftPressed = false;
        this.rightPressed = false;
        this.attackPressed = false;
        this.throwPressed = false;
        this.pushPressed = false;
        this.climbPressed = false;
        this.upPressed = false;
        this.hurtPressed = false;
        this.jumpPressed = false;
        this.pushBlockTimer = 0;
        this.activePushBlock = null;
        this.activePushBlockSide = 0;
        this.activePushBlockContactTimer = 0;
        this.currentLadder = null;
        this.currentMovingPlatform = null;
        this.currentClimbType = '';
        this.currentGroundNode = null;
        this.currentRamp = null;
        this.horizontalVelocity = 0;
        this.isOnSnowGround = false;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.velocityY = 0;
        this.playDeath();
    },

    handleOutOfLife: function () {
        if (this.isDead || !this.enabled) {
            return;
        }

        this.node.x = this.spawnX;
        this.node.y = this.spawnY + this.respawnYOffset;
        this.previousX = this.node.x;
        this.previousY = this.node.y;
        this.die();

        var nm = (window as any).NM;
        if (nm && nm.room) {
            // 多人模式：通知 server，讓雙方一起切換到結算畫面
            nm.room.send('game_over', {});
        } else {
            this.scheduleOnce(function () {
                cc.director.loadScene('LevelResult');
            }, 0.8);
        }
    },

    // 重置角色狀態並回到初始地面高度。
    resetCharacter: function () {
        this.isDead = false;
        this.isActionLocked = false;
        this.actionTimer = 0;
        this.velocityY = 0;
        this.node.x = this.spawnX;
        this.node.y = this.groundY;
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.jumpCount = 0;
        this.attackPressed = false;
        this.throwPressed = false;
        this.pushPressed = false;
        this.climbPressed = false;
        this.upPressed = false;
        this.hurtPressed = false;
        this.jumpPressed = false;
        this.pushBlockTimer = 0;
        this.activePushBlock = null;
        this.activePushBlockSide = 0;
        this.activePushBlockContactTimer = 0;
        this.currentLadder = null;
        this.currentMovingPlatform = null;
        this.currentClimbType = '';
        this.currentGroundNode = null;
        this.currentRamp = null;
        this.horizontalVelocity = 0;
        this.isOnSnowGround = false;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.playIdle();
    },

    // 處理鍵盤按下事件並更新角色輸入狀態。
    onKeyDown: function (event) {
        if (!this.enabled) { return; }
        switch (event.keyCode) {
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:
                this.leftPressed = true;
                AudioBroadcast.playEffect("run_on_ground");
                break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:
                this.rightPressed = true;
                AudioBroadcast.playEffect("run_on_ground");
                break;
            case cc.macro.KEY.space:
            case cc.macro.KEY.w:
            case cc.macro.KEY.up:
                this.upPressed = true;
                this.refreshLadderContact();
                if (this.currentLadder) {
                    break;
                }

                if (!this.jumpPressed) {
                    this.jumpPressed = true;
                    this.jump();
                }

                // jump sound 
                AudioBroadcast.playEffect('jump');
                break;
            case cc.macro.KEY.r:
                if (!this.throwPressed && this.tryThrowBomb()) {
                    this.throwPressed = true;
                }
                break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:
                this.pushPressed = true;
                break;
            case cc.macro.KEY.c:
                this.climbPressed = true;
                break;
            case cc.macro.KEY.h:
                this.hurtPressed = true;
                break;
            case cc.macro.KEY.k:
                if (!this.attackPressed) {
                    this.attackPressed = true;
                    this.attackSequence += 1;
                }
                break;
        }
    },

    // 處理鍵盤放開事件並取消對應輸入狀態。
    onKeyUp: function (event) {
        if (!this.enabled) { return; }
        switch (event.keyCode) {
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:
                this.leftPressed = false;
                AudioBroadcast.stopEffect("run_on_ground");
                break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:
                this.rightPressed = false;
                AudioBroadcast.stopEffect("run_on_ground");
                break;
            case cc.macro.KEY.space:
            case cc.macro.KEY.w:
            case cc.macro.KEY.up:
                this.upPressed = false;
                this.jumpPressed = false;
                break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:
                this.pushPressed = false;
                break;
            case cc.macro.KEY.r:
                this.throwPressed = false;
                break;
            case cc.macro.KEY.k:
                this.attackPressed = false;
                break;
            case cc.macro.KEY.c:
                this.climbPressed = false;
                break;
            case cc.macro.KEY.h:
                this.hurtPressed = false;
                break;
        }
    }
});
