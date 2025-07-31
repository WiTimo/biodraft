export class PhysicsManager {
    constructor() {
        this.physicsWorld = null;
        this.ammoManBody = null;
    }

    setupPhysicsWorld() {
        const cfg = new Ammo.btDefaultCollisionConfiguration();
        const disp = new Ammo.btCollisionDispatcher(cfg);
        const bp = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();
        this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(disp, bp, solver, cfg);
        this.physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));
    }

    getPhysicsWorld() {
        return this.physicsWorld;
    }

    setAmmoManBody(body) {
        this.ammoManBody = body;
    }

    getAmmoManBody() {
        return this.ammoManBody;
    }
} 