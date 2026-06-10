/**
 * ThrownBomb.ts
 * Scene: Level2 and Level2-part2
 * Attach to: A bomb instance thrown by the player.
 * Controls launch physics, fuse animation, explosion frames, and area damage.
 */
import { AudioBroadcast } from "../Audio/AudioEvent";
var ThrownBomb = cc.Class({
    extends: cc.Component,

    properties: {
        fuseDuration: 1.5,
        blinkInterval: 0.2,
        explosionFps: 10,
        explosionScale: 0.3,
        explosionRadius: 150
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite);
        this.body = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsCollider);
        this.elapsed = 0;
        this.blinkTimer = 0;
        this.explosionTimer = 0;
        this.explosionFrameIndex = 0;
        this.originalScaleX = this.node.scaleX;
        this.originalScaleY = this.node.scaleY;
        this.launched = false;
        this.exploding = false;
        this.playerHit = false;
        this.normalFrame = null;
        this.activeFrame = null;
        this.explosionFrames = [];
    },

    launch: function (direction, normalFrame, activeFrame, explosionFrames, speedX, speedY) {
        this.launched = true;
        this.normalFrame = normalFrame;
        this.activeFrame = activeFrame;
        this.explosionFrames = explosionFrames || [];

        var physicsManager = cc.director.getPhysicsManager();
        physicsManager.enabled = true;
        if (physicsManager.gravity.y === 0) {
            physicsManager.gravity = cc.v2(0, -900);
        }

        var powerup = this.getComponent('BombPowerup');
        if (powerup) {
            powerup.enabled = false;
        }

        if (this.sprite && this.normalFrame) {
            this.sprite.spriteFrame = this.normalFrame;
        }

        if (this.collider) {
            this.collider.enabled = true;
            this.collider.sensor = false;
            this.collider.apply();
        }

        if (this.body) {
            this.body.type = cc.RigidBodyType.Dynamic;
            this.body.gravityScale = 1;
            this.body.fixedRotation = true;
            this.body.enabledContactListener = true;
            this.body.linearVelocity = cc.v2(direction * speedX, speedY);
            this.body.angularVelocity = 0;
            this.body.awake = true;
        }
    },

    update: function (dt) {
        if (!this.launched) {
            return;
        }

        if (this.exploding) {
            this.updateExplosion(dt);
            return;
        }

        this.elapsed += dt;
        this.blinkTimer += dt;

        if (this.blinkTimer >= this.blinkInterval) {
            this.blinkTimer %= this.blinkInterval;
            this.toggleFuseFrame();
        }

        if (this.elapsed >= this.fuseDuration) {
            this.explode();
        }
    },

    toggleFuseFrame: function () {
        if (!this.sprite || !this.normalFrame || !this.activeFrame) {
            return;
        }

        this.sprite.spriteFrame = this.sprite.spriteFrame === this.activeFrame
            ? this.normalFrame
            : this.activeFrame;
    },

    explode: function () {
        this.exploding = true;
        this.explosionTimer = 0;
        this.explosionFrameIndex = 0;
        this.node.scaleX = this.originalScaleX * this.explosionScale;
        this.node.scaleY = this.originalScaleY * this.explosionScale;
        AudioBroadcast.playEffect("bomb");
        this.hitPlayerInRange();
        this.hitExplosiveObjectsInRange();

        

        if (this.body) {
            this.body.linearVelocity = cc.v2();
            this.body.angularVelocity = 0;
            this.body.type = cc.RigidBodyType.Static;
        }

        if (this.collider) {
            this.collider.enabled = false;
        }

        if (!this.sprite || this.explosionFrames.length === 0) {
            this.node.destroy();
            return;
        }

        this.sprite.spriteFrame = this.explosionFrames[0];
    },

    hitPlayerInRange: function () {
        if (this.playerHit) {
            return;
        }

        var scene = cc.director.getScene();
        var bombWorldPosition = this.node.convertToWorldSpaceAR(cc.v2());
        var player = this.findPlayerInRange(scene, bombWorldPosition);

        if (player) {
            this.playerHit = true;
            player.receiveBombHit();
        }
    },

    findPlayerInRange: function (node, bombWorldPosition) {
        if (!node) {
            return null;
        }

        var player = node.getComponent('PinkMonsterPhysicsController') ||
            node.getComponent('PinkMonsterController');

        if (player && player.receiveBombHit) {
            var playerWorldPosition = node.convertToWorldSpaceAR(cc.v2());
            if (playerWorldPosition.sub(bombWorldPosition).mag() <= this.explosionRadius) {
                return player;
            }
        }

        for (var i = 0; i < node.childrenCount; i += 1) {
            player = this.findPlayerInRange(node.children[i], bombWorldPosition);
            if (player) {
                return player;
            }
        }

        return null;
    },

    hitExplosiveObjectsInRange: function () {
        var scene = cc.director.getScene();
        var bombWorldPosition = this.node.convertToWorldSpaceAR(cc.v2());
        this.notifyExplosiveObjects(scene, bombWorldPosition);
    },

    notifyExplosiveObjects: function (node, bombWorldPosition) {
        if (!node) {
            return;
        }

        var target = node.getComponent('ExplosivePlankBox') ||
            node.getComponent('SlimeController');
        if (target && target.receiveBombExplosion) {
            var targetWorldPosition = node.convertToWorldSpaceAR(cc.v2());
            if (targetWorldPosition.sub(bombWorldPosition).mag() <= this.explosionRadius) {
                target.receiveBombExplosion(bombWorldPosition);
            }
        }

        var children = node.children.slice();
        for (var i = 0; i < children.length; i += 1) {
            this.notifyExplosiveObjects(children[i], bombWorldPosition);
        }
    },

    updateExplosion: function (dt) {
        this.explosionTimer += dt;
        var frameDuration = 1 / Math.max(this.explosionFps, 1);

        while (this.explosionTimer >= frameDuration) {
            this.explosionTimer -= frameDuration;
            this.explosionFrameIndex += 1;

            if (this.explosionFrameIndex >= this.explosionFrames.length) {
                this.node.destroy();
                return;
            }

            this.sprite.spriteFrame = this.explosionFrames[this.explosionFrameIndex];
        }
    }
});

module.exports = ThrownBomb;
