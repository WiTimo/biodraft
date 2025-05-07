import { Image as KonvaImage, Transformer } from 'react-konva';
import { useEffect, useRef, useState } from 'react';
import useImage from 'use-image';
import { useCanvasState } from '../state/CanvasState';

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

const SNAP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]

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

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const selected = selectedBackgroundId === id;

  useEffect(() => {
    if (selected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selected, currentTool]);

  useEffect(() => {
    // detect shift key press
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image}
        x={x ?? 0}
        y={y ?? 0}
        scaleX={scaleX}
        scaleY={scaleY}
        rotation={rotation}
        opacity={opacity}
        name='background-image'
        draggable={!locked && currentTool === 'background'}
        onClick={(e) => {
          if (currentTool === 'background' && !locked) {
            selectBackgroundImage(id);
            useCanvasState.getState().deselectPoint();
            useCanvasState.getState().clearSelectedPointIds();
            e.cancelBubble = true;
          }
        }}
        onDragStart={() => {
          if (currentTool === 'background' && !locked) {
            selectBackgroundImage(id);
          }
        }}
        onDragEnd={(e) => {
          moveBackgroundImage(id, e.target.x(), e.target.y());
        }}
        onTransform={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const rotation = node.rotation();
          const x = node.x();
          const y = node.y();


          useCanvasState.setState((state) => ({
            present: {
              ...state.present,
              backgroundImages: state.present.backgroundImages.map((img) =>
                img.id === id ? { ...img, x, y, scaleX, scaleY, rotation } : img
              ),
            },
          }));
        }}

      />
      {selected && currentTool === 'background' && !locked && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(_, newBox) => newBox}
          rotateEnabled={true}
          rotationSnaps={isShiftPressed ? SNAP_ANGLES : []}
        />
      )}
    </>
  );
}