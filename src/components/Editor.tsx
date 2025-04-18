// File: src/components/Editor.tsx
import { Stage, Image as KonvaImage, Layer, Group } from "react-konva";
import Grid from "./Grid";
import PathsLayer from "./Layers/PathsLayer";
import CurrentPathLayer from "./Layers/CurrentPathLayer";
import PreviewLayer from "./Layers/PreviewLayer";
import PointsLayer from "./Layers/PointsLayer";
import Toolbar from "./Toolbar";
import useEditor from "../hooks/useEditor";
import LinksLayer from "./Layers/LinksLayer";
import useImage from "use-image";

export default function Editor() {
  const {
    mode,
    setMode,
    stageRef,
    scale,
    position,
    gridProps,
    stageProps,
    eventHandlers,
    links,
    paths,
    currentPoints,
    previewPoint,
    selectedPointId,
    mousePos,

    onAnchorDragStart,
    onAnchorDragMove,
    onAnchorDragEnd,
    onHandleDragStart,
    onHandleDragMove,
    onHandleDragEnd,
    exportJson,
    onSelectPoint,
  } = useEditor();

  const BACKGROUND_IMAGE_URL = "/test2.png";
  const [bgImage] = useImage(BACKGROUND_IMAGE_URL)

  return (
    <>
      <Toolbar mode={mode} setMode={setMode} exportJson={exportJson} />

      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        ref={stageRef}
        {...gridProps}
        {...stageProps}
        {...eventHandlers}
        style={{ background: "#f0f0f0" }}
      >
        <Layer>
          <Group
            x={position.x}
            y={position.y}
            scaleX={scale}
            scaleY={scale}
          >
            {/* background image, slightly transparent */}
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={0}
                y={0}
                width={window.innerWidth}
                height={window.innerHeight}
                opacity={0.4}
                listening={false}
              />
            )}
            {/* everything else on top */}
            <Grid />
            <PathsLayer paths={paths} />
            <LinksLayer paths={paths} links={links} />
            <CurrentPathLayer
              points={currentPoints}
              drawing={currentPoints.length > 1}
            />
            <PreviewLayer
              mode={mode}
              lastPoint={currentPoints[currentPoints.length - 1]}
              preview={previewPoint}
              mousePos={mousePos}
            />
            <PointsLayer
              mode={mode}
              points={currentPoints}
              savedPaths={paths}
              previewPoint={previewPoint}
              selectedPointId={selectedPointId}

              onAnchorDragStart={onAnchorDragStart}
              onAnchorDragMove={onAnchorDragMove}
              onAnchorDragEnd={onAnchorDragEnd}

              onHandleDragStart={onHandleDragStart}
              onHandleDragMove={onHandleDragMove}
              onHandleDragEnd={onHandleDragEnd}

              onSelectPoint={onSelectPoint}
            />
          </Group>
        </Layer>
      </Stage>
    </>
  );
}
