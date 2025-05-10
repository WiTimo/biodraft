import { useCanvasState } from '../state/CanvasState';
import { LinePath } from '../Paths/LinePath';
import { Line } from 'react-konva';
import { useMemo } from 'react';

export function PathsLayer() {
    const paths = useCanvasState((s) => s.present.paths);
    const currentTool = useCanvasState((s) => s.currentTool);
    const zoom = useCanvasState((s) => s.zoom);

    const handleSegmentClick = (aId: string, bId: string) => {
        const seamSelection = (window as any).seamSelectionRef as string[];
        seamSelection.push(aId);
        seamSelection.push(bId);
        if (seamSelection.length === 4) seamSelection.splice(0, 2);

        if (seamSelection.length === 4) {
            const [a1, a2, b1, b2] = seamSelection;
            useCanvasState.getState().addSeam(a1, b1);
            useCanvasState.getState().addSeam(a2, b2);
            seamSelection.length = 0;
        }
    };

    const segmentLines = useMemo(() => {
        if (currentTool !== 'seam') return null;
        return paths.flatMap((path) => {
            const segments = [];
            for (let i = 0; i < path.points.length - 1; i++) {
                const a = path.points[i];
                const b = path.points[i + 1];
                segments.push(
                    <Line
                        key={a.id + '-' + b.id}
                        points={[a.x, a.y, b.x, b.y]}
                        stroke="transparent"
                        strokeWidth={10 / zoom}
                        onClick={() => handleSegmentClick(a.id, b.id)}
                    />
                );
            }
            return segments;
        });
    }, [paths, currentTool, zoom]);

    return (
        <>
            {paths.map((path) => (
                <LinePath key={path.id} points={path.points} closed={path.closed} />
            ))}
            {segmentLines}
        </>
    );
}
