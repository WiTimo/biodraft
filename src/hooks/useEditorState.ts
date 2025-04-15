// src/hooks/useEditorState.ts
import { useState, useRef } from 'react';

export default function useEditorState() {
    const [stageScale, setStageScale] = useState<number>(1);
    const [stagePosition, setStagePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const stageRef = useRef<any>(null);

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        const scaleBy = 1.05;
        const oldScale = stageScale;
        const pointer = stageRef.current.getPointerPosition();
        const mousePointTo = {
            x: (pointer.x - stagePosition.x) / oldScale,
            y: (pointer.y - stagePosition.y) / oldScale,
        };
        const direction = e.evt.deltaY > 0 ? 1 : -1;
        const newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        setStageScale(newScale);
        setStagePosition(newPos);
    };

    return { stageScale, setStageScale, stagePosition, setStagePosition, handleWheel, stageRef };
}