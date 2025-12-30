import { useCanvasState } from '../state/CanvasState';

export function TextureTransformPanel() {
  // Show controls for the first fully-selected path that has a texture
  const selectedIds = useCanvasState((s) => s.selectedPointIds);
  const paths = useCanvasState((s) => s.present.paths);
  const updateTextureForPath = useCanvasState((s) => s.updateTextureForPath);

  // find a path that is fully selected
  const selectedSet = new Set(selectedIds);
  const pathWithTexture = paths.find((p) => p.points.length > 0 && p.points.every((pt) => selectedSet.has(pt.id) ) && p.texture);

  if (!pathWithTexture) return null;

  const texture = pathWithTexture.texture || { src: '' };

  const handleChange = (field: string, value: number | string) => {
    // update the texture for this path
    if (field === 'offsetX' || field === 'offsetY' || field === 'rotation' || field === 'scaleX' || field === 'scaleY') {
      updateTextureForPath(pathWithTexture.id, { [field]: Number(value) } as any);
    }
  };

  return (
    <div className="absolute bottom-2.5 left-2.5 p-3 rounded-lg shadow-xl bg-white z-2000 min-w-[200px]">
      <h4 className='text-lg font-semibold'>Texture Settings</h4>

      <div style={{ margin: '6px 0' }}>
        <label style={{ display: 'block', fontSize: '0.9em' }}>offsetX</label>
        <input type="number" step="1" value={Math.round((texture.offsetX ?? 0) * 100) / 100} onChange={(e) => handleChange('offsetX', parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div style={{ margin: '6px 0' }}>
        <label style={{ display: 'block', fontSize: '0.9em' }}>offsetY</label>
        <input type="number" step="1" value={Math.round((texture.offsetY ?? 0) * 100) / 100} onChange={(e) => handleChange('offsetY', parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div style={{ margin: '6px 0' }}>
        <label style={{ display: 'block', fontSize: '0.9em' }}>scaleX</label>
        <input type="number" step="0.01" min={0.01} value={Math.round((texture.scaleX ?? 1) * 100) / 100} onChange={(e) => handleChange('scaleX', parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div style={{ margin: '6px 0' }}>
        <label style={{ display: 'block', fontSize: '0.9em' }}>scaleY</label>
        <input type="number" step="0.01" min={0.01} value={Math.round((texture.scaleY ?? 1) * 100) / 100} onChange={(e) => handleChange('scaleY', parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div style={{ margin: '6px 0' }}>
        <label style={{ display: 'block', fontSize: '0.9em' }}>rotation</label>
        <input type="number" step="1" value={Math.round((texture.rotation ?? 0) * 100) / 100} onChange={(e) => handleChange('rotation', parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
