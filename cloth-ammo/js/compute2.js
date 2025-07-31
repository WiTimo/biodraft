import {
    atomicStore, Fn, If, Return, instancedArray, instanceIndex,
    uniform, select, uint, Loop,
    float, triNoise3D, time, clamp, vec3, array, max, attribute
} from 'three/tsl';

export let
    stiffnessUniform,
    dampingUniform,
    seamTightnessUniform,
    collisionStrengthUniform,
    gravityUniform,
    vertexPositionBuffer,
    vertexForceBuffer,
    vertexParamsBuffer,
    springListBuffer,
    springVertexIdBuffer,
    springRestLengthBuffer,
    springForceBuffer,
    springSeamFlagBuffer,
    computeSpringForces,
    computeVertexForces,
    colliderPositionBuffer,
    colliderIndexBuffer,
    computeCollision,
    colliderIndexCountUniform,
    clearCollisionBuffers,
    collisionDepthBuffer,
    collisionProjBuffer;

export function setupUniforms(params) {
    stiffnessUniform = uniform(params.stiffness);
    dampingUniform = uniform(0.98);
    seamTightnessUniform = uniform(0.0);
    collisionStrengthUniform = uniform(params.collisionStrength || 0.8);
    gravityUniform = uniform(0.0);
}

export function setupBuffers(verletVertices, verletSprings, seamDebugPairs) {
    console.log('setupBuffers called with:', {
        verletVerticesLength: verletVertices?.length,
        verletSpringsLength: verletSprings?.length,
        seamDebugPairsLength: seamDebugPairs?.length
    });

    const vertexCount = verletVertices.length;
    const springCount = verletSprings.length;

    const vertexPositions = new Float32Array(vertexCount * 3);  // x,y,z for each vertex
    const vertexParameters = new Uint32Array(vertexCount * 3);   // [isFixed, springCount, springListOffset] for each vertex
    const allSpringIdsForVertices = [];  // Flattened list of all spring IDs connected to each vertex

    verletVertices.forEach((vertex, vertexIndex) => {
        // Store vertex position (x, y, z coordinates)
        const positionOffset = vertexIndex * 3;
        vertexPositions.set([vertex.position.x, vertex.position.y, vertex.position.z], positionOffset);

        // Store vertex parameters: [isFixed, numberOfConnectedSprings, offsetIntoSpringList]
        const parameterOffset = vertexIndex * 3;
        vertexParameters.set([
            vertex.isFixed,                    // 0 = free vertex, 1 = pinned vertex
            vertex.springIds.length,           // How many springs connect to this vertex
            allSpringIdsForVertices.length     // Where this vertex's springs start in the spring list
        ], parameterOffset);

        // Add all spring IDs connected to this vertex to the flattened list
        vertex.springIds.forEach(springId => allSpringIdsForVertices.push(springId));
    });

    // ===== CREATE GPU BUFFERS FOR VERTEX DATA =====
    console.log('Creating vertexPositionBuffer with', vertexPositions.length, 'elements');
    vertexPositionBuffer = instancedArray(vertexPositions, 'vec3').setPBO(true);  // GPU can write back to this
    console.log('vertexPositionBuffer created:', vertexPositionBuffer);
    vertexForceBuffer = instancedArray(vertexCount, 'vec3');                       // Forces applied to each vertex
    vertexParamsBuffer = instancedArray(vertexParameters, 'uvec3');                // Vertex metadata
    springListBuffer = instancedArray(new Uint32Array(allSpringIdsForVertices), 'uint').setPBO(true);  // Which springs connect to each vertex

    // ===== SPRING DATA PREPARATION =====
    // Create arrays to hold spring data for GPU transfer
    const springVertexPairs = new Uint32Array(springCount * 2);  // [vertexA, vertexB] for each spring
    const springRestLengths = new Float32Array(springCount);     // Target length for each spring

    // Process each spring and prepare its data
    verletSprings.forEach((spring, springIndex) => {
        // Store which two vertices this spring connects
        const pairOffset = springIndex * 2;
        springVertexPairs[pairOffset] = spring.v0;     // First vertex ID
        springVertexPairs[pairOffset + 1] = spring.v1; // Second vertex ID

        // Calculate the initial distance between vertices (rest length)
        const vertexA = verletVertices[spring.v0];
        const vertexB = verletVertices[spring.v1];
        const initialDistance = vertexA.position.distanceTo(vertexB.position);
        springRestLengths[springIndex] = initialDistance;
    });

    // ===== CREATE GPU BUFFERS FOR SPRING DATA =====
    springVertexIdBuffer = instancedArray(springVertexPairs, 'uvec2').setPBO(true);  // Which vertices each spring connects
    springRestLengthBuffer = instancedArray(springRestLengths, 'float');              // Target lengths for springs
    springForceBuffer = instancedArray(springCount * 3, 'vec3').setPBO(true);       // Calculated forces for each spring

    // ===== MARK SEAM SPRINGS =====
    // Create array to mark which springs are seam springs
    const seamSpringFlags = new Uint32Array(springCount);  // 1 = seam spring, 0 = regular spring

    // Function to mark seam springs using robust findIndex approach
    function markSeamSprings(verletSprings, seamDebugPairs, seamSpringFlags) {
        seamDebugPairs.forEach(([i0, i1]) => {
            const sid = verletSprings.findIndex(s =>
                (s.v0 === i0 && s.v1 === i1) || (s.v0 === i1 && s.v1 === i0)
            );
            if (sid >= 0) seamSpringFlags[sid] = 1;
        });
    }

    // Mark seam springs using the robust function
    markSeamSprings(verletSprings, seamDebugPairs, seamSpringFlags);
    springSeamFlagBuffer = instancedArray(seamSpringFlags, 'uint');

    // ===== CREATE COLLISION DETECTION BUFFERS =====
    // Buffer to store how deep each vertex penetrates into colliders
    collisionDepthBuffer = instancedArray(new Float32Array(vertexCount), 'float').setPBO(true);

    // Buffer to store the projected collision points for each vertex
    collisionProjBuffer = instancedArray(new Float32Array(vertexCount * 3), 'vec3').setPBO(true);
}

