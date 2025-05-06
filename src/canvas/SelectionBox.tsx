import { Group, Rect, Transformer } from 'react-konva';
import { useCanvasState } from './CanvasState';
import { useRef, useLayoutEffect } from 'react';

export function SelectionBox() {
  const { present, selectedPointIds, movePoint } = useCanvasState();
  const groupRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  const points = present.paths.flatMap(p => p.points).filter(p => selectedPointIds.includes(p.id));

  if (points.length === 0) return null;

  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  const width = maxX - minX;
  const height = maxY - minY;

  useLayoutEffect(() => {
    if (transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedPointIds]);

  return (
    <>
      <Group
        x={minX}
        y={minY}
        draggable
        ref={groupRef}
        onDragMove={(e) => {
          const dx = e.target.x() - minX;
          const dy = e.target.y() - minY;

          selectedPointIds.forEach((id) => {
            const pt = useCanvasState.getState().present.paths.flatMap(p => p.points).find(p => p.id === id);
            if (pt) {
              movePoint(id, pt.x + dx, pt.y + dy);
            }
          });

          e.target.position({ x: minX, y: minY });
        }}
        onTransform={(e) => {
          const node = groupRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          selectedPointIds.forEach((id) => {
            const pt = useCanvasState.getState().present.paths.flatMap(p => p.points).find(p => p.id === id);
            if (pt) {
              const newX = minX + (pt.x - minX) * scaleX;
              const newY = minY + (pt.y - minY) * scaleY;
              movePoint(id, newX, newY);
            }
          });
        }}
        onTransformEnd={() => {
          if (groupRef.current) {
            groupRef.current.scaleX(1);
            groupRef.current.scaleY(1);
          }
        }}
      >
        <Rect
          width={width}
          height={height}
          stroke="blue"
          strokeWidth={1}
          dash={[4, 4]}
          name="selection-box"
          fill="rgba(0,0,255,0.05)"
          hitStrokeWidth={10}
        />
      </Group>
      <Transformer
        ref={transformerRef}
        keepRatio={false}
        boundBoxFunc={(oldBox, newBox) => newBox}
        enabledAnchors={['bottom-right']}
      />
    </>
  );
}