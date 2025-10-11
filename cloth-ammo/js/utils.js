import * as THREE from 'three';

export function pointInPolygon(px, py, verts) {
  let inside = false, n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * ((py - yi) / (yj - yi)) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInAnyPolygon(x, y, polys) {
  for (let poly of polys) {
    if (pointInPolygon(x, y, poly)) return true;
  }
  return false;
}

export function mergeSeamsTopologically(verletVertices, verletSprings, triangleIndices, seamPairs) {
  const totalClothVertexCount = verletVertices.length;

  // STEP 0: Store original rest lengths before merge
  const originalRestLengths = new Float32Array(verletSprings.length);
  verletSprings.forEach((spring, springIndex) => {
    const vertexA = verletVertices[spring.v0];
    const vertexB = verletVertices[spring.v1];
    originalRestLengths[springIndex] = vertexA.position.distanceTo(vertexB.position);
  });

  // STEP 1: Track which cloth vertices merge at seams
  const clothVertexMergeDestination = new Uint32Array(totalClothVertexCount);
  for (let clothVertexIndex = 0; clothVertexIndex < totalClothVertexCount; clothVertexIndex++) {
    clothVertexMergeDestination[clothVertexIndex] = clothVertexIndex;
  }
  
  const findFinalMergedClothVertex = (startClothVertex) => {
    if (clothVertexMergeDestination[startClothVertex] === startClothVertex) return startClothVertex;
    clothVertexMergeDestination[startClothVertex] = findFinalMergedClothVertex(clothVertexMergeDestination[startClothVertex]);
    return clothVertexMergeDestination[startClothVertex];
  };
  
  const mergeClothVerticesAtSeam = (seamFirstVertex, seamSecondVertex) => {
    const firstMergeDestination = findFinalMergedClothVertex(seamFirstVertex);
    const secondMergeDestination = findFinalMergedClothVertex(seamSecondVertex);
    if (firstMergeDestination !== secondMergeDestination) {
      clothVertexMergeDestination[Math.max(firstMergeDestination, secondMergeDestination)] = 
        Math.min(firstMergeDestination, secondMergeDestination);
    }
  };
  
  for (const [seamFirstVertex, seamSecondVertex] of seamPairs) {
    mergeClothVerticesAtSeam(seamFirstVertex, seamSecondVertex);
  }

  // STEP 2: Create new indices for merged vertices
  const mergedClothVertexToFinalIndex = new Map();
  const originalClothVertexToFinalIndex = new Uint32Array(totalClothVertexCount);
  let nextMergedClothVertexIndex = 0;
  
  for (let originalClothVertex = 0; originalClothVertex < totalClothVertexCount; originalClothVertex++) {
    const mergedDestination = findFinalMergedClothVertex(originalClothVertex);
    let finalVertexIndex = mergedClothVertexToFinalIndex.get(mergedDestination);
    
    if (finalVertexIndex === undefined) {
      finalVertexIndex = nextMergedClothVertexIndex++;
      mergedClothVertexToFinalIndex.set(mergedDestination, finalVertexIndex);
    }
    
    originalClothVertexToFinalIndex[originalClothVertex] = finalVertexIndex;
  }

  // STEP 3: Group vertices by their final merged vertex
  const originalVerticesPerMergedVertex = Array.from({ length: nextMergedClothVertexIndex }, () => []);
  for (let originalClothVertex = 0; originalClothVertex < totalClothVertexCount; originalClothVertex++) {
    const finalMergedVertexIndex = originalClothVertexToFinalIndex[originalClothVertex];
    originalVerticesPerMergedVertex[finalMergedVertexIndex].push(originalClothVertex);
  }

  // STEP 4: Create GPU-compatible vertex group arrays
  const mergedVertexGroupStartOffsets = new Uint32Array(nextMergedClothVertexIndex);
  const vertexCountPerMergedGroup = new Uint32Array(nextMergedClothVertexIndex);
  const flattenedOriginalVertexList = new Uint32Array(totalClothVertexCount);
  let flattenedListWriteOffset = 0;
  
  for (let mergedVertexIndex = 0; mergedVertexIndex < nextMergedClothVertexIndex; mergedVertexIndex++) {
    const originalVerticesInGroup = originalVerticesPerMergedVertex[mergedVertexIndex];
    mergedVertexGroupStartOffsets[mergedVertexIndex] = flattenedListWriteOffset;
    vertexCountPerMergedGroup[mergedVertexIndex] = originalVerticesInGroup.length;
    
    for (let vertexInGroupIndex = 0; vertexInGroupIndex < originalVerticesInGroup.length; vertexInGroupIndex++) {
      flattenedOriginalVertexList[flattenedListWriteOffset++] = originalVerticesInGroup[vertexInGroupIndex];
    }
  }
  const finalOriginalVertexList = flattenedOriginalVertexList.slice(0, flattenedListWriteOffset);

  // STEP 5: Calculate merged vertex positions and properties
  const mergedVertexPositionSums = Array.from({ length: nextMergedClothVertexIndex }, () => new THREE.Vector3());
  const originalVertexCountPerMergedVertex = new Uint32Array(nextMergedClothVertexIndex);
  const mergedVertexIsPinned = new Uint8Array(nextMergedClothVertexIndex);
  
  for (let originalClothVertex = 0; originalClothVertex < totalClothVertexCount; originalClothVertex++) {
    const mergedVertexIndex = originalClothVertexToFinalIndex[originalClothVertex];
    mergedVertexPositionSums[mergedVertexIndex].add(verletVertices[originalClothVertex].position);
    originalVertexCountPerMergedVertex[mergedVertexIndex]++;
    if (verletVertices[originalClothVertex].isFixed) {
      mergedVertexIsPinned[mergedVertexIndex] = 1;
    }
  }

  const finalMergedClothVertices = Array.from({ length: nextMergedClothVertexIndex }, (_, mergedVertexIndex) => ({
    position: mergedVertexPositionSums[mergedVertexIndex].multiplyScalar(
      1 / Math.max(1, originalVertexCountPerMergedVertex[mergedVertexIndex])
    ),
    isFixed: !!mergedVertexIsPinned[mergedVertexIndex],
    springIds: []
  }));

  // STEP 6: Rebuild cloth springs between merged vertices
  const processedClothSpringConnections = new Set();
  const finalClothSpringList = [];
  const finalOriginalRestLengths = [];
  
  for (let originalSpringIndex = 0; originalSpringIndex < verletSprings.length; originalSpringIndex++) {
    const originalClothSpring = verletSprings[originalSpringIndex];
    let springStartVertex = originalClothVertexToFinalIndex[originalClothSpring.v0];
    let springEndVertex = originalClothVertexToFinalIndex[originalClothSpring.v1];
    
    if (springStartVertex === springEndVertex) continue;
    
    if (springStartVertex > springEndVertex) {
      [springStartVertex, springEndVertex] = [springEndVertex, springStartVertex];
    }
    
    const clothSpringConnectionKey = `${springStartVertex}-${springEndVertex}`;
    if (processedClothSpringConnections.has(clothSpringConnectionKey)) continue;
    
    const newClothSpringIndex = finalClothSpringList.length;
    finalClothSpringList.push({ v0: springStartVertex, v1: springEndVertex });
    
    // Preserve original rest length for this spring
    finalOriginalRestLengths.push(originalRestLengths[originalSpringIndex]);
    
    finalMergedClothVertices[springStartVertex].springIds.push(newClothSpringIndex);
    finalMergedClothVertices[springEndVertex].springIds.push(newClothSpringIndex);
    processedClothSpringConnections.add(clothSpringConnectionKey);
  }

  // STEP 7: Update cloth triangle indices
  const finalClothTriangleIndices = [];
  for (let triangleBaseIndex = 0; triangleBaseIndex < triangleIndices.length; triangleBaseIndex += 3) {
    const triangleFirstVertex = originalClothVertexToFinalIndex[triangleIndices[triangleBaseIndex + 0]];
    const triangleSecondVertex = originalClothVertexToFinalIndex[triangleIndices[triangleBaseIndex + 1]];
    const triangleThirdVertex = originalClothVertexToFinalIndex[triangleIndices[triangleBaseIndex + 2]];
    
    if (triangleFirstVertex === triangleSecondVertex || 
        triangleSecondVertex === triangleThirdVertex || 
        triangleThirdVertex === triangleFirstVertex) {
      continue;
    }
    
    finalClothTriangleIndices.push(triangleFirstVertex, triangleSecondVertex, triangleThirdVertex);
  }

  return { 
    newVertices: finalMergedClothVertices,
    newSprings: finalClothSpringList,
    newIdx: finalClothTriangleIndices,
    oldToNew: originalClothVertexToFinalIndex,
    groupStarts: mergedVertexGroupStartOffsets,
    groupCounts: vertexCountPerMergedGroup,
    members: finalOriginalVertexList,
    originalRestLengths: new Float32Array(finalOriginalRestLengths)
  };
}