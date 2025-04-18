import { BezierPoint, Path } from "../types/bezier";

/**
 * Sample each segment of a Path every ~stepPx pixels along the curve.
 * Returns an array of {x,y} in stage coordinates.
 */
export function samplePath(path: Path, stepPx = 10): { x: number; y: number }[] {
    const samples: { x: number; y: number }[] = [];

    for (let i = 1; i < path.points.length; i++) {
        const p0 = path.points[i - 1];
        const p1 = path.points[i];
        const c1 = p0.handleRight ?? p0;
        const c2 = p1.handleLeft ?? p1;

        // rough arc‐length estimate between p0→p1
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const dist = Math.hypot(dx, dy);

        const count = Math.max(Math.ceil(dist / stepPx), 1);
        for (let j = 0; j <= count; j++) {
            const t = j / count;
            const mt = 1 - t;
            // cubic Bézier interpolation
            const x =
                mt * mt * mt * p0.x +
                3 * mt * mt * t * c1.x +
                3 * mt * t * t * c2.x +
                t * t * t * p1.x;
            const y =
                mt * mt * mt * p0.y +
                3 * mt * mt * t * c1.y +
                3 * mt * t * t * c2.y +
                t * t * t * p1.y;
            samples.push({ x, y });
        }
    }

    return samples;
}
