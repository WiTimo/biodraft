import { useState } from "react";
import { BezierPoint } from "../types/bezier";
import { deepCopyPoints } from "../utils/points";

export function useHistory(initial: BezierPoint[]) {
    const [history, setHistory] = useState<BezierPoint[][]>([]);
    const [redoStack, setRedoStack] = useState<BezierPoint[][]>([]);

    const push = (points: BezierPoint[]) => {
        setHistory(h => [...h, deepCopyPoints(points)]);
        setRedoStack([]);
    };

    const undo = (current: BezierPoint[], setCurrent: (pts: BezierPoint[]) => void) => {
        setHistory(h => {
            if (h.length === 0) return h;
            const last = h[h.length - 1];
            setRedoStack(r => [deepCopyPoints(current), ...r]);
            setCurrent(last);
            return h.slice(0, -1);
        });
    };

    const redo = (current: BezierPoint[], setCurrent: (pts: BezierPoint[]) => void) => {
        setRedoStack(r => {
            if (r.length === 0) return r;
            const [next, ...rest] = r;
            setHistory(h => [...h, deepCopyPoints(current)]);
            setCurrent(next);
            return rest;
        });
    };

    return { push, undo, redo };
}