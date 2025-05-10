import { Line } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { LinePath } from '../Paths/LinePath';
import { useMemo, useRef } from 'react';

export function PathsLayer() {
    const paths = useCanvasState(s => s.present.paths);
    const seams = useCanvasState(s => s.present.seams || []);
    const currentTool = useCanvasState(s => s.currentTool);
    const zoom = useCanvasState(s => s.zoom);
    const addSeam = useCanvasState(s => s.addSeam); // ✅ Must work with point segments
    const seamSelection = useRef<string[][]>([]); // holds [[aId, bId], [cId, dId]]

    const handleSegmentClick = (aId: string, bId: string) => {
        if (currentTool !== 'seam') return;

        if (seamSelection.current.length >= 2) {
            seamSelection.current = [];
        }

        seamSelection.current.push([aId, bId]);

        if (seamSelection.current.length === 2) {
            const [[a1, b1], [a2, b2]] = seamSelection.current;
            addSeam(a1, a2); // Corrected
            addSeam(b1, b2); // Corrected
            seamSelection.current = [];
        }

    };

    const seamLines = useMemo(() => {
        return seams.map(([id1, id2], i) => {
            let p1 = null, p2 = null;

            for (const path of paths) {
                if (!p1) p1 = path.points.find(p => p.id === id1);
                if (!p2) p2 = path.points.find(p => p.id === id2);
            }

            if (!p1 || !p2) return null;

            return (
                <Line
                    key={`seam-${i}`}
                    points={[p1.x, p1.y, p2.x, p2.y]}
                    stroke="orange"
                    strokeWidth={2 / zoom}
                    dash={[6, 3]}
                    listening={false}
                />
            );
        }).filter(Boolean);
    }, [seams, paths, zoom]);
    function getQuadraticBezierPoints(p0, h0, h1, p1, steps = 80) {
        const points: number[] = [];
        for (let t = 0; t <= 1; t += 1 / steps) {
            const x = Math.pow(1 - t, 3) * p0.x +
                3 * Math.pow(1 - t, 2) * t * (p0.x + h0.dx) +
                3 * (1 - t) * Math.pow(t, 2) * (p1.x + h1.dx) +
                Math.pow(t, 3) * p1.x;
            const y = Math.pow(1 - t, 3) * p0.y +
                3 * Math.pow(1 - t, 2) * t * (p0.y + h0.dy) +
                3 * (1 - t) * Math.pow(t, 2) * (p1.y + h1.dy) +
                Math.pow(t, 3) * p1.y;
            points.push(x, y);
        }
        return points;
    }

    return (
        <>
            {/* Render all actual paths visually */}
            {paths.map((path) => (
                <LinePath
                    key={path.id}
                    points={path.points}
                    closed={path.closed}
                />
            ))}

            {paths.flatMap((path) => {
                const segments = [];
                for (let i = 0; i < path.points.length - 1; i++) {
                    const a = path.points[i];
                    const b = path.points[i + 1];
                    const bezierPoints = getQuadraticBezierPoints(a, a.handleOut, b.handleIn, b);
                    segments.push(
                        <Line
                            key={`bezier-click-${a.id}-${b.id}`}
                            points={bezierPoints}
                            stroke="blue" // debug
                            strokeWidth={12 / zoom}
                            onClick={() => handleSegmentClick(a.id, b.id)}
                            listening
                        />
                    );
                }

                // 🔁 Add closing segment if path is marked as closed
                if (path.closed && path.points.length >= 2) {
                    const a = path.points[path.points.length - 1];
                    const b = path.points[0];
                    const bezierPoints = getQuadraticBezierPoints(a, a.handleOut, b.handleIn, b);
                    segments.push(
                        <Line
                            key={`bezier-click-close-${a.id}-${b.id}`}
                            points={bezierPoints}
                            stroke="blue" // debug
                            strokeWidth={12 / zoom}
                            onClick={() => handleSegmentClick(a.id, b.id)}
                            listening
                        />
                    );
                }

                return segments;
            })}
            {seamLines}
        </>
    );
}
