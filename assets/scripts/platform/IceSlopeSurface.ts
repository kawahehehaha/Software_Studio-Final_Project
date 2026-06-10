/**
 * IceSlopeSurface.ts
 * Scene: Level2-part2
 * Attach to: An icy slope or floor physics collider.
 * Exposes low-friction movement settings used by the player while on the surface.
 */
cc.Class({
    extends: cc.Component,

    properties: {
        acceleration: 430,
        friction: 45,
        turnBrake: 180,
        colliderFriction: 0
    },

    onLoad: function () {
        this.applyPhysicsFriction();
    },

    onEnable: function () {
        this.applyPhysicsFriction();
    },

    applyPhysicsFriction: function () {
        var colliders = this.node.getComponents(cc.PhysicsCollider);

        for (var i = 0; i < colliders.length; i += 1) {
            colliders[i].friction = this.colliderFriction;
            colliders[i].apply();
        }
    },

    getSurfaceSettings: function () {
        return {
            acceleration: this.acceleration,
            friction: this.friction,
            turnBrake: this.turnBrake
        };
    }
});
