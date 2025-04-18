import { Stage } from "konva/lib/Stage";
import { useRef, useState } from "react";

export function usePanZoom() {
    const stageRef = useRef<Stage>(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const scaleBy = 1.05;
        const oldScale = scale;
        const pointer = stageRef.current!.getPointerPosition()!;
        const mousePointTo = {
            x: (pointer.x - position.x) / oldScale,
            y: (pointer.y - position.y) / oldScale,
        };
        const direction = e.evt.deltaY > 0 ? 1 : -1;
        const newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        setScale(newScale);
        setPosition(newPos);
    };

    return { stageRef, scale, position, setPosition, handleWheel };
}