export function setupColliderBuffers({ positions, indices }) {
    colliderPositionBuffer = instancedArray(positions, 'vec3').setPBO(true);
    if (!(indices instanceof Uint32Array)) indices = new Uint32Array(indices);
    colliderIndexBuffer = instancedArray(indices, 'uint').setPBO(true);
    colliderIndexCountUniform = uniform(indices.length);
}

export function setupComputeShaders(verletVertices, verletSprings) {
    const vCount = verletVertices.length;
    const sCount = verletSprings.length;
    const EPS = float(1e-6);

    computeSpringForces = Fn(() => {
        const springIndex = instanceIndex;
        const vertexPair = springVertexIdBuffer.element(springIndex);
        const posA = vertexPositionBuffer.element(vertexPair.x);
        const posB = vertexPositionBuffer.element(vertexPair.y);
        const directionVec = posB.sub(posA).toVar('directionVec');
        const currentLength = directionVec.length().max(EPS).toVar('currentLength');

        const restLenBase = springRestLengthBuffer.element(springIndex);
        const isSeamSpring = springSeamFlagBuffer.element(springIndex).equal(uint(1));

        // Only apply seam tightness to seam springs, regular springs maintain original length
        const targetRestLength = select(
            isSeamSpring,
            // Seam springs: contract based on seam tightness
            restLenBase.mul(float(1).sub(seamTightnessUniform)).max(EPS),
            // Regular springs: maintain original rest length
            restLenBase
        );

        const displacement = currentLength.sub(targetRestLength).toVar('displacement');
        const shouldApplyForce = displacement.abs().greaterThan(EPS);

        If(shouldApplyForce, () => {
            const forceVec = directionVec
                .mul(displacement)
                .mul(stiffnessUniform)
                .mul(float(0.5))
                .div(currentLength)
                .toVar('forceVec');

            springForceBuffer.element(springIndex).assign(forceVec);
        }).Else(() => {
            springForceBuffer.element(springIndex).assign(vec3(0));
        });
    })().compute(sCount);

    // Simplified collision detection using Ammo.js optimized approach
    computeCollision = Fn(() => {
        const vertexId = instanceIndex;
        const vertexPosition = vertexPositionBuffer.element(vertexId);

        collisionDepthBuffer.element(vertexId).assign(float(0));
        collisionProjBuffer.element(vertexId).assign(vec3(0));

        let maxPenetrationDepth = float(0).toVar('maxPenetrationDepth');
        let projectedCollisionPoint = vec3(0).toVar('projectedCollisionPoint');
        const MIN_PLANE_DIST = float(-0.05);
        const triangleCount = colliderIndexCountUniform.div(uint(3));

        // Use Ammo.js optimized collision detection approach
        // Instead of complex BVH traversal, we'll use a simpler but still efficient approach
        Loop({ start: uint(0), end: triangleCount, type: 'uint', condition: '<' }, ({ i: triangleIndex }) => {
            const baseIndex = triangleIndex.mul(uint(3));
            const indexA = colliderIndexBuffer.element(baseIndex);
            const indexB = colliderIndexBuffer.element(baseIndex.add(1));
            const indexC = colliderIndexBuffer.element(baseIndex.add(2));

            const pointA = colliderPositionBuffer.element(indexA);
            const pointB = colliderPositionBuffer.element(indexB);
            const pointC = colliderPositionBuffer.element(indexC);

            const edge1 = pointB.sub(pointA).toVar('edge1');
            const edge2 = pointC.sub(pointA).toVar('edge2');
            const triangleNormal = edge1.cross(edge2).normalize().toVar('triangleNormal');

            const vertexToA = vertexPosition.sub(pointA).toVar('vertexToA');
            const distanceToPlane = vertexToA.dot(triangleNormal).toVar('distanceToPlane');

            If(distanceToPlane.lessThan(float(0)).and(distanceToPlane.greaterThan(MIN_PLANE_DIST)), () => {
                const projectedPoint = vertexPosition.sub(triangleNormal.mul(distanceToPlane)).toVar('projectedPoint');

                const baryEdge0 = edge1;
                const baryEdge1 = edge2;
                const baryPoint = projectedPoint.sub(pointA);

                const d00 = baryEdge0.dot(baryEdge0);
                const d01 = baryEdge0.dot(baryEdge1);
                const d11 = baryEdge1.dot(baryEdge1);
                const d20 = baryPoint.dot(baryEdge0);
                const d21 = baryPoint.dot(baryEdge1);

                const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('denom');
                const baryV = d11.mul(d20).sub(d01.mul(d21)).div(denom).toVar('baryV');
                const baryW = d00.mul(d21).sub(d01.mul(d20)).div(denom).toVar('baryW');
                const baryU = float(1).sub(baryV).sub(baryW);

                If(baryU.greaterThanEqual(float(0))
                    .and(baryV.greaterThanEqual(float(0)))
                    .and(baryW.greaterThanEqual(float(0))
                        .and(baryU.add(baryV).add(baryW).lessThanEqual(float(1.01)))), () => {

                            const penetrationDepth = distanceToPlane.mul(float(-1)).toVar('penetrationDepth');
                            If(penetrationDepth.greaterThan(maxPenetrationDepth), () => {
                                maxPenetrationDepth.assign(penetrationDepth);
                                projectedCollisionPoint.assign(projectedPoint);
                            });
                        });
            });
        });

        If(maxPenetrationDepth.greaterThan(float(0)), () => {
            collisionDepthBuffer.element(vertexId).assign(maxPenetrationDepth);
            collisionProjBuffer.element(vertexId).assign(projectedCollisionPoint);
        });
    })().compute(vCount);

    clearCollisionBuffers = Fn(() => {
        const vid = instanceIndex;
        If(vid.greaterThanEqual(uint(vCount)), () => Return());

        collisionDepthBuffer.element(vid).assign(float(0));
        collisionProjBuffer.element(vid).assign(vec3(0));
    })().compute(vCount);

    computeVertexForces = Fn(() => {
        const vertexId = instanceIndex;
        If(vertexId.greaterThanEqual(uint(vCount)), () => Return());
        // Skip fixed vertices (pinned vertices don't move)
        If(vertexParamsBuffer.element(vertexId).x.greaterThan(uint(0)), () => Return());

        const currentPosition = vertexPositionBuffer.element(vertexId).toVar('currentPosition');
        let accumulatedForce = vertexForceBuffer.element(instanceIndex).toVar('accumulatedForce');

        // Calculate range of spring indices for this vertex
        const springListStartIndex = vertexParamsBuffer.element(vertexId).z;
        const springCount = vertexParamsBuffer.element(vertexId).y;
        const springListEndIndex = springListStartIndex.add(springCount);

        // Apply damping to accumulated force
        accumulatedForce.mulAssign(dampingUniform);

        // Sum up forces from all connected springs
        Loop({ start: springListStartIndex, end: springListEndIndex, type: 'uint', condition: '<' }, ({ i }) => {
            const springId = springListBuffer.element(i);
            const springForce = springForceBuffer.element(springId);
            const springVertexPair = springVertexIdBuffer.element(springId);

            // Determine force direction: positive if this vertex is first endpoint, negative if second
            const forceDirection = select(springVertexPair.x.equal(vertexId), 1.0, -1.0);
            accumulatedForce.addAssign(springForce.mul(forceDirection));
        });

        // Apply damping again for realistic cloth behavior
        accumulatedForce.mulAssign(dampingUniform);

        // Apply gravity
        accumulatedForce.y.subAssign(gravityUniform);

        // Handle collision response
        const penetrationDepth = collisionDepthBuffer.element(vertexId);
        const hasCollision = penetrationDepth.greaterThan(float(0));
        If(hasCollision, () => {
            // Move vertex to collision projection point
            const collisionProjection = collisionProjBuffer.element(vertexId);
            const collisionCorrectionStrength = collisionStrengthUniform;
            const collisionCorrectedPosition = currentPosition.add(
                collisionProjection.sub(currentPosition).mul(collisionCorrectionStrength)
            );

            vertexPositionBuffer.element(vertexId).assign(collisionCorrectedPosition);
            // Clear forces after collision correction to prevent re-penetration
            vertexForceBuffer.element(vertexId).assign(vec3(0));
        }).Else(() => {
            // Apply forces to get new position
            const newPosition = currentPosition.add(accumulatedForce);
            vertexPositionBuffer.element(vertexId).assign(newPosition);
            vertexForceBuffer.element(vertexId).assign(accumulatedForce);
        });
    })().compute(vCount);
}