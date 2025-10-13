import * as THREE from 'three';
import Delaunator from 'delaunator';
import { pointInPolygon } from './utils.js';
import { patternData } from './config.js';

export class ClothSimulation {
    constructor(params = {}) {
        this.verletVertices = [];
        this.verletSprings = [];
        this.seamDebugPairs = [];
        this.initialVertexPositions = [];
        this.globalIdx = null;
        // NEW: per-vertex UVs matching vertex order
        this.uvs = [];
        
        // Constants
        this.boundarySegments = 400;

        // Cloth scaling parameters (fallback to defaults if not provided)
        this.clothScale = Number.isFinite(params.clothScale) ? params.clothScale : 0.7; // original hardcoded 0.7
        this.clothWidthScale = Number.isFinite(params.clothWidthScale) ? params.clothWidthScale : 1.0;
        this.clothHeightScale = Number.isFinite(params.clothHeightScale) ? params.clothHeightScale : 1.0;
        
        // Unified transformation parameters - adjust these to position the cloth
        this.transformParams = {
            // Vertical positioning
            baseHeight: 0.12 + 0.1,
            separationY: 0.2,
            // Horizontal positioning (after rotation)
            centerOffset: 0.17, // Move both halves forward/backward to align with human center
            // Rotation angles (in radians)
            frontHalfRotationX: Math.PI / 2, // 90 degrees - rotate to vertical
            backHalfRotationX: Math.PI / 2,  // 90 degrees - rotate to vertical
            backHalfRotationZ: Math.PI,      // 180 degrees - flip back half
        };
    }

