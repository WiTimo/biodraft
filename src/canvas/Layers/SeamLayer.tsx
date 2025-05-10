import { Line } from 'react-konva';
import { useCanvasState } from '../state/CanvasState';
import { useMemo } from 'react';

function getLineBetweenPoints(p1: any, p2: any) {
    return [p1.x, p1.y, p2.x, p2.y];
}

function getRandomColor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 100%, 60%)`;
}

export function SeamLayer() {
    const seams = useCanvasState((s) => s.seams);
    const paths = useCanvasState((s) => s.present.paths);

    const seamLines = useMemo(() => {
        return seams.map((seam) => {
            const [aId, bId] = seam;
            const findPoint = (id: string) => {
                for (const path of paths) {
                    for (const point of path.points) {
                        if (point.id === id) return point;
                    }
                }
                return null;
            };
            const a = findPoint(aId);
            const b = findPoint(bId);
            if (!a || !b) return null;
            return {
                id: seam.join('-'),
                points: getLineBetweenPoints(a, b),
                color: getRandomColor(seam.join('-')),
            };
        }).filter(Boolean);
    }, [seams, paths]);

    return (
        <>
            {seamLines.map((line) => (
                <Line
                    key={line!.id}
                    points={line!.points}
                    stroke={line!.color}
                    strokeWidth={2}
                    dash={[10, 5]}
                    listening={false}
                />
            ))}
        </>
    );
} 
