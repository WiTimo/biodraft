import { BezierPoint } from "../types/bezier";
export const deepCopyPoints = (points: BezierPoint[]): BezierPoint[] =>
    points.map(p => ({
        ...p,
        handleLeft: p.handleLeft ? { ...p.handleLeft } : undefined,
        handleRight: p.handleRight ? { ...p.handleRight } : undefined,
    }));