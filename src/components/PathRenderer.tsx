import { Fragment } from "react";
import { Shape, Circle, Line } from "react-konva";
import { Mode } from "../types/types";
import {
  LINE_COLOR,
  POINT_COLOR,
  POINT_OUTLINE_COLOR,
  HANDLE_COLOR,
  PREVIEW_LINE_COLOR
} from "../constants/ui";

type Props = {
  paths: { id: string; points: BezierPoint[]; closed: boolean }[];
  currentPoints: BezierPoint[];
  previewPoint: BezierPoint | null;
  selectedPointId: string | null;
  draggingAnchorId: string | null;
  draggingHandle: { pointId: string; handle: "left" | "right" } | null;
  mousePos: { x: number; y: number } | null;
  mode: Mode;
  onAnchorDragMove: (id: string, pos: { x: number; y: number }) => void;
  onHandleDragMove: (pointId: string, type: "left" | "right", pos: { x: number; y: number }, altKey: boolean) => void;
  onAnchorSelect: (id: string) => void;
};

export default function PathRenderer({
  paths,
  currentPoints,
  previewPoint,
  selectedPointId,
  draggingAnchorId,
  draggingHandle,
  mousePos,
  mode,
  onAnchorDragMove,
  onHandleDragMove,
  onAnchorSelect,
}: Props) {
  return (
    <>
      {/* Render existing paths */}
      {paths.map((path) => (
        <Shape key={path.id} sceneFunc={(ctx, shape) => {
            const points = path.points;
            if (points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
              const p0 = points[i - 1];
              const p1 = points[i];
              ctx.bezierCurveTo(
                p0.handleRight?.x ?? p0.x,
                p0.handleRight?.y ?? p0.y,
                p1.handleLeft?.x ?? p1.x,
                p1.handleLeft?.y ?? p1.y,
                p1.x,
                p1.y
              );
            }
            if (path.closed) {
              const last = points[points.length - 1];
              const first = points[0];
              ctx.bezierCurveTo(
                last.handleRight?.x ?? last.x,
                last.handleRight?.y ?? last.y,
                first.handleLeft?.x ?? first.x,
                first.handleLeft?.y ?? first.y,
                first.x,
                first.y
              );
            }
            ctx.strokeShape(shape);
          }}
          stroke="black"
          strokeWidth={2}
        />
      ))}

      {/* In-progress line */}
      {currentPoints.length > 1 && (
        <Shape
          sceneFunc={(ctx, shape) => {
            const points = currentPoints;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
              const p0 = points[i - 1];
              const p1 = points[i];
              ctx.bezierCurveTo(
                p0.handleRight?.x ?? p0.x,
                p0.handleRight?.y ?? p0.y,
                p1.handleLeft?.x ?? p1.x,
                p1.handleLeft?.y ?? p1.y,
                p1.x,
                p1.y
              );
            }
            ctx.strokeShape(shape);
          }}
          stroke={LINE_COLOR}
          dash={[10, 5]}
          strokeWidth={2}
        />
      )}

      {/* Preview line */}
      {currentPoints.length > 0 && previewPoint && (
        <Shape
          listening={false}
          sceneFunc={(ctx, shape) => {
            const p0 = currentPoints[currentPoints.length - 1];
            const p1 = previewPoint;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(
              p0.handleRight?.x ?? p0.x,
              p0.handleRight?.y ?? p0.y,
              p1.handleLeft?.x ?? p1.x,
              p1.handleLeft?.y ?? p1.y,
              p1.x,
              p1.y
            );
            ctx.strokeShape(shape);
          }}
          stroke={PREVIEW_LINE_COLOR}
          strokeWidth={2}
          dash={[4, 3]}
        />
      )}

      {/* Render anchors and handles */}
      {[...currentPoints, ...paths.flatMap((p) => p.points), ...(previewPoint ? [previewPoint] : [])].map((point, idx) => (
        <Fragment key={`${point.id}-${idx}`}>
          <Circle
            x={point.x}
            y={point.y}
            radius={6}
            stroke={selectedPointId === point.id ? POINT_OUTLINE_COLOR : "transparent"}
            strokeWidth={selectedPointId === point.id ? 1 : 0}
          />
          <Circle
            x={point.x}
            y={point.y}
            radius={4}
            fill={POINT_COLOR}
            draggable={mode === "SELECT"}
            onClick={(e) => {
              e.cancelBubble = true;
              onAnchorSelect(point.id);
            }}
            onDragMove={(e) => {
              const pos = e.target.position();
              onAnchorDragMove(point.id, pos);
            }}
          />
          {point.id === selectedPointId && (
            <>
              {point.handleLeft && (
                <>
                  <Line points={[point.x, point.y, point.handleLeft.x, point.handleLeft.y]} stroke={HANDLE_COLOR} />
                  <Circle
                    x={point.handleLeft.x}
                    y={point.handleLeft.y}
                    radius={3}
                    fill={HANDLE_COLOR}
                    draggable={mode === "SELECT"}
                    onDragMove={(e) => {
                      const pos = e.target.position();
                      onHandleDragMove(point.id, "left", pos, e.evt.altKey);
                    }}
                  />
                </>
              )}
              {point.handleRight && (
                <>
                  <Line points={[point.x, point.y, point.handleRight.x, point.handleRight.y]} stroke={HANDLE_COLOR} />
                  <Circle
                    x={point.handleRight.x}
                    y={point.handleRight.y}
                    radius={3}
                    fill={HANDLE_COLOR}
                    draggable={mode === "SELECT"}
                    onDragMove={(e) => {
                      const pos = e.target.position();
                      onHandleDragMove(point.id, "right", pos, e.evt.altKey);
                    }}
                  />
                </>
              )}
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}

import { useState } from "react";
import { BezierPoint } from "../types/types";

export function usePointEditor(setCurrentPoints: React.Dispatch<React.SetStateAction<BezierPoint[]>>) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [draggingAnchorId, setDraggingAnchorId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{
    pointId: string;
    handle: "left" | "right";
  } | null>(null);

  const onAnchorDragMove = (id: string, pos: { x: number; y: number }) => {
    setCurrentPoints((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              x: pos.x,
              y: pos.y,
              handleLeft: p.handleLeft
                ? {
                    x: pos.x + (p.handleLeft.x - p.x),
                    y: pos.y + (p.handleLeft.y - p.y),
                  }
                : undefined,
              handleRight: p.handleRight
                ? {
                    x: pos.x + (p.handleRight.x - p.x),
                    y: pos.y + (p.handleRight.y - p.y),
                  }
                : undefined,
            }
          : p
      )
    );
  };

  const onHandleDragMove = (
    pointId: string,
    type: "left" | "right",
    pos: { x: number; y: number },
    altKey: boolean
  ) => {
    setCurrentPoints((prev) =>
      prev.map((p) => {
        if (p.id !== pointId) return p;
        const newHandle = { x: pos.x, y: pos.y };

        if (type === "right") {
          if (altKey || !p.handleLeft) {
            return { ...p, handleRight: newHandle };
          }
          const dx = newHandle.x - p.x;
          const dy = newHandle.y - p.y;
          return {
            ...p,
            handleRight: newHandle,
            handleLeft: { x: p.x - dx, y: p.y - dy },
          };
        }

        if (type === "left") {
          if (altKey || !p.handleRight) {
            return { ...p, handleLeft: newHandle };
          }
          const dx = newHandle.x - p.x;
          const dy = newHandle.y - p.y;
          return {
            ...p,
            handleLeft: newHandle,
            handleRight: { x: p.x - dx, y: p.y - dy },
          };
        }

        return p;
      })
    );
  };

  return {
    selectedPointId,
    setSelectedPointId,
    draggingAnchorId,
    setDraggingAnchorId,
    draggingHandle,
    setDraggingHandle,
    onAnchorDragMove,
    onHandleDragMove,
  };
}
