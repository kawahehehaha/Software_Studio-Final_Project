/**
 * ExplosivePlankBox.ts
 * Scene: Level2 and Level2-part2
 * Attach to: A wooden box or plank that can be destroyed by a bomb.
 * Handles bomb damage feedback, debris creation, and removal of the broken object.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        intactFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        damagedFrame: {
            default: null,
            type: cc.SpriteFrame
        },
        blinkCount: 2,
        blinkInterval: 0.1,
        debrisCount: 4,
        debrisScale: 0.45,
        debrisSpeedX: 150,
        debrisSpeedY: 190,
        debrisLifetime: 3,
        debrisFadeDuration: 0.4
    },

    onLoad: function () {
        this.sprite = this.getComponent(cc.Sprite) || this.node.addComponent(cc.Sprite);
        this.body = this.getComponent(cc.RigidBody);
        this.collider = this.getComponent(cc.PhysicsBoxCollider);
        this.damageStage = 0;
        this.isBreaking = false;
        this.blinkToken = 0;

        if (this.intactFrame) {
            this.sprite.spriteFrame = this.intactFrame;
        }

        if (this.body) {
            this.body.type = cc.RigidBodyType.Static;
            this.body.enabledContactListener = true;
        }
    },

    receiveBombExplosion: function (bombWorldPosition) {
        if (this.isBreaking) {
            return;
        }

        // 同步給對方（僅限本地觸發，不再迴傳）
        if (!this._fromNetwork) {
            var nm = window['NM'];
            if (nm && nm.room) {
                var selfPos = this.node.convertToWorldSpaceAR(cc.v2());
                nm.room.send('box_hit', {
                    x: selfPos.x, y: selfPos.y,
                    bx: bombWorldPosition.x, by: bombWorldPosition.y
                });
                cc.log('[ExplosivePlankBox] sent box_hit x=' + selfPos.x.toFixed(0) + ' y=' + selfPos.y.toFixed(0));
            }
        }

        if (this.damageStage === 0) {
            this.damageStage = 1;
            if (this.sprite && this.damagedFrame) {
                this.sprite.spriteFrame = this.damagedFrame;
            }
            this.playDamageBlink();
            return;
        }

        this.breakApart(bombWorldPosition);
    },

    playDamageBlink: function () {
        this.blinkToken += 1;
        var token = this.blinkToken;
        var totalSteps = Math.max(this.blinkCount, 1) * 2;
        var step = 0;

        var advance = function () {
            if (!cc.isValid(this.node) || token !== this.blinkToken) {
                return;
            }

            step += 1;
            this.node.opacity = step % 2 === 1 ? 70 : 255;

            if (step < totalSteps) {
                this.scheduleOnce(advance, this.blinkInterval);
                return;
            }

            this.node.opacity = 255;
        }.bind(this);

        advance();
    },

    breakApart: function (bombWorldPosition) {
        this.isBreaking = true;
        this.blinkToken += 1;
        this.unscheduleAllCallbacks();

        var parent = this.node.parent;
        if (!parent) {
            this.node.destroy();
            return;
        }

        var boxWorldPosition = this.node.convertToWorldSpaceAR(cc.v2());
        var awayX = boxWorldPosition.x >= bombWorldPosition.x ? 1 : -1;

        for (var i = 0; i < Math.max(this.debrisCount, 1); i += 1) {
            this.spawnDebris(parent, boxWorldPosition, awayX, i);
        }

        this.node.destroy();
    },

    spawnDebris: function (parent, worldPosition, awayX, index) {
        var debris = new cc.Node('Plank Debris ' + (index + 1));
        var sprite = debris.addComponent(cc.Sprite);
        sprite.spriteFrame = this.damagedFrame || this.intactFrame;
        debris.setScale(this.debrisScale);
        debris.angle = (index - 1.5) * 18;
        parent.addChild(debris);
        debris.setPosition(parent.convertToNodeSpaceAR(worldPosition));

        var body = debris.addComponent(cc.RigidBody);
        body.type = cc.RigidBodyType.Dynamic;
        body.gravityScale = 1;
        body.fixedRotation = false;
        body.enabledContactListener = false;
        body.linearDamping = 0.15;
        body.angularDamping = 0.2;

        var collider = debris.addComponent(cc.PhysicsBoxCollider);
        collider.size = cc.size(42, 18);
        collider.friction = 0.65;
        collider.restitution = 0.15;
        collider.apply();

        var spread = index - (Math.max(this.debrisCount, 1) - 1) / 2;
        var gravityY = cc.director.getPhysicsManager().gravity.y;
        var againstGravity = gravityY > 0 ? -1 : 1;
        body.linearVelocity = cc.v2(
            awayX * this.debrisSpeedX + spread * 55,
            againstGravity * (this.debrisSpeedY + Math.abs(spread) * 25)
        );
        body.angularVelocity = spread * 110 + awayX * 80;
        body.awake = true;

        debris.runAction(cc.sequence(
            cc.delayTime(Math.max(this.debrisLifetime - this.debrisFadeDuration, 0)),
            cc.fadeOut(this.debrisFadeDuration),
            cc.removeSelf()
        ));
    }
});
