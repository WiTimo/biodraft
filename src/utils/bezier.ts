import { BezierPoint } from "../types/types";

export const deepCopyPoints = (points: BezierPoint[]): BezierPoint[] =>
    points.map((p) => ({
        ...p,
        handleLeft: p.handleLeft ? { ...p.handleLeft } : undefined,
        handleRight: p.handleRight ? { ...p.handleRight } : undefined,
    }));

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);