import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  id: string;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
  shortcut?: string;
  group?: string; // Optional group identifier for visual grouping logic if needed
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or escape
  useEffect(() => {
    const handleDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', handleDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay in viewport
  // We use inline styles for position.
  // Since we might not know height immediately, simple viewport checking is nice.
  // But usually x,y from mouse event is enough. We can add simple clamp logic.
  
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[200px] rounded-lg border border-gray-200 bg-white/95 backdrop-blur-sm shadow-xl py-1 text-sm text-gray-800 select-none"
      onContextMenu={(e) => e.preventDefault()} // Prevent browser menu on our menu
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="my-1 border-t border-gray-200" />;
        }

        return (
          <div
            key={item.id}
            className={`
              px-3 py-1.5 flex items-center justify-between cursor-pointer
              ${item.disabled 
                ? 'text-gray-400 cursor-not-allowed' 
                : 'hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100'
              }
            `}
            onClick={(e) => {
              if (item.disabled) {
                e.stopPropagation();
                return;
              }
              item.onClick?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-xs text-gray-400">{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
