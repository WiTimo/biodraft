import { useMemo } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { HandleCircle } from '../Circles/HandleCircle';
import { PointCircle } from '../Circles/PointCircle';
import React from 'react';

export function PointsLayer() {
    const paths = useCanvasState((s) => s.present.paths);
    const selectedPointId = useCanvasState((s) => s.selectedPointId);

    const allPoints = useMemo(() => {
        return paths.flatMap((path) => path.points);
    }, [paths]);

    return (
        <>
            {allPoints.map((p) => (
                <React.Fragment key={p.id}>
                    <PointCircle id={p.id} x={p.x} y={p.y} />
                    {p.id === selectedPointId && (
                        <>
                            <HandleCircle
                                key={p.id + '-in'}
                                pointX={p.x}
                                pointY={p.y}
                                dx={p.handleIn.dx}
                                dy={p.handleIn.dy}
                                pointId={p.id}
                                type="handleIn"
                            />
                            <HandleCircle
                                key={p.id + '-out'}
                                pointX={p.x}
                                pointY={p.y}
                                dx={p.handleOut.dx}
                                dy={p.handleOut.dy}
                                pointId={p.id}
                                type="handleOut"
                            />
                        </>
                    )}
                </React.Fragment>
            ))}
        </>
    );
}
