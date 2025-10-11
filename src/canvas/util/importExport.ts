import { useCanvasState } from '../state/CanvasState';

export function exportToJson() {
  const { paths, seams } = useCanvasState.getState().present;

  const exportData = paths.map((path) => ({
    id: path.id,
    points: path.points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
      handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
    })),
    closed: path.closed,
    texture: path.texture
      ? {
          src: path.texture.src,
          scaleX: path.texture.scaleX ?? 1,
          scaleY: path.texture.scaleY ?? 1,
          offsetX: path.texture.offsetX ?? 0,
          offsetY: path.texture.offsetY ?? 0,
          rotation: path.texture.rotation ?? 0,
          repeat: path.texture.repeat ?? 'repeat',
        }
      : null,
  }));

  const blob = new Blob(
    [JSON.stringify({ patterns: exportData, seams }, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patterns_with_seams_and_textures.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromJson(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    if (!reader.result) return;

    const parsed = JSON.parse(reader.result as string);
    if (!parsed.patterns) return;

    const newPaths = parsed.patterns.map((pattern: any) => ({
      id: pattern.id,
      closed: pattern.closed,
      points: pattern.points.map((p: any) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
      })),
      texture: pattern.texture
        ? {
            src: pattern.texture.src,
            scaleX: pattern.texture.scaleX ?? 1,
            scaleY: pattern.texture.scaleY ?? 1,
            offsetX: pattern.texture.offsetX ?? 0,
            offsetY: pattern.texture.offsetY ?? 0,
            rotation: pattern.texture.rotation ?? 0,
            repeat: pattern.texture.repeat ?? 'repeat',
          }
        : null,
    }));

    const parsedSeams = (parsed.seams || []) as [[string, string], [string, string]][];

    useCanvasState.setState((prev) => ({
      present: {
        ...prev.present,
        paths: [...prev.present.paths, ...newPaths],
        seams: parsedSeams,
      },
    }));
  };

  reader.readAsText(file);
}
