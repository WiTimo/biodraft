import { Image as KonvaImage, Transformer } from 'react-konva';
import { useEffect, useRef, useState } from 'react';
import useImage from 'use-image';
import { useCanvasState } from './canvasState';

interface BackgroundImageProps {
    id: string;
    src: string;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
    locked: boolean;
  }
    
export function BackgroundImage({
  id,
  src,
  x,
  y,
  scaleX,
  scaleY,
  rotation,
  opacity,
  locked,
}: BackgroundImageProps) {
  const { moveBackgroundImage, currentTool, selectedBackgroundId, selectBackgroundImage } = useCanvasState();
  const [image] = useImage(src);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const selected = selectedBackgroundId === id;

  useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selected]);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image}
        x={x}
        y={y}
        scaleX={scaleX}
        scaleY={scaleY}
        rotation={rotation}
        opacity={opacity}
        draggable={!locked && currentTool === 'background'}
        onClick={(e) => {
          if (currentTool === 'background' && !locked) {
            selectBackgroundImage(id); // Always select this image
            e.cancelBubble = true; // Stop click from bubbling
          }
        }}
        onTap={(e) => {
          if (currentTool === 'background' && !locked) {
            selectBackgroundImage(id);
            e.cancelBubble = true;
          }
        }}
        onDragEnd={(e) => {
          moveBackgroundImage(id, e.target.x(), e.target.y());
        }}
        onTransformEnd={(e) => {
            const node = shapeRef.current;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const rotation = node.rotation();
            const x = node.x();
            const y = node.y();
          
            useCanvasState.getState().updateBackgroundImageFullTransform(id, {
              x,
              y,
              scaleX,
              scaleY,
              rotation,
            });
          
            // Reset Konva internal scaling
            node.scaleX(1);
            node.scaleY(1);
          }}
          
      />
      {selected && currentTool === 'background' && !locked && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => newBox}
        />
      )}
    </>
  );
}
