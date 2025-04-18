import React from "react";
import { Shape, Line, Circle } from "react-konva";
import { BezierPoint } from "../../types/bezier";
import { PREVIEW_LINE_COLOR, HANDLE_COLOR } from "../../lib/colors";
import { Mode } from "../Toolbar";

interface Props {
    mode: Mode;
    lastPoint?: BezierPoint;
    preview?: BezierPoint | null;
    mousePos?: { x: number; y: number } | null;
}

export default React.memo(function PreviewLayer({ mode, lastPoint, preview, mousePos }: Props) {
    if (mode !== "edit" || !lastPoint) return null;

    if (preview) {
        return (
            <>
                <Shape
                    listening={false}
                    sceneFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.moveTo(lastPoint.x, lastPoint.y);
                        ctx.bezierCurveTo(
                            lastPoint.handleRight?.x ?? lastPoint.x,
                            lastPoint.handleRight?.y ?? lastPoint.y,
                            preview.handleLeft?.x ?? preview.x,
                            preview.handleLeft?.y ?? preview.y,
                            preview.x, preview.y
                        );
                        ctx.strokeShape(shape);
                    }}
                    stroke={PREVIEW_LINE_COLOR}
                    dash={[10, 4]}
                    strokeWidth={2}
                />
                {preview.handleLeft && (
                    <>
                        <Line
                            points={[preview.x, preview.y, preview.handleLeft.x, preview.handleLeft.y]}
                            stroke={HANDLE_COLOR}
                        />
                        <Circle x={preview.handleLeft.x} y={preview.handleLeft.y} radius={3} fill={HANDLE_COLOR} />
                    </>
                )}
                {preview.handleRight && (
                    <>
                        <Line
                            points={[preview.x, preview.y, preview.handleRight.x, preview.handleRight.y]}
                            stroke={HANDLE_COLOR}
                        />
                        <Circle x={preview.handleRight.x} y={preview.handleRight.y} radius={3} fill={HANDLE_COLOR} />
                    </>
                )}
            </>
        );
    }

    if (mousePos) {
        const lp = lastPoint;
        const lastH = lp.handleRight ?? { x: lp.x + 100, y: lp.y };
        const dx = lastH.x - lp.x, dy = lastH.y - lp.y;
        const h0 = { x: lp.x + dx, y: lp.y + dy };
        const backDx = lp.x - mousePos.x, backDy = lp.y - mousePos.y;
        const backLen = Math.hypot(backDx, backDy) || 1;
        const h1 = {
            x: mousePos.x + (backDx / backLen) * 100 * 0.3,
            y: mousePos.y + (backDy / backLen) * 100 * 0.3
        };
        return (
            <>
                <Shape
                    listening={false}
                    sceneFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.moveTo(lp.x, lp.y);
                        ctx.bezierCurveTo(h0.x, h0.y, h1.x, h1.y, mousePos.x, mousePos.y);
                        ctx.strokeShape(shape);
                    }}
                    stroke={PREVIEW_LINE_COLOR}
                    dash={[4, 3]}
                    strokeWidth={2}
                />
                <Circle x={h0.x} y={h0.y} radius={3} fill={HANDLE_COLOR} />
                <Circle x={h1.x} y={h1.y} radius={3} fill={HANDLE_COLOR} />
            </>
        );
    }

    return null;
});
