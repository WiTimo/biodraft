import { useEffect, useRef, useState } from "react";
import { Canvas } from "./Canvas";
import { Toolbar } from "./UI/Toolbar";
import { ImageTransformPanel } from "./UI/ImageTransformPanel";
import { CANVAS_SIZE } from "../util/globals";
import { useCanvasState } from "./state/CanvasState";
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 10;

let animationFrameId: number | null = null;

export default function ZoomPanCanvas() {

    const containerRef = useRef<HTMLDivElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const { zoom, offset, setZoom, setOffset } = useCanvasState()
    const [lastPos, setLastPos] = useState<{ x: number, y: number } | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();

            const scaleBy = Math.exp(-e.deltaY * 0.001);
            const newZoom = Math.max(MIN_ZOOM, Math.min(zoom * scaleBy, MAX_ZOOM));

            const rect = containerRef.current!.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - offset.x) / zoom;
            const worldY = (mouseY - offset.y) / zoom;

            const newOffsetX = mouseX - worldX * newZoom;
            const newOffsetY = mouseY - worldY * newZoom;

            setZoom(newZoom);
            setOffset({ x: newOffsetX, y: newOffsetY });
        };

        let isDragging = false;
        let lastPos = { x: 0, y: 0 };

        const handleMouseDown = (e: MouseEvent) => {
            if (!isSpacePressed || e.button !== 0) return;
            isDragging = true;
            lastPos = { x: e.clientX, y: e.clientY };
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - lastPos.x;
            const dy = e.clientY - lastPos.y;
            setOffset({ x: offset.x + dx, y: offset.y + dy });
            lastPos = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            isDragging = false;
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [zoom, offset, isSpacePressed, isPanning]);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(true)
        };
        const up = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpacePressed(false);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 1) {
                setIsSpacePressed(true);
            }

            if (!(isSpacePressed || e.button === 1) || (e.button !== 0 && e.button !== 1)) return;

            setIsPanning(true);
            setLastPos({ x: e.clientX, y: e.clientY });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isPanning || !lastPos) return;
            const dx = e.clientX - lastPos.x;
            const dy = e.clientY - lastPos.y;
            setOffset({ x: offset.x + dx, y: offset.y + dy });
            setLastPos({ x: e.clientX, y: e.clientY });
        };

        const handleMouseUp = (e: MouseEvent) => {
            setIsPanning(false);
            setLastPos(null);
            if (e.button === 1) {
                setIsSpacePressed(false); // release fake space
            }
        };

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isPanning, lastPos, isSpacePressed]);


    return (
        <>
            {isSpacePressed && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        zIndex: 9999,
                        pointerEvents: 'all',
                        cursor: 'grabbing',
                    }}
                />
            )}

            <div
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: isPanning ? 'grabbing' : 'default',
                }}
            >
                <div
                    ref={containerRef}
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                        transformOrigin: '0 0',
                        width: '100%',
                        height: '100%',
                        overflow: 'visible',
                        position: 'absolute',
                        backgroundColor: '#f0f0f0',
                    }}
                >

                    <Canvas />
                </div>
            </div>
            <ImageTransformPanel />
            <Toolbar />
        </>
    );

}