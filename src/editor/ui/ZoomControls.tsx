import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsModal from './SettingsModal';
import ClearCanvasModal from './ClearCanvasModal';
import Icon from './Icon';

interface ZoomControlsProps {
    zoom: number;
    baseZoom?: number;
    onZoomChange: (zoom: number) => void;
    onReset: () => void;
}

export default function ZoomControls({ zoom, baseZoom, onZoomChange, onReset }: ZoomControlsProps) {
    const { t } = useTranslation();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const safeBaseZoom = (typeof baseZoom === 'number' && Number.isFinite(baseZoom) && baseZoom > 0) ? baseZoom : 1;
    const zoomPct = (zoom / safeBaseZoom) * 100;

    return (
        <>
            <div className="fixed bottom-4 right-4 bg-white p-3 rounded-md shadow-lg flex items-center gap-2 z-[2000] min-w-[250px]">

                <label className="text-sm font-medium">{t('common.zoom')}:</label>
                <input
                    type="range"
                    min={0.05}
                    max={20}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                    className="flex-1"
                />
                <span className="text-sm w-10 text-right">{zoomPct.toFixed(0)}%</span>
                <button
                    onClick={onReset}
                    className="ml-2 text-sm px-2 py-1 cursor-pointer"
                    title={t('zoomControls.resetZoom')}
                >
                    <Icon src="/svg/reset.svg" className="h-5 w-5" />
                </button>
                <button
                    onClick={() => setShowClearModal(true)}
                    className="ml-2 text-sm px-2 py-1 text-red-500 cursor-pointer"
                    title={t('zoomControls.clearSavedCanvas')}
                >
                    <Icon src="/svg/delete.svg" className="h-5 w-5" />
                </button>
                <button
                    onClick={() => setSettingsOpen(true)}
                    className="ml-2 text-sm px-2 py-1 cursor-pointer"
                    title={t('common.settings')}
                >
                    <Icon src="/svg/settings.svg" className="h-5 w-5" />
                </button>
            </div>

            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <ClearCanvasModal open={showClearModal} onClose={() => setShowClearModal(false)} />
        </>
    );
}
