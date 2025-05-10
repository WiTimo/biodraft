import { useCanvasState } from '../state/CanvasState';

export function exportToJson() {
  const { paths, seams } = useCanvasState.getState().present;

  const exportData = paths.map((path) => ({
    id: path.id,
    transform3D: {
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    points: path.points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      handleIn: { dx: p.handleIn.dx, dy: p.handleIn.dy },
      handleOut: { dx: p.handleOut.dx, dy: p.handleOut.dy },
    })),
    closed: path.closed,
  }));

  const blob = new Blob(
    [JSON.stringify({ patterns: exportData, seams }, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patterns_with_seams.json';
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
