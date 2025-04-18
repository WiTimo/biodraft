import React, { Fragment } from "react";
import { Circle, Line } from "react-konva";
import { BezierPoint, Path } from "../../types/bezier";
import {
    POINT_COLOR,
    POINT_OUTLINE_COLOR,
    HANDLE_COLOR,
} from "../../lib/colors";
import { Mode } from "../Toolbar";

interface Props {
    mode: Mode;
    points: BezierPoint[];
    savedPaths: Path[];
    previewPoint?: BezierPoint | null;
    selectedPointId?: string | null;
    onAnchorDragStart: (id: string) => void;
    onAnchorDragMove: (id: string, pos: { x: number; y: number }) => void;
    onAnchorDragEnd: () => void;
    onHandleDragStart: (pointId: string, handle: "left" | "right") => void;
    onHandleDragMove: (pointId: string, handle: "left" | "right", pos: { x: number, y: number }, altKey: boolean) => void;
    onHandleDragEnd: () => void;
    onSelectPoint: (id: string) => void;
}

export default React.memo(function PointsLayer({
    mode, points, savedPaths, previewPoint, selectedPointId,
    onAnchorDragStart, onAnchorDragMove, onAnchorDragEnd,
    onHandleDragStart, onHandleDragMove, onHandleDragEnd,
    onSelectPoint
}: Props) {
    const allPoints = [
        ...points.map(p => ({ ...p, source: "current" as const })),
        ...savedPaths.flatMap(path =>
            path.points.map(p => ({ ...p, source: "saved" as const, pathId: path.id }))
        ),
        ...(previewPoint ? [{ ...previewPoint, source: "preview" as const }] : []),
    ];

    return (
        <>
            {allPoints.map((pt, idx) => (
                <Fragment key={`${pt.source}-${pt.id}-${idx}`}>
                    {/* outline */}
                    <Circle
                        x={pt.x} y={pt.y} radius={6}
                        stroke={selectedPointId === pt.id ? POINT_OUTLINE_COLOR : "transparent"}
                        strokeWidth={1}
                        onMouseDown={e => e.cancelBubble = true}
                    />
                    {/* anchor */}
                    <Circle
                        x={pt.x} y={pt.y} radius={4}
                        fill={POINT_COLOR}
                        draggable={mode === "select"}
                        onMouseDown={e => e.cancelBubble = true}
                        onClick={() => mode === "select" && onSelectPoint(pt.id)}
                        onDragStart={() => onAnchorDragStart(pt.id)}
                        onDragMove={e => onAnchorDragMove(pt.id, e.target.position())}
                        onDragEnd={onAnchorDragEnd}
                    />
                    {/* edit‐mode handles for current path */}
                    {mode === "edit" && pt.source === "current" && pt.id === points[points.length - 1]?.id && (
                        <>
                            {pt.handleLeft && (
                                <>
                                    <Line points={[pt.x, pt.y, pt.handleLeft.x, pt.handleLeft.y]} stroke={HANDLE_COLOR} />
                                    <Circle x={pt.handleLeft.x} y={pt.handleLeft.y} radius={3} fill={HANDLE_COLOR} />
                                </>
                            )}
                            {pt.handleRight && (
                                <>
                                    <Line points={[pt.x, pt.y, pt.handleRight.x, pt.handleRight.y]} stroke={HANDLE_COLOR} />
                                    <Circle x={pt.handleRight.x} y={pt.handleRight.y} radius={3} fill={HANDLE_COLOR} />
                                </>
                            )}
                        </>
                    )}
                    {/* select‐mode handles */}
                    {mode === "select" && pt.id === selectedPointId && (
                        <>
                            {pt.handleLeft && (
                                <>
                                    <Line points={[pt.x, pt.y, pt.handleLeft.x, pt.handleLeft.y]} stroke={HANDLE_COLOR} />
                                    <Circle
                                        x={pt.handleLeft.x} y={pt.handleLeft.y} radius={3} fill={HANDLE_COLOR}
                                        onMouseDown={e => e.cancelBubble = true}
                                        draggable
                                        onDragStart={() => onHandleDragStart(pt.id, "left")}
                                        onDragMove={e => onHandleDragMove(pt.id, "left", e.target.position(), e.evt.altKey)}
                                        onDragEnd={onHandleDragEnd}
                                    />
                                </>
                            )}
                            {pt.handleRight && (
                                <>
                                    <Line points={[pt.x, pt.y, pt.handleRight.x, pt.handleRight.y]} stroke={HANDLE_COLOR} />
                                    <Circle
                                        x={pt.handleRight.x} y={pt.handleRight.y} radius={3} fill={HANDLE_COLOR}
                                        onMouseDown={e => e.cancelBubble = true}
                                        draggable
                                        onDragStart={() => onHandleDragStart(pt.id, "right")}
                                        onDragMove={e => onHandleDragMove(pt.id, "right", e.target.position(), e.evt.altKey)}
                                        onDragEnd={onHandleDragEnd}
                                    />
                                </>
                            )}
                        </>
                    )}
                </Fragment>
            ))}
        </>
    );
});
