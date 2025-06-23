// js/init/bvhBuffers.js

/**
 * Create GPU storageBuffers for triangle data and BVH nodes.
 *
 * @param {GPUDevice} device
 * @param {Float32Array} triData   – [ x0,y0,z0, x1,y1,z1, … ]
 * @param {Array} nodeData         – Array of { min:[x,y,z], max:[x,y,z], left, right, start, count }
 * @returns {{ triangleVertexBuffer: GPUBuffer, bvhNodeBuffer: GPUBuffer, nodeCount: number }}
 */
export function createBVHBuffers(device, triData, nodeData) {
  // Upload triangle vertex positions
  const triBuffer = device.createBuffer({
    size: triData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(triBuffer, 0, triData);

  // Pack Node structs (48 bytes each) into an ArrayBuffer
  const n = nodeData.length;
  const structSize = 48;
  const arrayBuf = new ArrayBuffer(n * structSize);
  const dv = new DataView(arrayBuf);

  nodeData.forEach((nd, i) => {
    const base = i * structSize;
    // min.xyz @ offset 0
    dv.setFloat32(base +  0, nd.min[0], true);
    dv.setFloat32(base +  4, nd.min[1], true);
    dv.setFloat32(base +  8, nd.min[2], true);
    // padding at 12
    // max.xyz @ offset 16
    dv.setFloat32(base + 16, nd.max[0], true);
    dv.setFloat32(base + 20, nd.max[1], true);
    dv.setFloat32(base + 24, nd.max[2], true);
    // padding at 28
    // left, right, start, count @ offsets 32,36,40,44
    dv.setUint32(base + 32, nd.left,  true);
    dv.setUint32(base + 36, nd.right, true);
    dv.setUint32(base + 40, nd.start, true);
    dv.setUint32(base + 44, nd.count, true);
  });

  // Upload BVH nodes buffer
  const nodeBuffer = device.createBuffer({
    size: arrayBuf.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(nodeBuffer, 0, arrayBuf);

  return {
    triangleVertexBuffer: triBuffer,
    bvhNodeBuffer:       nodeBuffer,
    nodeCount:           n
  };
}
