/**
 * PinkMonsterPhysicsController.ts
 * Scene: Level2-part2
 * Attach to: The physics-based Pink Monster player node.
 * Handles movement, gravity changes, surfaces, combat actions, checkpoints, and game over.
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
var ThrownBomb = require('../effects/ThrownBomb');

cc.Class({
    extends: cc.Component,

    properties: {
        spriteSheetAnimator: {
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
        groundContactGrace: 0.12,
        jumpBufferTime: 0.1,
        groundRayLength: 10,
        groundRayInset: 0.28,
        airborneAnimationDelay: 0.08,
        airborneAnimationSpeed: 20,
        useHorizontalBounds: true,
        minX: -99999,
        maxX: 99999,
        fallLimitY: -320,
        ceilingFallLimitY: 640,
        respawnYOffset: 80,
        dustYOffset: 0,
        normalAcceleration: 99999,
        normalFriction: 99999,
        snowAcceleration: 430,
        snowFriction: 45,
        snowTurnBrake: 180,
        slimeSpeedMultiplier: 0.55,
        slimeAcceleration: 280,
        slimeFriction: 1800,
        slimeContactFriction: 8,
        actionLockDuration: 0.24,
        gravityFlipDuration: 0.35,
        gravityFlipImpulse: 80,
        enablePhysicsDebugDraw: false
    },

    onLoad: function () {
        var physicsManager = cc.director.getPhysicsManager();
        physicsManager.enabled = true;
        physicsManager.gravity = cc.v2(0, -Math.abs(this.gravity));
        physicsManager.enabledDebugDraw = this.enablePhysicsDebugDraw;

        this.body = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsBoxCollider) ||
            this.getComponent(cc.PhysicsPolygonCollider) ||
            this.getComponent(cc.PhysicsCircleCollider);

        if (!this.body) {
            cc.warn('PinkMonsterPhysicsController needs a cc.RigidBody on the same node.');
        } else {
            this.body.enabledContactListener = true;
            this.body.fixedRotation = true;
            this.body.gravityScale = 1;
        }

        if (!this.collider) {
            cc.warn('PinkMonsterPhysicsController needs a PhysicsCollider on the same node.');
        }

        this.spriteSheetAnimator = this.resolveSpriteSheetAnimator();

        this.spawnX = this.node.x;
        this.spawnY = this.node.y;
        this.currentAction = '';
        this.moveDirection = 0;
        this.horizontalVelocity = 0;
        this.leftPressed = false;
        this.rightPressed = false;
        this.attackPressed = false;
        this.attackSequence = 0;
        this.throwPressed = false;
        this.pushPressed = false;
        this.climbPressed = false;
        this.hurtPressed = false;
        this.jumpPressed = false;
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.groundContactThisStep = false;
        this.jumpBufferTimer = 0;
        this.jumpCount = 0;
        this.isActionLocked = false;
        this.actionTimer = 0;
        this.isDead = false;
        this.isOnSnowGround = false;
        this.isOnSlimeGround = false;
        this.currentIceSurface = null;
        this.currentGroundNode = null;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.initialScaleXAbs = Math.abs(this.node.scaleX || 1);
        this.gravityDirection = 1;
        this.checkpointGravityInverted = false;

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        cc.game.on(cc.game.EVENT_HIDE, this.resetInput, this);
        cc.director.on('player-out-of-life', this.handleOutOfLife, this);

        this.playIdle();
    },
    start: function () {  
        // 確保 BGM 在進入關卡時就開始播放
        AudioBroadcast.playBgm("level2_bgm");
     },

    onDestroy: function () {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
        cc.game.off(cc.game.EVENT_HIDE, this.resetInput, this);
        cc.director.off('player-out-of-life', this.handleOutOfLife, this);
    },

    resolveSpriteSheetAnimator: function () {
        var animator = this.spriteSheetAnimator;

        if (!animator || !animator.playSheet) {
            animator = this.getComponent('SpriteSheetAnimator');
        }

        if (!animator || !animator.playSheet) {
            animator = this.node.getComponentInChildren('SpriteSheetAnimator');
        }

        if (!animator || !animator.playSheet) {
            animator = this.node.addComponent('SpriteSheetAnimator');
        }

        if (animator && !animator.sprite) {
            animator.sprite = this.getComponent(cc.Sprite) || this.node.getComponentInChildren(cc.Sprite);
        }

        return animator;
    },

    update: function (dt) {
        if (!this.body || this.isDead) {
            return;
        }

        this.updateActionLock(dt);
        this.updateMoveDirection();
        this.updateGroundState(dt);
        this.updateJumpBuffer(dt);
        this.applyHorizontalMovement(dt);
        this.applyHorizontalBounds();
        this.checkFallLimit();
        this.updateAirborneAnimationState(dt);
        this.updateMovementAnimation();
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        this.refreshGroundContact(contact, otherCollider);
    },

    onPreSolve: function (contact, selfCollider, otherCollider) {
        this.refreshGroundContact(contact, otherCollider);

        var normal = contact.getWorldManifold().normal;
        var sideContact = Math.abs(normal.x) > 0.5 && Math.abs(normal.y) < 0.5;

        if (this.isSlimeNode(otherCollider.node)) {
            contact.setFriction(this.slimeContactFriction);
        } else if (sideContact || this.getIceSurface(otherCollider.node)) {
            contact.setFriction(0);
        } else {
            contact.resetFriction();
        }
    },

    refreshGroundContact: function (contact, otherCollider) {
        if (this.isDead || !otherCollider || !otherCollider.node || !this.body) {
            return;
        }

        var normal = contact.getWorldManifold().normal;
        var verticalContact = Math.abs(normal.y) > 0.5;
        var movingWithGravityOrFlat =
            this.body.linearVelocity.y * this.gravityDirection <= 5;

        if (verticalContact && movingWithGravityOrFlat) {
            this.groundContactThisStep = true;
            this.groundContactTimer = this.groundContactGrace;
            this.currentGroundNode = otherCollider.node;
            this.currentIceSurface = this.getIceSurface(otherCollider.node);
            this.isOnSnowGround = !!this.currentIceSurface;
            this.isOnSlimeGround = this.isSlimeNode(otherCollider.node);
            this.jumpCount = 0;
            this.isAirborneAnimation = false;
            this.airborneAnimationTimer = 0;
        }
    },

    updateGroundState: function (dt) {
        var groundBelow = this.hasGroundBelow();

        if (this.groundContactThisStep || groundBelow) {
            this.isGrounded = true;
            this.groundContactTimer = this.groundContactGrace;
            this.jumpCount = 0;
        } else {
            this.groundContactTimer = Math.max(this.groundContactTimer - dt, 0);
            this.isGrounded = this.groundContactTimer > 0;
        }

        if (!this.isGrounded) {
            this.currentGroundNode = null;
            this.isOnSnowGround = false;
            this.isOnSlimeGround = false;
            this.currentIceSurface = null;
        } else if (this.currentGroundNode) {
            this.currentIceSurface = this.getIceSurface(this.currentGroundNode);
            this.isOnSnowGround = !!this.currentIceSurface;
            this.isOnSlimeGround = this.isSlimeNode(this.currentGroundNode);
        }

        this.groundContactThisStep = false;
    },

    updateJumpBuffer: function (dt) {
        if (this.jumpBufferTimer <= 0) {
            return;
        }

        this.jumpBufferTimer = Math.max(this.jumpBufferTimer - dt, 0);

        if (this.canJump()) {
            this.performJump();
        }
    },

    applyHorizontalMovement: function (dt) {
        var velocity = this.body.linearVelocity;
        var speedMultiplier = this.isOnSlimeGround ? this.slimeSpeedMultiplier : 1;
        var targetVelocity = this.moveDirection * this.moveSpeed * speedMultiplier;
        var iceSurface = this.isOnSnowGround ? this.currentIceSurface : null;
        var acceleration = this.isOnSlimeGround
            ? this.slimeAcceleration
            : (iceSurface ? iceSurface.acceleration : this.normalAcceleration);
        var friction = this.isOnSlimeGround
            ? this.slimeFriction
            : (iceSurface ? iceSurface.friction : this.normalFriction);

        if (this.isOnSnowGround &&
            this.moveDirection !== 0 &&
            velocity.x !== 0 &&
            this.getSign(velocity.x) !== this.moveDirection) {
            acceleration += iceSurface ? iceSurface.turnBrake : this.snowTurnBrake;
        }

        if (this.moveDirection !== 0) {
            velocity.x = this.moveToward(velocity.x, targetVelocity, acceleration * dt);
            var facingDirection = this.moveDirection * this.gravityDirection;
            this.node.scaleX = facingDirection > 0
                ? this.initialScaleXAbs
                : -this.initialScaleXAbs;
        } else {
            velocity.x = this.moveToward(velocity.x, 0, friction * dt);
        }

        this.horizontalVelocity = velocity.x;
        this.body.linearVelocity = velocity;
    },

    applyHorizontalBounds: function () {
        if (!this.useHorizontalBounds) {
            return;
        }

        var clampedX = cc.misc.clampf(this.node.x, this.minX, this.maxX);

        if (clampedX !== this.node.x) {
            this.node.x = clampedX;
            var velocity = this.body.linearVelocity;
            velocity.x = 0;
            this.body.linearVelocity = velocity;
            this.body.syncPosition(false);
        }
    },

    checkFallLimit: function () {
        var worldY = this.node.parent ?
            this.node.parent.convertToWorldSpaceAR(this.node.position).y :
            this.node.y;
        var fellBelowBottom = this.gravityDirection > 0 && worldY <= this.fallLimitY;
        var fellAboveTop =
            this.gravityDirection < 0 && worldY >= this.ceilingFallLimitY;

        if (!fellBelowBottom && !fellAboveTop) {
            return;
        }

        this.respawnAfterFall();
    },

    respawnAfterFall: function () {
        cc.director.emit('player-life-lost');
        this.applyCheckpointGravity();
        this.node.setPosition(this.spawnX, this.spawnY + this.respawnYOffset);
        this.resetMovementState();

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.angularVelocity = 0;
            this.body.syncPosition(false);
            this.body.awake = true;
        }
    },

    restoreNormalGravity: function () {
        var wasInverted = this.gravityDirection < 0;
        this.gravityDirection = 1;

        var physicsManager = cc.director.getPhysicsManager();
        physicsManager.enabled = true;
        physicsManager.gravity = cc.v2(0, -Math.abs(this.gravity));

        if (wasInverted) {
            this.node.scaleX *= -1;
        }

        var visualNode = this.getGravityVisualNode();
        visualNode.stopActionByTag(18001);
        visualNode.angle = 0;
    },

    setCheckpoint: function (x, y, inverted) {
        this.spawnX = x;
        this.spawnY = y - this.respawnYOffset;
        this.checkpointGravityInverted = !!inverted;
    },

    applyCheckpointGravity: function () {
        var inverted = !!this.checkpointGravityInverted;
        var nextDirection = inverted ? -1 : 1;

        if (this.gravityDirection !== nextDirection) {
            this.node.scaleX *= -1;
        }
        this.gravityDirection = nextDirection;

        var physicsManager = cc.director.getPhysicsManager();
        physicsManager.enabled = true;
        physicsManager.gravity = cc.v2(0, -Math.abs(this.gravity) * nextDirection);

        var visualNode = this.getGravityVisualNode();
        visualNode.stopActionByTag(18001);
        visualNode.angle = inverted ? 180 : 0;
    },

    resetMovementState: function () {
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.groundContactThisStep = false;
        this.jumpBufferTimer = 0;
        this.jumpCount = 0;
        this.isActionLocked = false;
        this.actionTimer = 0;
        this.currentGroundNode = null;
        this.isOnSnowGround = false;
        this.isOnSlimeGround = false;
        this.currentIceSurface = null;
        this.isAirborneAnimation = false;
        this.airborneAnimationTimer = 0;
        this.horizontalVelocity = 0;
        this.playIdle();
    },

    queueJump: function () {
        this.jumpBufferTimer = this.jumpBufferTime;

        if (this.canJump()) {
            this.performJump();
        }
    },

    canJump: function () {
        return this.jumpCount < this.maxJumpCount && (this.isGrounded || this.jumpCount > 0);
    },

    performJump: function () {
        if (!this.body || this.jumpCount >= this.maxJumpCount) {
            return;
        }

        var isDoubleJump = !this.isGrounded && this.jumpCount > 0;
        var velocity = this.body.linearVelocity;
        var jumpSpeed = isDoubleJump ? this.doubleJumpSpeed : this.jumpSpeed;
        velocity.y = jumpSpeed * this.gravityDirection;
        this.body.linearVelocity = velocity;

        this.jumpCount += 1;
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.groundContactThisStep = false;
        this.jumpBufferTimer = 0;
        this.currentGroundNode = null;
        this.isOnSnowGround = false;
        this.isOnSlimeGround = false;
        this.currentIceSurface = null;
        this.isAirborneAnimation = true;
        this.airborneAnimationTimer = this.airborneAnimationDelay;

        if (isDoubleJump) {
            this.spawnDoubleJumpDust();
        }

        this.playJump();
    },

    hasGroundBelow: function () {
        if (!this.collider ||
            !this.body ||
            this.body.linearVelocity.y * this.gravityDirection > 5) {
            return false;
        }

        var physicsManager = cc.director.getPhysicsManager();
        var offset = this.collider.offset || cc.v2();
        var size = this.collider.size || this.node.getContentSize();
        var worldCenter = this.node.convertToWorldSpaceAR(offset);
        var scaleX = Math.abs(this.node.scaleX || 1);
        var scaleY = Math.abs(this.node.scaleY || 1);
        var halfWidth = size.width * scaleX / 2;
        var halfHeight = size.height * scaleY / 2;
        var surfaceY = worldCenter.y - this.gravityDirection * (halfHeight - 1);
        var rayXs = [
            worldCenter.x - halfWidth * this.groundRayInset * 2,
            worldCenter.x,
            worldCenter.x + halfWidth * this.groundRayInset * 2
        ];

        for (var i = 0; i < rayXs.length; i += 1) {
            var start = cc.v2(rayXs[i], surfaceY);
            var end = cc.v2(
                rayXs[i],
                surfaceY - this.gravityDirection * this.groundRayLength
            );
            var results = physicsManager.rayCast(start, end, cc.RayCastType.AllClosest);

            for (var j = 0; j < results.length; j += 1) {
                var hitCollider = results[j].collider;

                if (hitCollider && hitCollider.node !== this.node) {
                    this.currentGroundNode = hitCollider.node;
                    this.currentIceSurface = this.getIceSurface(hitCollider.node);
                    this.isOnSnowGround = !!this.currentIceSurface;
                    this.isOnSlimeGround = this.isSlimeNode(hitCollider.node);
                    return true;
                }
            }
        }

        return false;
    },

    toggleGravityDirection: function () {
        this.setGravityInverted(this.gravityDirection > 0);
    },

    setGravityInverted: function (inverted) {
        this.gravityDirection = inverted ? -1 : 1;

        var physicsManager = cc.director.getPhysicsManager();
        physicsManager.enabled = true;
        physicsManager.gravity = cc.v2(0, -Math.abs(this.gravity) * this.gravityDirection);

        this.resetGroundAfterGravityFlip();

        if (this.body) {
            var velocity = this.body.linearVelocity;
            velocity.y = -this.gravityDirection * this.gravityFlipImpulse;
            this.body.linearVelocity = velocity;
            this.body.awake = true;
        }

        var visualNode = this.getGravityVisualNode();
        visualNode.stopActionByTag(18001);
        var targetAngle = inverted ? 180 : 0;
        var rotateAction = cc.rotateTo(this.gravityFlipDuration, targetAngle)
            .easing(cc.easeCubicActionOut());
        rotateAction.setTag(18001);
        visualNode.runAction(rotateAction);
    },

    // 供 NetworkManager 呼叫：把遠端鬼魂的視覺節點旋轉到正確重力方向（不影響物理）
    applyGravityVisual: function (inverted) {
        var targetAngle = inverted ? 180 : 0;
        var visualNode = this.getGravityVisualNode();
        if (visualNode.angle !== targetAngle) {
            visualNode.angle = targetAngle;
        }
    },

    getGravityVisualNode: function () {
        if (this.gravityVisualNode && cc.isValid(this.gravityVisualNode)) {
            return this.gravityVisualNode;
        }

        var animator = this.spriteSheetAnimator;
        var sourceSprite = animator && animator.sprite
            ? animator.sprite
            : this.getComponent(cc.Sprite);

        if (!sourceSprite || sourceSprite.node !== this.node) {
            this.gravityVisualNode = sourceSprite ? sourceSprite.node : this.node;
            return this.gravityVisualNode;
        }

        var visualNode = new cc.Node('Player Visual');
        var visualSprite = visualNode.addComponent(cc.Sprite);
        visualSprite.spriteFrame = sourceSprite.spriteFrame;
        visualSprite.sizeMode = sourceSprite.sizeMode;
        visualNode.setPosition(0, 0);
        this.node.addChild(visualNode);

        sourceSprite.enabled = false;
        if (animator) {
            animator.sprite = visualSprite;
        }

        this.gravityVisualNode = visualNode;
        return visualNode;
    },

    resetGroundAfterGravityFlip: function () {
        this.isGrounded = false;
        this.groundContactTimer = 0;
        this.groundContactThisStep = false;
        this.jumpCount = 0;
        this.currentGroundNode = null;
        this.isOnSnowGround = false;
        this.isOnSlimeGround = false;
        this.currentIceSurface = null;
        this.isAirborneAnimation = true;
        this.airborneAnimationTimer = this.airborneAnimationDelay;
    },

    updateActionLock: function (dt) {
        if (this.actionTimer <= 0) {
            return;
        }

        this.actionTimer -= dt;

        if (this.actionTimer <= 0) {
            this.isActionLocked = false;
        }
    },

    updateAirborneAnimationState: function (dt) {
        if (this.isGrounded) {
            this.isAirborneAnimation = false;
            this.airborneAnimationTimer = 0;
            return;
        }

        if (!this.body || Math.abs(this.body.linearVelocity.y) < this.airborneAnimationSpeed) {
            return;
        }

        this.airborneAnimationTimer += dt;

        if (this.airborneAnimationTimer >= this.airborneAnimationDelay) {
            this.isAirborneAnimation = true;
        }
    },

    updateMoveDirection: function () {
        if (this.leftPressed && !this.rightPressed) {
            this.moveDirection = -1;
        } else if (this.rightPressed && !this.leftPressed) {
            this.moveDirection = 1;
        } else {
            this.moveDirection = 0;
        }
    },

    updateMovementAnimation: function () {
        if (this.isActionLocked) {
            return;
        }

        if (this.attackPressed) {
            this.playTemporaryAction(this.playAttack, this.actionLockDuration);
        } else if (this.throwPressed) {
            this.playTemporaryAction(this.playThrow, this.actionLockDuration);
        } else if (this.hurtPressed) {
            this.playTemporaryAction(this.playHurt, this.actionLockDuration);
        } else if (this.climbPressed) {
            this.playClimb();
        } else if (this.pushPressed) {
            this.playPush();
        } else if (this.isAirborneAnimation) {
            this.playJump();
        } else if (this.moveDirection !== 0 || Math.abs(this.horizontalVelocity) > 12) {
            this.playRun();
        } else {
            this.playIdle();
        }
    },

    playIdle: function () {
        this.playAction('idle', this.idleTexture, 4, 8, true);
    },

    playRun: function () {
        this.playAction('run', this.runTexture, 6, 12, true);
    },

    playJump: function () {
        this.playAction('jump', this.jumpTexture, 8, 8, true);
    },

    playAttack: function () {
        this.playAction('attack', this.attackTexture, 4, 8, true);
    },

    playThrow: function () {
        this.playAction('throw', this.throwTexture, 4, 7, true);
    },

    playPush: function () {
        this.playAction('push', this.pushTexture, 6, 8, true);
    },

    playClimb: function () {
        this.playAction('climb', this.climbTexture, 4, 8, true);
    },

    playHurt: function () {
        this.playAction('hurt', this.hurtTexture, 4, 7, true);
    },

    receiveBombHit: function () {
        if (this.isDead) {
            return;
        }

        this.playTemporaryAction(this.playHurt, this.actionLockDuration);
    },

    playDeath: function () {
        this.playAction('death', this.deathTexture, 8, 10, false);
    },

    playAction: function (actionName, texture, frameCount, fps, loop) {
        if (!this.spriteSheetAnimator || !texture || this.currentAction === actionName) {
            return;
        }

        this.currentAction = actionName;
        this.spriteSheetAnimator.playSheet(texture, frameCount, fps, loop);
    },

    playTemporaryAction: function (playAction, duration) {
        if (this.isDead) {
            return;
        }

        this.isActionLocked = true;
        this.actionTimer = duration;
        playAction.call(this);
    },

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
        dustNode.setPosition(
            this.node.x,
            this.node.y - footOffset * this.gravityDirection
        );
        dustNode.scaleX = scaleX;
        dustNode.scaleY = scaleY;
        dustNode.angle = this.gravityDirection < 0 ? 180 : 0;

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

        var direction = (this.node.scaleX < 0 ? -1 : 1) * this.gravityDirection;
        var bomb = cc.instantiate(this.bombPrefab);
        this.node.parent.addChild(bomb);
        bomb.setPosition(
            this.node.x + direction * this.bombThrowOffsetX,
            this.node.y + this.bombThrowOffsetY * this.gravityDirection
        );

        var thrownBomb = bomb.addComponent(ThrownBomb);
        thrownBomb.launch(
            direction,
            this.bombFrame,
            this.bombActiveFrame,
            this.explosionFrames,
            this.bombThrowSpeedX,
            this.bombThrowSpeedY * this.gravityDirection
        );
        return true;
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

    die: function () {
        if (this.isDead) {
            return;
        }

        this.isDead = true;
        this.resetInput();

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.angularVelocity = 0;
            this.body.gravityScale = 0;
        }

        this.playDeath();
    },

    handleOutOfLife: function () {
        if (this.isDead || !this.enabled) {
            return;
        }

        this.applyCheckpointGravity();
        this.node.setPosition(this.spawnX, this.spawnY + this.respawnYOffset);

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.angularVelocity = 0;
            this.body.syncPosition(false);
        }

        this.die();

        var nm = (window as any).NM;
        if (nm && nm.room) {
            nm.room.send('game_over', {});
        } else {
            this.scheduleOnce(function () {
                cc.director.loadScene('LevelResult');
            }, 0.8);
        }
    },

    resetCharacter: function () {
        this.isDead = false;
        this.applyCheckpointGravity();
        if (this.body) {
            this.body.gravityScale = 1;
        }
        this.node.setPosition(this.spawnX, this.spawnY);
        this.resetMovementState();

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.angularVelocity = 0;
            this.body.syncPosition(false);
            this.body.awake = true;
        }
    },

    resetInput: function () {
        this.leftPressed = false;
        this.rightPressed = false;
        this.attackPressed = false;
        this.throwPressed = false;
        this.pushPressed = false;
        this.climbPressed = false;
        this.hurtPressed = false;
        this.jumpPressed = false;
        this.moveDirection = 0;
    },

    onKeyDown: function (event) {
        if (this.isDead || !this.enabled) {
            return;
        }

        switch (event.keyCode) {
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:
                this.leftPressed = true;
                AudioBroadcast.playEffect('run_on_ground');
                break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:
                this.rightPressed = true;
                AudioBroadcast.playEffect('run_on_ground');
                break;
            case cc.macro.KEY.space:
            case cc.macro.KEY.w:
            case cc.macro.KEY.up:
                if (!this.jumpPressed) {
                    this.jumpPressed = true;
                    this.queueJump();
                }

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
                this.jumpPressed = false;
                break;
            case cc.macro.KEY.r:
                this.throwPressed = false;
                break;
            case cc.macro.KEY.k:
                this.attackPressed = false;
                break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:
                this.pushPressed = false;
                break;
            case cc.macro.KEY.c:
                this.climbPressed = false;
                break;
            case cc.macro.KEY.h:
                this.hurtPressed = false;
                break;
        }
    },

    isSnowNode: function (node) {
        while (node && node.parent) {
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

    getIceSurface: function (node) {
        while (node && node.parent) {
            var iceSurface = node.getComponent('IceSlopeSurface');

            if (iceSurface && iceSurface.getSurfaceSettings) {
                return iceSurface.getSurfaceSettings();
            }

            if (this.hasSnowName(node.name) || this.hasIceName(node.name)) {
                return {
                    acceleration: this.snowAcceleration,
                    friction: this.snowFriction,
                    turnBrake: this.snowTurnBrake
                };
            }

            var sprite = node.getComponent(cc.Sprite);
            var frameName = sprite && sprite.spriteFrame ? sprite.spriteFrame.name : '';

            if (this.hasSnowName(frameName) || this.hasIceName(frameName)) {
                return {
                    acceleration: this.snowAcceleration,
                    friction: this.snowFriction,
                    turnBrake: this.snowTurnBrake
                };
            }

            node = node.parent;
        }

        return null;
    },

    hasSnowName: function (name) {
        return !!name && name.toLowerCase().indexOf('snow') !== -1;
    },

    hasIceName: function (name) {
        return !!name && name.toLowerCase().indexOf('ice') !== -1;
    },

    isSlimeNode: function (node) {
        while (node && node.parent) {
            if (this.hasSlimeName(node.name)) {
                return true;
            }

            var sprite = node.getComponent(cc.Sprite);
            var frameName = sprite && sprite.spriteFrame ? sprite.spriteFrame.name : '';
            if (this.hasSlimeName(frameName)) {
                return true;
            }

            node = node.parent;
        }

        return false;
    },

    hasSlimeName: function (name) {
        return !!name && name.toLowerCase().indexOf('slime') !== -1;
    },

    moveToward: function (current, target, amount) {
        if (Math.abs(target - current) <= amount) {
            return target;
        }

        return current + (target > current ? 1 : -1) * amount;
    },

    getSign: function (value) {
        if (value > 0) {
            return 1;
        }

        if (value < 0) {
            return -1;
        }

        return 0;
    }
});
