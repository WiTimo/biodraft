import { useCanvasState } from '../state/CanvasState';

export function ImageTransformPanel() {
    const selectedId = useCanvasState((s) => s.selectedBackgroundId);
    const image = useCanvasState((s) =>
        s.present.backgroundImages.find((img) => img.id === selectedId)
    );

    const update = useCanvasState.getState();

    if (!image) return null;

    const handleChange = (field: string, value: number) => {
        if (field === 'x' || field === 'y') {
            update.moveBackgroundImage(image.id, field === 'x' ? value : image.x, field === 'y' ? value : image.y);
        } else if (field === 'opacity') {
            update.updateBackgroundImageFullTransform(image.id, {
                x: image.x,
                y: image.y,
                scaleX: image.scaleX,
                scaleY: image.scaleY,
                rotation: image.rotation,
            });
            const updatedImages = useCanvasState.getState().present.backgroundImages.map((img) =>
                img.id === image.id ? { ...img, opacity: value } : img
            );
            useCanvasState.setState((state) => ({
                present: { ...state.present, backgroundImages: updatedImages }
            }));
        } else {
            update.updateBackgroundImageTransform(image.id, {
                scaleX: field === 'scaleX' ? value : image.scaleX,
                scaleY: field === 'scaleY' ? value : image.scaleY,
                rotation: field === 'rotation' ? value : image.rotation,
            });
        }
    };

    return (
        <div className="absolute top-2.5 left-2.5 p-3 rounded-lg shadow-xl bg-white z-2000 min-w-[200px]">
            <h4 className='text-lg font-semibold'>Image Settings</h4>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>x</label>
                <input
                    type="number"
                    step="10"
                    value={Math.round(image.x)}
                    onChange={(e) => handleChange('x', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>y</label>
                <input
                    type="number"
                    step="10"
                    value={Math.round(image.y)}
                    onChange={(e) => handleChange('y', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>scaleX</label>
                <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={Math.round(image.scaleX * 100) / 100}
                    onChange={(e) => handleChange('scaleX', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>scaleY</label>
                <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={Math.round(image.scaleY * 100) / 100}
                    onChange={(e) => handleChange('scaleY', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>rotation</label>
                <input
                    type="number"
                    step="1"
                    value={Math.round(image.rotation)}
                    onChange={(e) => handleChange('rotation', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ margin: '6px 0' }}>
                <label style={{ display: 'block', fontSize: '0.9em' }}>opacity</label>
                <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={image.opacity}
                    onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>
        </div>

    );
}
