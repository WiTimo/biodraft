// src/UI/ThreeDView.tsx

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ThreeDView() {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        // ── Scene / Camera / Renderer ─────────────────────────
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        // start with container’s current size
        const setSize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        setSize();
        container.appendChild(renderer.domElement);

        // ── Simple rotating cube ──────────────────────────────
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshNormalMaterial();
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        let frameId: number;
        const animate = () => {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
            frameId = requestAnimationFrame(animate);
        };
        animate();

        // ── WATCH FOR CONTAINER RESIZE ────────────────────────
        const resizeObserver = new ResizeObserver(() => {
            setSize();
        });
        resizeObserver.observe(container);

        // ── CLEANUP ────────────────────────────────────────────
        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    return (
        <div
            ref={mountRef}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
            }}
        />
    );
}
