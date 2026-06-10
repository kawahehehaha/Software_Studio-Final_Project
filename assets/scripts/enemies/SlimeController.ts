/**
 * SlimeController.ts
 * Scene: Level2-part2
 * Attach to: A slime enemy with a rigid body and physics collider.
 * Handles patrol, chase, contact damage, stomp/attack reactions, and death.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        walkAFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        walkBFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        restFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        flatFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        walkFrameInterval: 0.18,
        patrolSpeed: 28,
        chaseSpeed: 55,
        patrolDistance: 140,
        detectionRange: 260,
        detectionHeight: 150,
        patrolWalkMinDuration: 2.2,
        patrolWalkMaxDuration: 4.5,
        restMinDuration: 0.6,
        restMaxDuration: 1.5,
        stompBounceSpeed: 360,
        stompPositionTolerance: 10,
        damagePlayerOnTouch: true,
        damageCooldown: 0.8,
        playerKnockbackX: 180,
        playerKnockbackY: 180,
        attackHitsToDefeat: 3,
        attackKnockbackX: 120,
        attackKnockbackY: 45,
        attackHitStunDuration: 0.22,
        attackFlatOffsetY: 5,
        flatDuration: 0.35,
        deathFallSpeed: 220,
        deathFallDuration: 2,
        removeAfterDeath: true
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite);
        this.body = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsBoxCollider) ||
            this.getComponent(cc.PhysicsPolygonCollider) ||
            this.getComponent(cc.PhysicsCircleCollider);

        this.spawnX = this.node.x;
        this.facingDirection = this.node.scaleX < 0 ? -1 : 1;
        this.baseScaleX = Math.abs(this.node.scaleX || 1);
        this.gravityDirection = this.node.scaleY < 0 ? -1 : 1;
        this.state = 'patrol';
        this.stateTimer = this.randomRange(
            this.patrolWalkMinDuration,
            this.patrolWalkMaxDuration
        );
        this.choosePatrolDirection();
        this.animationTimer = 0;
        this.walkFrameIndex = 0;
        this.damageTimer = 0;
        this.attackHitCount = 0;
        this.lastAttackSequence = -1;
        this.attackHitStunTimer = 0;
        this.attackFlatVisual = null;
        this.dead = false;
        this.deathFalling = false;
        this.deathTimer = 0;
        this.player = null;

        if (this.body) {
            this.body.type = cc.RigidBodyType.Dynamic;
            this.body.fixedRotation = true;
            this.body.enabledContactListener = true;
            this.syncGravityScale();
        } else {
            cc.warn('SlimeController needs a cc.RigidBody on the same node.');
        }

        if (!this.collider) {
            cc.warn('SlimeController needs a PhysicsCollider on the same node.');
        }

        this.showWalkFrame();
    },

    update: function (dt) {
        if (this.dead) {
            this.updateDeath(dt);
            return;
        }

        this.damageTimer = Math.max(this.damageTimer - dt, 0);
        this.syncGravityScale();

        if (this.attackHitStunTimer > 0) {
            this.attackHitStunTimer = Math.max(this.attackHitStunTimer - dt, 0);
            if (this.attackHitStunTimer <= 0) {
                this.hideAttackFlatVisual();
                this.showWalkFrame();
            }
            return;
        }

        if (!this.player || !cc.isValid(this.player.node)) {
            this.player = this.findPlayerInScene();
        }

        if (this.isPlayerInDetectionRange()) {
            this.updateChase();
        } else {
            this.updatePatrol(dt);
        }

        this.updateWalkAnimation(dt);
    },

    updatePatrol: function (dt) {
        this.stateTimer -= dt;

        if (this.state === 'rest') {
            this.stopHorizontalMovement();
            this.showRestFrame();

            if (this.stateTimer <= 0) {
                this.state = 'patrol';
                this.stateTimer = this.randomRange(
                    this.patrolWalkMinDuration,
                    this.patrolWalkMaxDuration
                );
                this.choosePatrolDirection();
            }
            return;
        }

        var previousDirection = this.facingDirection;
        if (this.node.x <= this.spawnX - this.patrolDistance) {
            this.facingDirection = 1;
        } else if (this.node.x >= this.spawnX + this.patrolDistance) {
            this.facingDirection = -1;
        }

        if (this.facingDirection !== previousDirection) {
            this.stateTimer = this.randomRange(
                this.patrolWalkMinDuration,
                this.patrolWalkMaxDuration
            );
        }

        this.applyHorizontalMovement(this.facingDirection, this.patrolSpeed);

        if (this.stateTimer <= 0) {
            this.state = 'rest';
            this.stateTimer = this.randomRange(
                this.restMinDuration,
                this.restMaxDuration
            );
        }
    },

    updateChase: function () {
        this.state = 'chase';
        var deltaX = this.player.node.x - this.node.x;

        if (Math.abs(deltaX) < 4) {
            this.stopHorizontalMovement();
            return;
        }

        this.facingDirection = deltaX < 0 ? -1 : 1;
        this.applyHorizontalMovement(this.facingDirection, this.chaseSpeed);
    },

    applyHorizontalMovement: function (direction, speed) {
        if (!this.body) {
            return;
        }

        var velocity = this.body.linearVelocity;
        velocity.x = direction * speed;
        this.body.linearVelocity = velocity;
        this.node.scaleX = direction < 0 ? this.baseScaleX : -this.baseScaleX;
    },

    stopHorizontalMovement: function () {
        if (!this.body) {
            return;
        }

        var velocity = this.body.linearVelocity;
        velocity.x = 0;
        this.body.linearVelocity = velocity;
    },

    choosePatrolDirection: function () {
        if (this.node.x <= this.spawnX - this.patrolDistance) {
            this.facingDirection = 1;
        } else if (this.node.x >= this.spawnX + this.patrolDistance) {
            this.facingDirection = -1;
        } else {
            this.facingDirection = Math.random() < 0.5 ? -1 : 1;
        }
    },

    updateWalkAnimation: function (dt) {
        if (this.state === 'rest') {
            return;
        }

        this.animationTimer += dt;
        if (this.animationTimer < this.walkFrameInterval) {
            return;
        }

        this.animationTimer = 0;
        this.walkFrameIndex = 1 - this.walkFrameIndex;
        this.showWalkFrame();
    },

    showWalkFrame: function () {
        if (!this.sprite) {
            return;
        }

        var frame = this.walkFrameIndex === 0 ? this.walkAFrame : this.walkBFrame;
        if (frame) {
            this.sprite.spriteFrame = frame;
        }
    },

    showRestFrame: function () {
        if (this.sprite && this.restFrame) {
            this.sprite.spriteFrame = this.restFrame;
        }
    },

    onBeginContact: function (contact, selfCollider, otherCollider) {
        this.handlePlayerContact(contact, otherCollider);
    },

    onPreSolve: function (contact, selfCollider, otherCollider) {
        this.handlePlayerContact(contact, otherCollider);
    },

    handlePlayerContact: function (contact, otherCollider) {
        if (this.dead) {
            if (contact) {
                contact.disabled = true;
            }
            return;
        }

        var player = this.findPlayerController(otherCollider && otherCollider.node);
        if (!player) {
            return;
        }

        if (this.isStomp(player, otherCollider)) {
            if (contact) {
                contact.disabled = true;
            }
            this.flatten(player);
            return;
        }

        if (this.tryReceiveAttack(player)) {
            if (contact) {
                contact.disabled = true;
            }
            return;
        }

        if (this.damagePlayerOnTouch && this.damageTimer <= 0) {
            this.damagePlayer(player);
        }
    },

    tryReceiveAttack: function (player) {
        if (!player.attackPressed || typeof player.attackSequence !== 'number') {
            return false;
        }

        if (this.lastAttackSequence === player.attackSequence) {
            return true;
        }

        this.lastAttackSequence = player.attackSequence;
        this.attackHitCount += 1;

        if (this.attackHitCount >= Math.max(this.attackHitsToDefeat, 1)) {
            this.flatten(null, false);
            return true;
        }

        this.applyAttackKnockback(player);
        return true;
    },

    applyAttackKnockback: function (player) {
        this.attackHitStunTimer = Math.max(this.attackHitStunDuration, 0);
        this.showAttackFlatVisual();
        this.state = 'patrol';
        this.stateTimer = this.randomRange(
            this.patrolWalkMinDuration,
            this.patrolWalkMaxDuration
        );

        var direction = this.node.x >= player.node.x ? 1 : -1;
        this.facingDirection = -direction;

        if (this.body) {
            this.body.linearVelocity = cc.v2(
                direction * Math.abs(this.attackKnockbackX),
                this.gravityDirection * Math.abs(this.attackKnockbackY)
            );
            this.body.awake = true;
        }
    },

    showAttackFlatVisual: function () {
        if (!this.sprite || !this.flatFrame) {
            return;
        }

        if (!this.attackFlatVisual) {
            this.attackFlatVisual = new cc.Node('AttackFlatVisual');
            this.node.addChild(this.attackFlatVisual);
            this.attackFlatVisual.addComponent(cc.Sprite);
        }

        var flatSprite = this.attackFlatVisual.getComponent(cc.Sprite);
        flatSprite.spriteFrame = this.flatFrame;
        flatSprite.sizeMode = this.sprite.sizeMode;
        this.attackFlatVisual.setPosition(0, -Math.abs(this.attackFlatOffsetY));
        this.attackFlatVisual.active = true;
        this.sprite.enabled = false;
    },

    hideAttackFlatVisual: function () {
        if (this.attackFlatVisual) {
            this.attackFlatVisual.active = false;
        }

        if (this.sprite) {
            this.sprite.enabled = true;
        }
    },

    isStomp: function (player, playerCollider) {
        if (!player || !player.node || !playerCollider) {
            return false;
        }

        var gravityDirection = player.gravityDirection || 1;
        if (gravityDirection !== this.gravityDirection) {
            return false;
        }

        var playerVelocityY = player.body
            ? player.body.linearVelocity.y
            : (player.velocityY || 0);
        var movingWithGravity = playerVelocityY * gravityDirection < 30;
        var slimeBounds = this.getColliderWorldBounds(this.collider);
        var playerBounds = this.getColliderWorldBounds(playerCollider);

        if (!movingWithGravity || !slimeBounds || !playerBounds) {
            return false;
        }

        var overlapsX = playerBounds.xMax > slimeBounds.xMin + 5 &&
            playerBounds.xMin < slimeBounds.xMax - 5;

        if (this.gravityDirection > 0) {
            return overlapsX &&
                playerBounds.yMin >= slimeBounds.yMax - this.stompPositionTolerance;
        }

        return overlapsX &&
            playerBounds.yMax <= slimeBounds.yMin + this.stompPositionTolerance;
    },

    syncGravityScale: function () {
        if (!this.body || this.dead) {
            return;
        }

        var gravityY = cc.director.getPhysicsManager().gravity.y;
        var worldGravityDirection = gravityY > 0 ? -1 : 1;
        this.body.gravityScale = this.gravityDirection / worldGravityDirection;
    },

    receiveBombExplosion: function () {
        if (this.dead) {
            return;
        }

        this.flatten(null, false);
    },

    flatten: function (player, shouldBouncePlayer) {
        this.dead = true;
        this.stopHorizontalMovement();
        this.hideAttackFlatVisual();

        if (this.sprite && this.flatFrame) {
            this.sprite.spriteFrame = this.flatFrame;
        }

        if (this.collider) {
            this.collider.enabled = false;
        }

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.gravityScale = 0;
            this.body.type = cc.RigidBodyType.Static;
        }

        if (player && shouldBouncePlayer !== false) {
            this.bouncePlayer(player);
        }

        if (this.removeAfterDeath) {
            this.deathTimer = Math.max(this.flatDuration, 0);
        }
    },

    updateDeath: function (dt) {
        if (!this.removeAfterDeath) {
            return;
        }

        this.deathTimer -= dt;
        if (!this.deathFalling) {
            if (this.deathTimer <= 0) {
                this.startDeathFall();
            }
            return;
        }

        this.node.y -= Math.abs(this.deathFallSpeed) * dt;

        if (this.deathTimer <= 0 && cc.isValid(this.node)) {
            this.node.destroy();
        }
    },

    startDeathFall: function () {
        this.deathFalling = true;
        this.deathTimer = Math.max(this.deathFallDuration, 0.1);

        if (this.body) {
            this.body.enabled = false;
        }
    },

    bouncePlayer: function (player) {
        var gravityDirection = player.gravityDirection || 1;

        if (player.body) {
            var velocity = player.body.linearVelocity;
            velocity.y = this.stompBounceSpeed * gravityDirection;
            player.body.linearVelocity = velocity;
            player.body.awake = true;
            return;
        }

        if (typeof player.velocityY === 'number') {
            player.velocityY = this.stompBounceSpeed;
        }
    },

    damagePlayer: function (player) {
        this.damageTimer = this.damageCooldown;

        if (player.receiveBombHit) {
            player.receiveBombHit();
        }
        cc.director.emit('player-life-lost');

        if (player.body) {
            var velocity = player.body.linearVelocity;
            var direction = player.node.x < this.node.x ? -1 : 1;
            var gravityDirection = player.gravityDirection || 1;
            velocity.x = direction * this.playerKnockbackX;
            velocity.y = this.playerKnockbackY * gravityDirection;
            player.body.linearVelocity = velocity;
            player.body.awake = true;
        }
    },

    isPlayerInDetectionRange: function () {
        if (!this.player || !cc.isValid(this.player.node)) {
            return false;
        }

        return Math.abs(this.player.node.x - this.node.x) <= this.detectionRange &&
            Math.abs(this.player.node.y - this.node.y) <= this.detectionHeight;
    },

    findPlayerInScene: function () {
        return this.findPlayerControllerInChildren(cc.director.getScene());
    },

    findPlayerControllerInChildren: function (node) {
        if (!node) {
            return null;
        }

        var player = node.getComponent('PinkMonsterPhysicsController') ||
            node.getComponent('PinkMonsterController');
        if (player && player.enabled) {
            return player;
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            player = this.findPlayerControllerInChildren(node.children[i]);
            if (player) {
                return player;
            }
        }

        return null;
    },

    findPlayerController: function (node) {
        while (node && node.parent) {
            var player = node.getComponent('PinkMonsterPhysicsController') ||
                node.getComponent('PinkMonsterController');
            if (player && player.enabled) {
                return player;
            }
            node = node.parent;
        }
        return null;
    },

    getColliderWorldBounds: function (collider) {
        if (!collider || !collider.node) {
            return null;
        }

        var offset = collider.offset || cc.v2();
        var size = collider.size || collider.node.getContentSize();
        var center = collider.node.convertToWorldSpaceAR(offset);
        var scaleX = Math.abs(collider.node.scaleX || 1);
        var scaleY = Math.abs(collider.node.scaleY || 1);
        var halfWidth = size.width * scaleX / 2;
        var halfHeight = size.height * scaleY / 2;

        return {
            xMin: center.x - halfWidth,
            xMax: center.x + halfWidth,
            yMin: center.y - halfHeight,
            yMax: center.y + halfHeight
        };
    },

    randomRange: function (min, max) {
        min = Number(min) || 0;
        max = Number(max) || min;
        return min + Math.random() * Math.max(max - min, 0);
    }
});