    computeHalves() {
        const ids0 = new Set(patternData.patterns[0].points.map(p => p.id));
        return patternData.patterns.map(pat => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pat.points.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            const base = Math.max(maxX - minX, maxY - minY);
            const uniform = this.clothScale / Math.max(1e-8, base);
            const norm = p => ({
                x: (p.x - cx) * uniform * this.clothWidthScale,
                y: (p.y - cy) * uniform * this.clothHeightScale
            });
            const shape = new THREE.Shape();
            const P0 = norm(pat.points[0]);
            shape.moveTo(P0.x, P0.y);
            for (let i = 1; i < pat.points.length; i++) {
                const A = pat.points[i - 1], B = pat.points[i];
                const nB = norm(B);
                const hasBez = (A.handleOut?.dx || A.handleOut?.dy) || (B.handleIn?.dx || B.handleIn?.dy);
                if (hasBez) {
                    const cp1 = norm({ x: A.x + (A.handleOut?.dx || 0), y: A.y + (A.handleOut?.dy || 0) });
                    const cp2 = norm({ x: B.x + (B.handleIn?.dx || 0), y: B.y + (B.handleIn?.dy || 0) });
                    shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, nB.x, nB.y);
                } else {
                    shape.lineTo(nB.x, nB.y);
                }
            }
            shape.lineTo(P0.x, P0.y);
            const boundary = shape.getSpacedPoints(this.boundarySegments);
            let bbMinX = Infinity, bbMaxX = -Infinity, bbMinY = Infinity, bbMaxY = -Infinity;
            boundary.forEach(v => {
                bbMinX = Math.min(bbMinX, v.x);
                bbMaxX = Math.max(bbMaxX, v.x);
                bbMinY = Math.min(bbMinY, v.y);
                bbMaxY = Math.max(bbMaxY, v.y);
            });
            const interior = [];
            for (let x = bbMinX; x <= bbMaxX; x += 0.015) {
                for (let y = bbMinY; y <= bbMaxY; y += 0.015) {
                    if (pointInPolygon(x, y, boundary)) interior.push({ x, y });
                }
            }
            const pts2D = boundary.concat(interior);
            const dela = Delaunator.from(pts2D.map(p => [p.x, p.y]));
            const idx = [];
            for (let i = 0; i < dela.triangles.length; i += 3) {
                const a = dela.triangles[i], b = dela.triangles[i + 1], c = dela.triangles[i + 2];
                const pa = pts2D[a], pb = pts2D[b], pc = pts2D[c];
                const mx = (pa.x + pb.x + pc.x) / 3, my = (pa.y + pb.y + pc.y) / 3;
                if (pointInPolygon(mx, my, boundary)) idx.push(a, b, c);
            }
            const invW = 1 / Math.max(1e-8, (bbMaxX - bbMinX));
            const invH = 1 / Math.max(1e-8, (bbMaxY - bbMinY));
            const uvs = pts2D.map(p => ({ u: (p.x - bbMinX) * invW, v: (p.y - bbMinY) * invH }));
            return { norm, boundary, pts2D, idx, original: pat.points, uvs };
        });
    }

    /**
     * Selects which vertices should be used for seam connections
     * This function can be modified to test different vertex selection strategies
     * 
     * @param {Array} frontBoundaryPath - Array of boundary vertex indices for front half
     * @param {Array} backBoundaryPath - Array of boundary vertex indices for back half
     * @param {number} frontHalfPointsLength - Number of points in front half (for offset calculation)
     * @returns {Array} Array of vertex pairs to connect with springs
     */
    selectSeamVertices(frontBoundaryPath, backBoundaryPath, frontHalfPointsLength) {
        const seamVertexPairs = [];
        
        // Current strategy: Connect corresponding vertices along the seam paths
        for (let seamIndex = 0; seamIndex < Math.max(frontBoundaryPath.length, backBoundaryPath.length); seamIndex++) {
            const frontVertexIndex = frontBoundaryPath[seamIndex];
            const backVertexIndex = backBoundaryPath[seamIndex] + frontHalfPointsLength;
            
            seamVertexPairs.push([frontVertexIndex, backVertexIndex]);
        }
        
        return seamVertexPairs;
    }

    /**
     * Sets up the Verlet physics system for cloth simulation
     * Creates vertices, springs, and connects the two cloth halves with seam springs
     * 
     * @param {Array} clothHalves - Array containing the two processed cloth pattern halves
     */
    setupVerlet(clothHalves) {
        // Extract the two cloth halves and their triangulated points
        const frontHalfPoints = clothHalves[0].pts2D;
        const backHalfPoints = clothHalves[1]?.pts2D || [];
        const allClothPoints = frontHalfPoints.concat(backHalfPoints);
        
        const frontUVs = clothHalves[0].uvs;
        const backUVs  = clothHalves[1]?.uvs || [];
        this.uvs = frontUVs.concat(backUVs).map(({ u, v }) => [u, v]);

        // Combine triangle indices from both halves, offsetting back half indices
        const combinedTriangleIndices = clothHalves[0].idx.concat(
            (clothHalves[1]?.idx || []).map(index => index + frontHalfPoints.length)
        );
        
        // Create rotation quaternions using unified parameters
        const rotateFrontX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.transformParams.frontHalfRotationX);
        const rotateBackX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.transformParams.backHalfRotationX);
        const rotateBackZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.transformParams.backHalfRotationZ);
        
        // Create Verlet vertices from the triangulated points
        this.verletVertices = allClothPoints.map((point, vertexIndex) => {
            // Position vertices with vertical separation between front and back halves
            const verticalOffset = this.transformParams.baseHeight + (vertexIndex < frontHalfPoints.length ? -this.transformParams.separationY : this.transformParams.separationY);
            const vertexPosition = new THREE.Vector3(point.x, verticalOffset, point.y);
            
            // Apply rotations to orient the cloth properly
            if (vertexIndex >= frontHalfPoints.length) {
                // Back half: apply Z rotation first, then X rotation
                vertexPosition.applyQuaternion(rotateBackZ);
                vertexPosition.applyQuaternion(rotateBackX);
            } else {
                // Front half: apply X rotation only
                vertexPosition.applyQuaternion(rotateFrontX);
            }
            
            // Apply center offset after all rotations (this is the correct place for positioning adjustments)
            vertexPosition.z += this.transformParams.centerOffset;
            
            return { 
                id: vertexIndex, 
                position: vertexPosition, 
                isFixed: 0, 
                springIds: [] 
            };
        });

        // Store initial positions for reset functionality
        this.initialVertexPositions = this.verletVertices.map(vertex => vertex.position.clone());

        // Initialize spring and seam tracking arrays
        this.verletSprings = [];
        this.seamDebugPairs = [];
        
        /**
         * Helper function to add a spring between two vertices
         * Prevents duplicate springs and maintains bidirectional spring tracking
         */
        const addSpringBetweenVertices = (vertexIndex1, vertexIndex2) => {
            const vertex1 = this.verletVertices[vertexIndex1];
            const vertex2 = this.verletVertices[vertexIndex2];
            
            // Check if spring already exists between these vertices
            for (const springId of vertex1.springIds) {
                const existingSpring = this.verletSprings[springId];
                if ((existingSpring.v0 === vertexIndex1 && existingSpring.v1 === vertexIndex2) || 
                    (existingSpring.v0 === vertexIndex2 && existingSpring.v1 === vertexIndex1)) {
                    return; // Spring already exists
                }
            }
            
            // Create new spring and track it in both vertices
            const newSpringId = this.verletSprings.length;
            this.verletSprings.push({ v0: vertexIndex1, v1: vertexIndex2 });
            vertex1.springIds.push(newSpringId);
            vertex2.springIds.push(newSpringId);
        };
        
        // Add structural springs from triangulation (creates the basic cloth mesh)
        for (let triangleIndex = 0; triangleIndex < combinedTriangleIndices.length; triangleIndex += 3) {
            const vertexA = combinedTriangleIndices[triangleIndex];
            const vertexB = combinedTriangleIndices[triangleIndex + 1];
            const vertexC = combinedTriangleIndices[triangleIndex + 2];
            
            addSpringBetweenVertices(vertexA, vertexB);
            addSpringBetweenVertices(vertexB, vertexC);
            addSpringBetweenVertices(vertexC, vertexA);
        }

        // Helper functions for seam connection
        /**
         * Finds the closest boundary vertex index for a given pattern point ID
         */
        const findClosestBoundaryVertex = (patternPointId, clothHalf) => {
            const originalPoint = clothHalf.original.find(point => point.id === patternPointId);
            const normalizedPoint = clothHalf.norm(originalPoint);
            
            let closestIndex = 0;
            let closestDistance = Infinity;
            
            clothHalf.boundary.forEach((boundaryVertex, boundaryIndex) => {
                const distanceSquared = (boundaryVertex.x - normalizedPoint.x) ** 2 + 
                                     (boundaryVertex.y - normalizedPoint.y) ** 2;
                if (distanceSquared < closestDistance) {
                    closestDistance = distanceSquared;
                    closestIndex = boundaryIndex;
                }
            });
            
            return closestIndex;
        };
        
        /**
         * Gets the shortest sequence of boundary indices between two points
         */
        const getShortestBoundaryPath = (startIndex, endIndex, boundaryLength) => {
            const forwardPath = [];
            const backwardPath = [];
            
            // Build forward path
            let currentIndex = startIndex;
            do {
                forwardPath.push(currentIndex);
                currentIndex = (currentIndex + 1) % boundaryLength;
            } while (currentIndex !== (endIndex + 1) % boundaryLength);
            
            // Build backward path
            currentIndex = startIndex;
            do {
                backwardPath.push(currentIndex);
                currentIndex = (currentIndex - 1 + boundaryLength) % boundaryLength;
            } while (currentIndex !== (endIndex - 1 + boundaryLength) % boundaryLength);
            
            // Return the shorter path
            return forwardPath.length <= backwardPath.length ? forwardPath : backwardPath;
        };
        
        // Create seam springs to connect the two cloth halves
        const frontHalfPointIds = new Set(clothHalves[0].original.map(point => point.id));
        
        for (const seamConnection of patternData.seams) {
            const [frontSeamPair, backSeamPair] = seamConnection;
            
            // Determine which pair belongs to which half
            const frontHalfSeam = frontHalfPointIds.has(frontSeamPair[0]) ? frontSeamPair : backSeamPair;
            const backHalfSeam = frontHalfPointIds.has(frontSeamPair[0]) ? backSeamPair : frontSeamPair;
            
            // Get boundary paths for both seam edges
            let frontBoundaryPath = getShortestBoundaryPath(
                findClosestBoundaryVertex(frontHalfSeam[0], clothHalves[0]),
                findClosestBoundaryVertex(frontHalfSeam[1], clothHalves[0]),
                clothHalves[0].boundary.length
            );
            
            let backBoundaryPath = getShortestBoundaryPath(
                findClosestBoundaryVertex(backHalfSeam[0], clothHalves[1]),
                findClosestBoundaryVertex(backHalfSeam[1], clothHalves[1]),
                clothHalves[1].boundary.length
            );
            
            // Resample paths to have equal length for proper seam connection
            const maxPathLength = Math.max(frontBoundaryPath.length, backBoundaryPath.length);
            
            const resamplePath = (path, targetLength) => 
                Array.from({ length: targetLength }, (_, index) => 
                    path[Math.floor(index * path.length / targetLength)]
                );
            
            if (frontBoundaryPath.length !== maxPathLength) {
                frontBoundaryPath = resamplePath(frontBoundaryPath, maxPathLength);
            }
            if (backBoundaryPath.length !== maxPathLength) {
                backBoundaryPath = resamplePath(backBoundaryPath, maxPathLength);
            }
            
            // Create seam springs between corresponding boundary vertices
            const seamVertexPairs = this.selectSeamVertices(frontBoundaryPath, backBoundaryPath, frontHalfPoints.length);
            for (const [frontVertexIndex, backVertexIndex] of seamVertexPairs) {
                addSpringBetweenVertices(frontVertexIndex, backVertexIndex);
                this.seamDebugPairs.push([frontVertexIndex, backVertexIndex]);
            }
        }

        // Store the combined triangle indices for rendering
        this.globalIdx = combinedTriangleIndices;
    }

    initialize() {
        const halves = this.computeHalves();
        this.setupVerlet(halves);
        
        return {
            verletVertices: this.verletVertices,
            verletSprings: this.verletSprings,
            seamDebugPairs: this.seamDebugPairs,
            globalIdx: this.globalIdx,
            initialVertexPositions: this.initialVertexPositions,
            uvs: this.uvs
        };
    }
} 