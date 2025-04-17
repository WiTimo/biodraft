import { useState } from "react";
import { BezierPoint } from "../types/types";

export function usePointEditor(setCurrentPoints: React.Dispatch<React.SetStateAction<BezierPoint[]>>) {
    const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
    const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<{
        pointId: string;
        handle: "left" | "right";
    } | null>(null);

    const onAnchorDragMove = (id: string, pos: { x: number; y: number }) => {
        setCurrentPoints((prev) =>
            prev.map((p) =>
                p.id === id
                    ? {
                        ...p,
                        x: pos.x,
                        y: pos.y,
                        handleLeft: p.handleLeft
                            ? {
                                x: pos.x + (p.handleLeft.x - p.x),
                                y: pos.y + (p.handleLeft.y - p.y),
                            }
                            : undefined,
                        handleRight: p.handleRight
                            ? {
                                x: pos.x + (p.handleRight.x - p.x),
                                y: pos.y + (p.handleRight.y - p.y),
                            }
                            : undefined,
                    }
                    : p
            )
        );
    };

    const onHandleDragMove = (
        pointId: string,
        type: "left" | "right",
        pos: { x: number; y: number },
        altKey: boolean
    ) => {
        setCurrentPoints((prev) =>
            prev.map((p) => {
                if (p.id !== pointId) return p;
                const newHandle = { x: pos.x, y: pos.y };

                if (type === "right") {
                    if (altKey || !p.handleLeft) {
                        return { ...p, handleRight: newHandle };
                    }
                    const dx = newHandle.x - p.x;
                    const dy = newHandle.y - p.y;
                    return {
                        ...p,
                        handleRight: newHandle,
                        handleLeft: { x: p.x - dx, y: p.y - dy },
                    };
                }

                if (type === "left") {
                    if (altKey || !p.handleRight) {
                        return { ...p, handleLeft: newHandle };
                    }
                    const dx = newHandle.x - p.x;
                    const dy = newHandle.y - p.y;
                    return {
                        ...p,
                        handleLeft: newHandle,
                        handleRight: { x: p.x - dx, y: p.y - dy },
                    };
                }

                return p;
            })
        );
    };

    return {
        selectedPointId,
        setSelectedPointId,
        draggingAnchorId,
        setDraggingAnchorId,
        draggingHandle,
        setDraggingHandle,
        onAnchorDragMove,
        onHandleDragMove,
    };
}