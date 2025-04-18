import React from "react";
import { Shape } from "react-konva";

export default React.memo(function Grid() {
    return (
        <Shape
            listening={false}
            sceneFunc={(ctx, shape) => {
                const size = 10000, step = 100;
                ctx.beginPath();
                for (let x = 0; x <= size; x += step) {
                    ctx.moveTo(x, 0); ctx.lineTo(x, size);
                }
                for (let y = 0; y <= size; y += step) {
                    ctx.moveTo(0, y); ctx.lineTo(size, y);
                }
                ctx.strokeStyle = "#ddd";
                ctx.lineWidth = 1;
                ctx.strokeShape(shape);
            }}
        />
    );
});
