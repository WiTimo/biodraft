import React from "react";
import { Shape } from "react-konva";
import { Path as PathType } from "../types/bezier";

export const PathRenderer: React.FC<{ paths: PathType[] }> = ({ paths }) => (
    <>
        {paths.map((path) => (
            <Shape
                key={path.id}
                sceneFunc={(ctx, shape) => {
                    const pts = path.points;
                    if (pts.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) {
                        const p0 = pts[i - 1],
                            p1 = pts[i];
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
                        const last = pts[pts.length - 1],
                            first = pts[0];
                        ctx.bezierCurveTo(
                            last.handleRight?.x ?? last.x,
                            last.handleRight?.y ?? last.y,
                            first.handleLeft?.x ?? first.x,
                            first.handleLeft?.y ?? first.y,
                            first.x,
                            first.y
                        );
                    }
                    // ← use Konva’s strokeShape, not ctx.stroke()
                    ctx.strokeShape(shape);
                }}
                stroke="black"
                strokeWidth={2}
            />
        ))}
    </>
);
