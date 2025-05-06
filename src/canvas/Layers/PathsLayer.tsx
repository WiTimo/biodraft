import { LinePath } from '../Paths/LinePath';
import { useCanvasState } from '../state/CanvasState';

export function PathsLayer() {
    const paths = useCanvasState((s) => s.present.paths);

    return (
        <>
            {paths.map((path) => {
                return (
                    <LinePath key={path.id} points={path.points} closed={path.closed} />
                );
            })}
        </>
    );
}