// src/UI/ThreeDView.tsx

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ThreeDView() {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // capture the container once
        const container = mountRef.current;
        if (!container) return;

        // initial size
        const width = container.clientWidth;
        const height = container.clientHeight;

        // ── Scene / Camera / Renderer ─────────────────────────
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        // ── Simple cube ────────────────────────────────────────
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshNormalMaterial();
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // ── Animate ────────────────────────────────────────────
        let frameId: number;
        const animate = () => {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
            frameId = requestAnimationFrame(animate);
        };
        animate();

        // ── Handle window resize ──────────────────────────────
        const handleResize = () => {
            if (!container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        // ── Cleanup on unmount ─────────────────────────────────
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(frameId);
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
