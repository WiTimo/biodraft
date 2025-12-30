import { useMemo } from 'react';
import { useCanvasState } from '../state/CanvasState';
import { HandleCircle } from '../components/HandleCircle';
import { PointCircle } from '../components/PointCircle';
import React from 'react';

export function PointsLayer() {
  const paths = useCanvasState((s) => s.present.paths);
  const selectedPointId = useCanvasState((s) => s.selectedPointId);

  const { allPoints, overlappingPointIds } = useMemo(() => {
    const pointMap = new Map();
    const pointCount = new Map<string, number>();
    
    paths.forEach((path) => {
      path.points.forEach((point) => {
        if (!pointMap.has(point.id)) {
          pointMap.set(point.id, point);
        }
        pointCount.set(point.id, (pointCount.get(point.id) || 0) + 1);
      });
    });
    
    const overlappingIds = new Set<string>();
    pointCount.forEach((count, pointId) => {
      if (count > 1) {
        overlappingIds.add(pointId);
      }
    });
    
    return {
      allPoints: Array.from(pointMap.values()),
      overlappingPointIds: overlappingIds,
    };
  }, [paths]);

function hasVisibleHandles(p: any) {
  return (
    p.handleIn.dx !== 0 || p.handleIn.dy !== 0 ||
    p.handleOut.dx !== 0 || p.handleOut.dy !== 0
  );
}

  return (
    <>
      {allPoints.map((p) => (
        <React.Fragment key={p.id}>
          <PointCircle
            id={p.id}
            x={p.x}
            y={p.y}
            isOverlapping={overlappingPointIds.has(p.id)}
          />
          {p.id === selectedPointId && hasVisibleHandles(p) && (
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
