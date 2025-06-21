// File: js/gpu/collisionBuilder.js

let collisionPipeline      = null;
let collisionBG            = null;
let clothPositionBindGroup = null;

/**
 * Compile the collision‐BVH WGSL and set up both bind groups.
 *
 * @param {GPUDevice} device
 * @param {GPUBuffer} triangleVertexBuffer
 * @param {GPUBuffer} bvhNodeBuffer
 * @param {{ positionBuffer: GPUBufferBinding, countBuffer: GPUBuffer }} clothBuffers
 */
export async function initCollisionPipeline(
  device,
  triangleVertexBuffer,
  bvhNodeBuffer,
  clothBuffers
) {
  console.log("🔧 initCollisionPipeline(): clothBuffers =", clothBuffers);

  const { positionBuffer, countBuffer } = clothBuffers;

  // 1) Fetch WGSL
  const code = await fetch('./js/gpu/shaders/collision_bvh.wgsl')
    .then(r => r.text());

  // 2) Create compute pipeline
  collisionPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module:     device.createShaderModule({ code }),
      entryPoint: 'main'
    }
  });
  console.log("✅ collision compute pipeline created");

  // 3) BindGroup 0: mesh BVH data
  collisionBG = device.createBindGroup({
    layout: collisionPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: triangleVertexBuffer } },
      { binding: 1, resource: { buffer: bvhNodeBuffer         } }
    ]
  });
  console.log("✅ collision BG0 created");

  // 4) BindGroup 1: cloth positions + vertex count
  const layout1 = collisionPipeline.getBindGroupLayout(1);
  console.log(
    "🔧 initCollisionPipeline(): BG1 entries →",
    "positionBuffer=", positionBuffer,
    "countBuffer=",    countBuffer
  );
  clothPositionBindGroup = device.createBindGroup({
    layout: layout1,
    entries: [
      { binding: 0, resource: positionBuffer },
      { binding: 1, resource: { buffer: countBuffer } }
    ]
  });
  console.log("✅ collision BG1 created");
}

/**
 * Dispatch the collision pass.
 */
export function dispatchCollision(device, vertexCount) {
  console.log("🔧 dispatchCollision(): device, vertexCount =", device, vertexCount);

  if (!collisionPipeline || !collisionBG || !clothPositionBindGroup) {
    console.error('❌ collisionBuilder not initialized!');
    return;
  }

  const encoder = device.createCommandEncoder();
  const pass    = encoder.beginComputePass();

  pass.setPipeline(collisionPipeline);
  pass.setBindGroup(0, collisionBG);
  pass.setBindGroup(1, clothPositionBindGroup);

  // one workgroup per 64 vertices
  const groups = Math.ceil(vertexCount / 64);
  console.log(`🔧 dispatchCollision(): dispatchWorkgroups(${groups})`);
  pass.dispatchWorkgroups(groups);

  pass.end();
  device.queue.submit([encoder.finish()]);
  console.log("✅ dispatchCollision(): submitted");
}
