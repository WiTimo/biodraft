// src/components/Canvas.tsx
import React from "react";
import { Stage, Layer, Shape, Rect, Circle, Line } from "react-konva";
import { Image as KonvaImage } from "react-konva";
import { v4 as uuidv4 } from "uuid";
import {
    HANDLE_COLOR,
    LINE_COLOR,
    POINT_COLOR,
    POINT_OUTLINE_COLOR,
    PREVIEW_LINE_COLOR,
} from "../lib/colors";

// Import any additional helper functions you need here
// e.g., deepCopyPoints, pushToHistory, etc.

type CanvasProps = {
    // Pass down all necessary props from Editor like stage settings,
    // arrays of paths/points, event handlers, mode, etc.
    stageScale: number;
    stagePosition: { x: number; y: number };
    setStageScale: (scale: number) => void;
    setStagePosition: (pos: { x: number; y: number }) => void;
    backgroundImage: HTMLImageElement | undefined;
    status: string;
    imageScale: number;
    imageOffset: { x: number; y: number };
    paths: any[];
    currentPoints: any[];
    drawing: boolean;
    mode: "DRAW" | "SELECT";
    // Provide event handler functions, etc.
    handleWheel: (e: any) => void;
    handleMouseDown: (e: any) => void;
    handleMouseMove: (e: any) => void;
    handleMouseUp: (e: any) => void;
    handleDoubleClick: () => void;
    // Other state & handler props that Canvas needs...
};

const Canvas: React.FC<CanvasProps> = (props) => {
    // Destructure the props needed:
    const {
        stageScale,
        stagePosition,
        setStagePosition,
        backgroundImage,
        status,
        imageScale,
        imageOffset,
        paths,
        currentPoints,
        drawing,
        mode,
        handleWheel,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleDoubleClick,
        // ...other props
    } = props;

    return (
        <Stage
            width={window.innerWidth}
            height={window.innerHeight}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePosition.x}
            y={stagePosition.y}
            // Assume you forward your ref via React.forwardRef if needed
            style={{ background: "#f0f0f0", cursor: mode === "DRAW" ? "crosshair" : "default" }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDblClick={handleDoubleClick}
        >
            <Layer>
                {status === "loaded" && backgroundImage && (
                    <KonvaImage
                        image={backgroundImage}
                        x={imageOffset.x}
                        y={imageOffset.y}
                        width={backgroundImage.width * imageScale}
                        height={backgroundImage.height * imageScale}
                        opacity={1}
                        listening={false}
                    />
                )}
                {/* Grid */}
                {[...Array(100)].map((_, i) => (
                    <Rect key={`v-${i}`} x={i * 100} y={0} width={1} height={10000} fill="#ddd" />
                ))}
                {[...Array(100)].map((_, i) => (
                    <Rect key={`h-${i}`} x={0} y={i * 100} width={10000} height={1} fill="#ddd" />
                ))}

                {/* Render saved and in-progress paths here */}
                {/* Render interactive points & handles */}
                {/* You can further split this section into its own sub-components if desired */}
            </Layer>
        </Stage>
    );
};

export default Canvas;