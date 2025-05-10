import { useCanvasState } from '../state/CanvasState';
import { LinePath } from '../Paths/LinePath';
import { useMemo, useRef } from 'react';

function getRandomColor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 100%, 60%)`;
}

export function PathsLayer() {
    const paths = useCanvasState(s => s.present.paths);
    const seams = useCanvasState(s => s.present.seams || []);
    const currentTool = useCanvasState(s => s.currentTool);
    const addSeam = useCanvasState(s => s.addPathSeam);
    const seamSelection = useRef<string[]>([]);

    const handlePathClick = (pathId: string) => {
        if (currentTool !== 'seam') return;
        if (seamSelection.current.length >= 2) {
            seamSelection.current = [];
        }

        seamSelection.current.push(pathId);

        if (seamSelection.current.length === 2) {
            const [id1, id2] = seamSelection.current;
            addSeam(id1, id2);
            seamSelection.current = [];
        }
    };

    // 🟡 Map path ID → color from seam list
    const seamColorMap = useMemo(() => {
        const map = new Map<string, string>();
        seams.forEach(([id1, id2]) => {
            const color = getRandomColor(id1 + id2);
            map.set(id1, color);
            map.set(id2, color);
        });
        return map;
    }, [seams]);

    return (
        <>
            {paths.map((path) => (
                <LinePath
                    key={path.id}
                    points={path.points}
                    closed={path.closed}
                    onClick={() => handlePathClick(path.id)}
                    stroke={seamColorMap.get(path.id) || 'black'}
                />
            ))}
        </>
    );
}
