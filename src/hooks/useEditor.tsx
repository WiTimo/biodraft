import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { BezierPoint, Path } from "../types/bezier";
import { deepCopyPoints } from "../utils/points";
import { usePanZoom } from "./usePanZoom";
import { useHistory } from "./useHistory";
import { Mode } from "../components/Toolbar";
import { Link } from "../types/types";
import { samplePath } from "../utils/sampleBezier";

export default function useEditor() {
    // -- mode toggling --
    const [mode, setMode] = useState<Mode>("edit");

    // -- pan & zoom --
    const { stageRef, scale, position, setPosition, handleWheel } = usePanZoom();

    // -- path drawing state --
    const [paths, setPaths] = useState<Path[]>([]);
    const [currentPoints, setCurrentPoints] = useState<BezierPoint[]>([]);
    const { push, undo, redo } = useHistory(currentPoints);
    const [previewPoint, setPreviewPoint] = useState<BezierPoint | null>(null);
    const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

    // -- panning helpers --
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);

    // -- cursor in stage coords (for PreviewLayer) --
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    // -- state to track an active drag of an anchor or a handle --
    const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<{
        pointId: string;
        handle: "left" | "right";
    } | null>(null);

    const [linkCandidates, setLinkCandidates] = useState<string[]>([]);
    const [links, setLinks] = useState<Link[]>([]);

    const onSelectPoint = (id: string) => {
        setSelectedPointId(id);
    };

    // keyboard shortcuts & disable right‑click menu
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mac = navigator.platform.toUpperCase().includes("MAC");
            const ctrl = mac ? e.metaKey : e.ctrlKey;
            if (ctrl && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                undo(currentPoints, setCurrentPoints);
            }
            if (ctrl && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault();
                redo(currentPoints, setCurrentPoints);
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedPointId) {
                e.preventDefault();
                push(currentPoints);
                setCurrentPoints((pts) => pts.filter((p) => p.id !== selectedPointId));
                setSelectedPointId(null);
            }
        };
        const blockCtx = (e: MouseEvent) => e.preventDefault();
        window.addEventListener("keydown", onKey);
        window.addEventListener("contextmenu", blockCtx);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("contextmenu", blockCtx);
        };
    }, [currentPoints, selectedPointId]);

    const screenToStage = (evt: MouseEvent) => {
        const stageNode = stageRef.current!;
        const pointer = stageNode.getPointerPosition(); // Use Konva's built-in method
        return pointer ? { x: pointer.x, y: pointer.y } : null;
    };

    // ————— mouse event handlers for draw vs. select —————

    // ── mouse handlers ──
    const onMouseMove = (e: any) => {
        const evt = e.evt as MouseEvent;

        // Handle panning
        if (isPanning && lastPanPos) {
            const dx = evt.clientX - lastPanPos.x;
            const dy = evt.clientY - lastPanPos.y;
            setPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
            setLastPanPos({ x: evt.clientX, y: evt.clientY });
        }

        // Always track raw canvas coords
        const pointer = screenToStage(evt);
        if (pointer) {
            setMousePos(pointer);
        }

        // Update live preview in EDIT mode
        if (mode === "edit" && previewPoint && pointer) {
            const dx = pointer.x - previewPoint.x;
            const dy = pointer.y - previewPoint.y;
            setPreviewPoint({
                ...previewPoint,
                handleLeft: { x: previewPoint.x - dx, y: previewPoint.y - dy },
                handleRight: { x: previewPoint.x + dx, y: previewPoint.y + dy },
            });
        }
    };

    const onMouseDown = (e: any) => {
        const evt = e.evt as MouseEvent;
        if (evt.button === 2) return;
        const pointer = screenToStage(evt);

        // ==== LINK MODE HANDLING ====
        if (mode === "link") {
            const clickedId = e.target.id();
            console.log(clickedId)
            if (clickedId && paths.some(p => p.id === clickedId)) {
                setLinkCandidates(prev => {
                    const next = [...prev, clickedId];
                    if (next.length === 2) {
                        setLinks(links => [...links, { a: next[0], b: next[1] }]);
                        return [];
                    }
                    return next;
                });
            }
            return;  // stop here
        }

        if (pointer && mode === "edit") {
            const newPt: BezierPoint = {
                id: uuidv4(),
                x: pointer.x,
                y: pointer.y,
            };
            setPreviewPoint(newPt);
            setSelectedPointId(newPt.id);
            if (currentPoints.length === 0) {
                setCurrentPoints([newPt]);
            }
        }
    };

    const onMouseUp = (e: any) => {
        // finish panning
        if (isPanning) {
            setIsPanning(false);
            return;
        }
        // finish drawing segment
        if (mode === "edit" && previewPoint) {
            push(currentPoints);
            setCurrentPoints((pts) => [...pts, previewPoint]);
            setPreviewPoint(null);
        }
    };

    const onDblClick = () => {
        if (mode === "edit" && currentPoints.length > 1) {
            setPaths((all) => [
                ...all,
                { id: uuidv4(), points: currentPoints, closed: true },
            ]);
            setCurrentPoints([]);
        }
    };
    // ————— anchor & handle drag callbacks —————

    const onAnchorDragStart = (id: string) => {
        push(currentPoints);
        setDraggingAnchorId(id);
    };
    const onAnchorDragMove = (id: string, pos: { x: number; y: number }) => {
        setCurrentPoints((pts) =>
            pts.map((p) => {
                if (p.id !== id) return p;
                const dx = pos.x - p.x,
                    dy = pos.y - p.y;
                return {
                    ...p,
                    x: pos.x,
                    y: pos.y,
                    handleLeft: p.handleLeft
                        ? { x: p.handleLeft.x + dx, y: p.handleLeft.y + dy }
                        : undefined,
                    handleRight: p.handleRight
                        ? { x: p.handleRight.x + dx, y: p.handleRight.y + dy }
                        : undefined,
                };
            })
        );
    };
    const onAnchorDragEnd = () => setDraggingAnchorId(null);

    const onHandleDragStart = (
        pointId: string,
        handle: "left" | "right"
    ) => {
        push(currentPoints);
        setDraggingHandle({ pointId, handle });
    };
    const onHandleDragMove = (
        pointId: string,
        handle: "left" | "right",
        pos: { x: number; y: number },
        altKey: boolean
    ) => {
        setCurrentPoints((pts) =>
            pts.map((p) => {
                if (p.id !== pointId) return p;
                const key = handle === "left" ? "handleLeft" : "handleRight";
                const opp = handle === "left" ? "handleRight" : "handleLeft";
                const newH = { x: pos.x, y: pos.y };
                if (altKey || !p[opp]) {
                    return { ...p, [key]: newH } as BezierPoint;
                }
                const dx = newH.x - p.x,
                    dy = newH.y - p.y;
                return {
                    ...p,
                    [key]: newH,
                    [opp]: { x: p.x - dx, y: p.y - dy },
                } as BezierPoint;
            })
        );
    };
    const onHandleDragEnd = () => setDraggingHandle(null);

    // ----- updated exportJson -----
    const exportJson = () => {
        // 1) Gather paths: saved + in‑progress if it has at least 2 points
        const pathsToExport = [...paths];
        if (currentPoints.length > 1) {
            pathsToExport.push({
                id: "__in_progress__",      // or give it a real id
                points: currentPoints,
                closed: false,
            });
        }

        // 2) Sample each Bézier path every ~2px
        const sampled = pathsToExport.map((path) => ({
            id: path.id,
            points: samplePath(path, 1),
        }));

        // 3) Bundle with your existing links array
        const out = {
            paths: sampled,
            links,
        };

        // 4) Trigger download
        const blob = new Blob([JSON.stringify(out, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "export.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    // ----- end exportJson -----


    return {
        // mode
        mode,
        setMode,

        // pan/zoom
        stageRef,
        scale,
        position,
        gridProps: {},
        stageProps: { onWheel: handleWheel },
        eventHandlers: { onMouseDown, onMouseMove, onMouseUp, onDblClick },

        // path state
        paths,
        currentPoints,
        previewPoint,
        selectedPointId,
        setSelectedPointId,
        mousePos,
        links,

        // drag callbacks
        onAnchorDragStart,
        onAnchorDragMove,
        onAnchorDragEnd,
        onHandleDragStart,
        onHandleDragMove,
        onHandleDragEnd,
        onSelectPoint,

        // Export
        exportJson
    };
}
