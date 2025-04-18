import React from "react";
import { Shape } from "react-konva";
import { BezierPoint } from "../../types/bezier";
import { LINE_COLOR } from "../../lib/colors";

interface Props { points: BezierPoint[]; drawing: boolean; }

export default React.memo(function CurrentPathLayer({ points, drawing }: Props) {
    if (!drawing || points.length < 2) return null;
    return (
        <Shape
            listening={false}
            sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    const p0 = points[i - 1], p1 = points[i];
                    ctx.bezierCurveTo(
                        p0.handleRight?.x ?? p0.x,
                        p0.handleRight?.y ?? p0.y,
                        p1.handleLeft?.x ?? p1.x,
                        p1.handleLeft?.y ?? p1.y,
                        p1.x, p1.y
                    );
                }
                ctx.strokeShape(shape);
            }}
            stroke={LINE_COLOR}
            dash={[10, 5]}
            strokeWidth={2}
        />
    );
});
