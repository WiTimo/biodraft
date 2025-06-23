// js/init/verletBuilder.js

import * as THREE from 'three';

export function buildVerlet(Apts, Bpts, initialClothHeight, separationY, globalIdx) {
  const verletVertices = [];
  const verletSprings  = [];
  const allPts = Apts.concat(Bpts);

  const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
  const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI);

  allPts.forEach((p, i) => {
    const yOff = initialClothHeight + (i < Apts.length ? -separationY : +separationY);
    const pos = new THREE.Vector3(p.x, yOff, p.y);
    if (i >= Apts.length) pos.applyQuaternion(quatY);
    pos.applyQuaternion(quatX);

    verletVertices.push({
      id:        i,
      position:  pos,
      isFixed:   0,
      springIds: []
    });
  });

  function addSpring(i0, i1) {
    const v0 = verletVertices[i0], v1 = verletVertices[i1];
    if (v0.springIds.some(sid => {
      const s = verletSprings[sid];
      return (s.v0 === i0 && s.v1 === i1) || (s.v0 === i1 && s.v1 === i0);
    })) return;
    const sid = verletSprings.length;
    verletSprings.push({ v0: i0, v1: i1 });
    v0.springIds.push(sid);
    v1.springIds.push(sid);
  }

  for (let t = 0; t < globalIdx.length; t += 3) {
    addSpring(globalIdx[t],   globalIdx[t+1]);
    addSpring(globalIdx[t+1], globalIdx[t+2]);
    addSpring(globalIdx[t+2], globalIdx[t]);
  }

  return { verletVertices, verletSprings, addSpring };
}
