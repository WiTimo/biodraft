import { useMemo, useRef } from 'react';

import { useCanvasState } from '../state/CanvasState';
import type { BackgroundImage, PathTexture } from '../state/types';
import Icon from './Icon';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="number"
      className={
        "w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm " +
        "focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      }
    />
  );
}

function RangeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="range"
      className="w-full accent-blue-600"
    />
  );
}

export function InspectorPanel() {
  const present = useCanvasState((s) => s.present);
  const currentTool = useCanvasState((s) => s.currentTool);

  const selectedBackgroundId = useCanvasState((s) => s.selectedBackgroundId);
  const textureInspectPathId = useCanvasState((s) => s.textureInspectPathId);

  const saveState = useCanvasState((s) => s.saveState);
  const updateBackgroundImageTransform = useCanvasState((s) => s.updateBackgroundImageTransform);
  const moveBackgroundImage = useCanvasState((s) => s.moveBackgroundImage);

  const updateTextureForPathLive = useCanvasState((s) => s.updateTextureForPathLive);
  const setTextureForPath = useCanvasState((s) => s.setTextureForPath);
  const clearTextureForPath = useCanvasState((s) => s.clearTextureForPath);

  const selectedImage: BackgroundImage | null = useMemo(() => {
    if (!selectedBackgroundId) return null;
    return present.backgroundImages.find((img) => img.id === selectedBackgroundId) ?? null;
  }, [present.backgroundImages, selectedBackgroundId]);

  const texturePath = useMemo(() => {
    if (!textureInspectPathId) return null;
    return present.paths.find((p) => p.id === textureInspectPathId) ?? null;
  }, [present.paths, textureInspectPathId]);

  const texture = useMemo(() => {
    if (!texturePath?.texture) return null;
    return texturePath.texture as PathTexture;
  }, [texturePath]);

  const opacityDragActiveRef = useRef(false);
  const textureEditActiveRef = useRef(false);
  const textureFileInputRef = useRef<HTMLInputElement | null>(null);

  const showImage = currentTool === 'background' && !!selectedImage;
  const showTexture = currentTool === 'texture' && !!texturePath;

  // Only show this panel for the two cases the user cares about.
  if (!showImage && !showTexture) return null;

  // Place the panel to the right of the left ruler (24px) with a bit of padding.
  // Using 40px keeps it clear even if the ruler size changes slightly.
  return (
    <div className="absolute bottom-3 left-10 z-[2000] w-[280px]">
      <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur shadow-lg">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">Inspector</div>
          <div className="text-xs text-gray-500">Tool: {currentTool}</div>
        </div>

        <div className="p-3 flex flex-col gap-4">
          {showImage && selectedImage && (
            <div>
              <div className="text-xs font-semibold text-gray-700">Image</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="X">
                  <NumberInput
                    step={10}
                    value={Math.round(selectedImage.x)}
                    onChange={(e) => moveBackgroundImage(selectedImage.id, Number(e.target.value), selectedImage.y)}
                  />
                </Field>
                <Field label="Y">
                  <NumberInput
                    step={10}
                    value={Math.round(selectedImage.y)}
                    onChange={(e) => moveBackgroundImage(selectedImage.id, selectedImage.x, Number(e.target.value))}
                  />
                </Field>

                <Field label="Scale X">
                  <NumberInput
                    step={0.01}
                    min={0}
                    value={Math.round(selectedImage.scaleX * 100) / 100}
                    onChange={(e) =>
                      updateBackgroundImageTransform(selectedImage.id, {
                        scaleX: Number(e.target.value),
                        scaleY: selectedImage.scaleY,
                        rotation: selectedImage.rotation,
                      })
                    }
                  />
                </Field>
                <Field label="Scale Y">
                  <NumberInput
                    step={0.01}
                    min={0}
                    value={Math.round(selectedImage.scaleY * 100) / 100}
                    onChange={(e) =>
                      updateBackgroundImageTransform(selectedImage.id, {
                        scaleX: selectedImage.scaleX,
                        scaleY: Number(e.target.value),
                        rotation: selectedImage.rotation,
                      })
                    }
                  />
                </Field>

                <Field label="Rotation">
                  <NumberInput
                    step={1}
                    value={Math.round(selectedImage.rotation)}
                    onChange={(e) =>
                      updateBackgroundImageTransform(selectedImage.id, {
                        scaleX: selectedImage.scaleX,
                        scaleY: selectedImage.scaleY,
                        rotation: Number(e.target.value),
                      })
                    }
                  />
                </Field>

                <Field label={`Opacity (${Math.round(selectedImage.opacity * 100)}%)`}>
                  <RangeInput
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedImage.opacity}
                    onPointerDown={() => {
                      if (!opacityDragActiveRef.current) {
                        saveState();
                        opacityDragActiveRef.current = true;
                      }
                    }}
                    onPointerUp={() => {
                      opacityDragActiveRef.current = false;
                    }}
                    onChange={(e) => {
                      const nextOpacity = Number(e.target.value);
                      // No dedicated action exists for opacity; update present directly.
                      // We already created a single history snapshot at gesture start.
                      useCanvasState.setState((s) => ({
                        present: {
                          ...s.present,
                          backgroundImages: s.present.backgroundImages.map((img) =>
                            img.id === selectedImage.id ? { ...img, opacity: nextOpacity } : img,
                          ),
                        },
                      }));
                    }}
                  />
                </Field>
              </div>
            </div>
          )}

          {showTexture && texturePath && (
            <div>
              <div className="text-xs font-semibold text-gray-700">Texture</div>
              {texture ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Offset X">
                    <NumberInput
                      step={1}
                      value={Math.round((texture.offsetX ?? 0) * 100) / 100}
                      onFocus={() => {
                        if (!textureEditActiveRef.current) {
                          saveState();
                          textureEditActiveRef.current = true;
                        }
                      }}
                      onBlur={() => {
                        textureEditActiveRef.current = false;
                      }}
                      onChange={(e) => updateTextureForPathLive(texturePath.id, { offsetX: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Offset Y">
                    <NumberInput
                      step={1}
                      value={Math.round((texture.offsetY ?? 0) * 100) / 100}
                      onFocus={() => {
                        if (!textureEditActiveRef.current) {
                          saveState();
                          textureEditActiveRef.current = true;
                        }
                      }}
                      onBlur={() => {
                        textureEditActiveRef.current = false;
                      }}
                      onChange={(e) => updateTextureForPathLive(texturePath.id, { offsetY: Number(e.target.value) })}
                    />
                  </Field>

                  <Field label="Scale X">
                    <NumberInput
                      step={0.01}
                      min={0.01}
                      value={Math.round((texture.scaleX ?? 1) * 100) / 100}
                      onFocus={() => {
                        if (!textureEditActiveRef.current) {
                          saveState();
                          textureEditActiveRef.current = true;
                        }
                      }}
                      onBlur={() => {
                        textureEditActiveRef.current = false;
                      }}
                      onChange={(e) => updateTextureForPathLive(texturePath.id, { scaleX: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Scale Y">
                    <NumberInput
                      step={0.01}
                      min={0.01}
                      value={Math.round((texture.scaleY ?? 1) * 100) / 100}
                      onFocus={() => {
                        if (!textureEditActiveRef.current) {
                          saveState();
                          textureEditActiveRef.current = true;
                        }
                      }}
                      onBlur={() => {
                        textureEditActiveRef.current = false;
                      }}
                      onChange={(e) => updateTextureForPathLive(texturePath.id, { scaleY: Number(e.target.value) })}
                    />
                  </Field>

                  <Field label="Rotation">
                    <NumberInput
                      step={1}
                      value={Math.round((texture.rotation ?? 0) * 100) / 100}
                      onFocus={() => {
                        if (!textureEditActiveRef.current) {
                          saveState();
                          textureEditActiveRef.current = true;
                        }
                      }}
                      onBlur={() => {
                        textureEditActiveRef.current = false;
                      }}
                      onChange={(e) => updateTextureForPathLive(texturePath.id, { rotation: Number(e.target.value) })}
                    />
                  </Field>

                  <Field label="Remove">
                    <button
                      type="button"
                      className="h-[30px] w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                      title="Remove texture"
                      onClick={() => clearTextureForPath(texturePath.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Icon src="/svg/eraser.svg" className="h-4 w-4" />
                        Remove
                      </span>
                    </button>
                  </Field>
                </div>
              ) : (
                <div className="mt-2">
                  <input
                    ref={textureFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = reader.result as string;
                        setTextureForPath(texturePath.id, {
                          src: dataUrl,
                          scaleX: 1,
                          scaleY: 1,
                          offsetX: 0,
                          offsetY: 0,
                          rotation: 0,
                          repeat: 'repeat',
                        });
                      };
                      reader.readAsDataURL(file);
                      // reset so choosing same file again triggers change
                      e.currentTarget.value = '';
                    }}
                  />

                  <button
                    type="button"
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => textureFileInputRef.current?.click()}
                  >
                    Add texture to selected pattern
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
