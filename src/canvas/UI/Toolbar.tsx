import { CANVAS_SIZE } from '../../util/globals';
import { useCanvasState } from '../state/CanvasState';
import { importFromJson, exportToJson } from '../util/importExport';
import ZoomControls from './ZoomControls';

export function Toolbar() {

    const { currentTool, setTool, setZoom, setOffset, zoom } = useCanvasState()

    const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) {
                    const id = crypto.randomUUID();
                    useCanvasState.getState().addBackgroundImage(reader.result as string, id);
                    // get image dimensions
                    const img = new Image();
                    img.src = reader.result as string;
                    img.onload = () => {
                        const width = img.width;
                        const height = img.height;
                        useCanvasState.getState().moveBackgroundImage(id, window.innerWidth / 2 - width / 2, window.innerHeight / 2 - height / 2);
                    };
                    useCanvasState.getState().setTool('background');
                    useCanvasState.getState().selectBackgroundImage(id);

                    useCanvasState.getState().deselectPoint();
                    useCanvasState.getState().clearSelectedPointIds();
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleZoomChange = (value: number) => {
        setZoom(value);
    };

    const resetZoom = () => {
        setZoom(1);
        setOffset({
            x: 0,
            y: 0,
        });
    };


    return (
        <>
            <div
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white rounded-md p-2 shadow-lg flex flex-col gap-2 z-[2000]"
            >
                <button onClick={() => setTool('select')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "select" ? "#4781e688" : "white" }}>
                    <img src='/svg/pointer.svg' />
                </button>
                <button onClick={() => setTool('pen')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "pen" ? "#4781e688" : "white" }}>
                    <img src='/svg/pen.svg' />
                </button>
                <button onClick={() => setTool('background')} className="h-10 w-10 rounded-md p-1 cursor-pointer border-white border-4" style={{ borderColor: currentTool === "background" ? "#4781e688" : "white" }}>
                    <img src='/svg/background.svg' />
                </button>


                <div className='h-[1px] w-full mt-2 mb-2 bg-gray-600 rounded-full' />

                <label className="h-10 w-10 rounded-md p-1 cursor-pointer">
                    <img src='/svg/image.svg' />
                    <input type="file" accept="image/*" onChange={handleImportImage} className="hidden" />
                </label>

                <label className="h-10 w-10 rounded-md p-1 cursor-pointer">
                    <img src='/svg/import.svg' />
                    <input
                        type="file"
                        accept="application/json"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importFromJson(file);
                        }}
                        className="hidden"
                    />
                </label>

                <button onClick={exportToJson} className="border-none h-10 w-10 rounded-md p-1 cursor-pointer">
                    <img src='/svg/export.svg' />
                </button>

            </div>
            <ZoomControls zoom={zoom} onZoomChange={handleZoomChange} onReset={resetZoom} />
        </>
    );
}
