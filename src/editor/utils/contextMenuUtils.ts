import Konva from 'konva';
import { CanvasState } from '../state/types';
import { useCanvasState } from '../state/CanvasState';
import { ContextMenuItem } from '../ui/ContextMenu';
import { Segment, SegmentSeam } from '../state/types';
import { toast } from '../../ui/toast/toastStore';

export type ContextType =
  | { type: 'CANVAS' }
  | { type: 'PATTERN'; pathId: string }
  | { type: 'SELECTION' }
  | { type: 'SEAM'; seam: SegmentSeam; segment: Segment };

export function resolveContext(stage: Konva.Stage, pointer: { x: number; y: number }, state: CanvasState): ContextType {
  // Convert pointer to world coordinates for bounds checking
  const worldPointer = {
    x: (pointer.x - state.offset.x) / state.zoom,
    y: (pointer.y - state.offset.y) / state.zoom
  };

  // 1. Check if inside SELECTION bounds
  // If there is an active selection, and we click inside it, we treat it as a SELECTION context.
  if (state.selectedPointIds.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasPoints = false;
    
    state.present.paths.forEach(p => {
      p.points.forEach(pt => {
        if (state.selectedPointIds.includes(pt.id)) {
          hasPoints = true;
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        }
      });
    });

    if (hasPoints) {
      // Add padding to make selection hit easier (in world units)
      const padding = 5 / state.zoom; 
      if (worldPointer.x >= minX - padding && worldPointer.x <= maxX + padding &&
          worldPointer.y >= minY - padding && worldPointer.y <= maxY + padding) {
        return { type: 'SELECTION' };
      }
    }
  }

  // 2. Check intersection for Objects
  // stage.getIntersection uses screen coordinates
  const shape = stage.getIntersection(pointer);

  if (!shape) {
    return { type: 'CANVAS' };
  }

  // Check for Seam
  let node: any = shape;
  while (node) {
    if (node.name() === 'seam-segment') {
      return { type: 'SEAM', seam: [] as any, segment: ['', ''] };
    }
    node = node.getParent();
  }

  // Check for Pattern (fill-overlay OR pattern-path)
  node = shape;
  while (node) {
    const name = node.name();
    if (name === 'fill-overlay' || name === 'pattern-path') {
      const id = node.id();
      if (id) {
        return { type: 'PATTERN', pathId: id };
      }
    }
    node = node.getParent();
  }

  return { type: 'CANVAS' };
}

export interface MenuCallbacks {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitScreen: () => void;
  toggleGrid: () => void;
}

// Helper to flip points in place
function flipPoints(pointIds: string[], axis: 'horizontal' | 'vertical') {
  const state = useCanvasState.getState();
  const points: {id: string, x: number, y: number, handleIn: any, handleOut: any}[] = [];
  
  // Gather points
  state.present.paths.forEach(p => {
    p.points.forEach(pt => {
      if (pointIds.includes(pt.id)) {
        points.push(pt);
      }
    });
  });
  
  if (points.length === 0) return;

  // Calculate center
  let min = Infinity, max = -Infinity;
  points.forEach(p => {
    const val = axis === 'horizontal' ? p.x : p.y;
    min = Math.min(min, val);
    max = Math.max(max, val);
  });
  const center = (min + max) / 2;

  // Create updates
  const updates = points.map(p => {
    if (axis === 'horizontal') {
      return {
        id: p.id,
        x: center - (p.x - center),
        handleIn: { dx: -p.handleIn.dx, dy: p.handleIn.dy },
        handleOut: { dx: -p.handleOut.dx, dy: p.handleOut.dy }
      };
    } else {
      return {
        id: p.id,
        y: center - (p.y - center),
        handleIn: { dx: p.handleIn.dx, dy: -p.handleIn.dy },
        handleOut: { dx: p.handleOut.dx, dy: -p.handleOut.dy }
      };
    }
  });

  state.updatePointsBatch(updates);
}

// Helper to duplicate and then flip
function mirrorPoints(pointIds: string[], axis: 'horizontal' | 'vertical') {
  const state = useCanvasState.getState();
  // 1. Select the points
  state.setSelectedPointIds(pointIds);
  // 2. Copy
  state.copySelectedPoints();
  // 3. Paste (this selects the new points)
  state.pasteClipboardPoints();
  
  // 4. Flip the NEW selection
  // Re-fetch state to get the newly selected IDs from paste action
  const newState = useCanvasState.getState();
  const newSelection = newState.selectedPointIds;
  
  flipPoints(newSelection, axis);
}

export function getMenuItems(
  context: ContextType,
  _initialState: CanvasState, // kept for signature compatibility but ignored in async handlers
  callbacks: MenuCallbacks
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  // Common Transform Actions
  const addTransformActions = (targetPointIds: string[]) => {
    items.push(
      { id: 'sep-trans-1', separator: true },
      { id: 'flip-h', label: 'Flip Horizontally', onClick: () => flipPoints(targetPointIds, 'horizontal') },
      { id: 'flip-v', label: 'Flip Vertically', onClick: () => flipPoints(targetPointIds, 'vertical') },
      { id: 'mirror-h', label: 'Mirror Horizontally', onClick: () => mirrorPoints(targetPointIds, 'horizontal') },
      { id: 'mirror-v', label: 'Mirror Vertically', onClick: () => mirrorPoints(targetPointIds, 'vertical') },
      { id: 'rotate', label: 'Rotate 90° CW', onClick: () => {
         const state = useCanvasState.getState();
         let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
         const points: any[] = [];
         state.present.paths.forEach(p => p.points.forEach(pt => {
             if(targetPointIds.includes(pt.id)) {
                 points.push(pt);
                 minX = Math.min(minX, pt.x);
                 maxX = Math.max(maxX, pt.x);
                 minY = Math.min(minY, pt.y);
                 maxY = Math.max(maxY, pt.y);
             }
         }));
         const cx = (minX + maxX) / 2;
         const cy = (minY + maxY) / 2;

         const updates = points.map(p => {
           const dx = p.x - cx;
           const dy = p.y - cy;
           return {
             id: p.id,
             x: cx - dy,
             y: cy + dx,
             handleIn: { dx: -p.handleIn.dy, dy: p.handleIn.dx },
             handleOut: { dx: -p.handleOut.dy, dy: p.handleOut.dx }
           };
         });
         state.updatePointsBatch(updates);
      }}
    );
  };

  if (context.type === 'CANVAS') {
    const state = useCanvasState.getState();
    items.push(
      { id: 'paste', label: 'Paste', onClick: () => useCanvasState.getState().pasteClipboardPoints(), disabled: !state.clipboard },
      { id: 'sep1', separator: true },
      { id: 'sel-all', label: 'Select All Patterns', onClick: () => {
         const s = useCanvasState.getState();
         const allIds = s.present.paths.flatMap(p => p.points.map(pt => pt.id));
         s.setSelectedPointIds(allIds);
      }},
      { id: 'desel-all', label: 'Deselect All', onClick: () => useCanvasState.getState().clearSelectedPointIds(), disabled: state.selectedPointIds.length === 0 },
      { id: 'sep2', separator: true },
             { id: 'add-pat', label: 'Add New Pattern', onClick: () => toast.info('Use the Pen tool to create patterns') },
             { id: 'import', label: 'Import / Load JSON', onClick: () => toast.info('Import coming soon') },
      { id: 'sep3', separator: true },
      { id: 'reset-view', label: 'Reset View', onClick: callbacks.resetView },
      { id: 'zoom-in', label: 'Zoom In', onClick: callbacks.zoomIn },
      { id: 'zoom-out', label: 'Zoom Out', onClick: callbacks.zoomOut },
      { id: 'fit-screen', label: 'Fit All to Screen', onClick: callbacks.fitScreen },
      { id: 'tog-grid', label: `Toggle Grid (${state.gridEnabled ? 'On' : 'Off'})`, onClick: callbacks.toggleGrid },
    );
  } else if (context.type === 'PATTERN') {
    const state = useCanvasState.getState();
    const path = state.present.paths.find(p => p.id === context.pathId);
    const targetIds = path ? path.points.map(p => p.id) : [];

    // Put copy/paste pattern-value actions at the top
    items.push(
      { id: 'copy-values', label: 'Copy Values', onClick: () => {
         if(path) {
            useCanvasState.getState().copyPatternValues(path.id);
                   toast.success('Pattern values copied');
         }
      }},
      { id: 'paste-front', label: 'Paste Front', onClick: () => {
         const s = useCanvasState.getState();
         if(path && s.patternClipboard) {
            s.pastePatternValues(path.id, 'front');
         }
      }, disabled: !useCanvasState.getState().patternClipboard},
      { id: 'paste-back', label: 'Paste Back', onClick: () => {
         const s = useCanvasState.getState();
         if(path && s.patternClipboard) {
            s.pastePatternValues(path.id, 'back');
         }
      }, disabled: !useCanvasState.getState().patternClipboard},
      { id: 'sep-top', separator: true },
    );

    items.push(
      { id: 'dup', label: 'Duplicate Pattern', onClick: () => {
        const s = useCanvasState.getState();
        s.setSelectedPointIds(targetIds);
        s.copySelectedPoints();
        s.pasteClipboardPoints();
      }},
      { id: 'del', label: 'Delete Pattern', onClick: () => {
         const s = useCanvasState.getState();
         s.setSelectedPointIds(targetIds);
         s.deleteSelectedPoints();
      }},
             { id: 'rename', label: 'Rename Pattern', onClick: () => toast.info('Rename coming soon') },
    );
    
    addTransformActions(targetIds);

    items.push(
      { id: 'sep2', separator: true },
      { id: 'export', label: 'Copy as JSON', onClick: () => {
         if(path) {
                    navigator.clipboard
                      .writeText(JSON.stringify(path, null, 2))
                      .then(() => toast.success('Pattern JSON copied to clipboard'))
                      .catch(() => toast.error('Could not copy JSON to clipboard'));
         }
      }},
    );
  } else if (context.type === 'SELECTION') {
      const state = useCanvasState.getState();
      const targetIds = state.selectedPointIds;

      // Detect if selection is exactly one full pattern (all points of a single path)
      const matchingPaths = state.present.paths.filter((p) => p.points.every(pt => targetIds.includes(pt.id)) && p.points.length > 0);
      const singleFullPath = matchingPaths.length === 1 ? matchingPaths[0] : null;

      // If selection corresponds to a single pattern, expose Copy Values / Paste Front / Paste Back at the top
      if (singleFullPath) {
        items.push(
          { id: 'copy-values', label: 'Copy Values', onClick: () => {
            useCanvasState.getState().copyPatternValues(singleFullPath.id);
               toast.success('Pattern values copied');
          }},
          { id: 'paste-front', label: 'Paste Front', onClick: () => {
            const s = useCanvasState.getState();
            if (s.patternClipboard) s.pastePatternValues(singleFullPath.id, 'front');
          }, disabled: !useCanvasState.getState().patternClipboard},
          { id: 'paste-back', label: 'Paste Back', onClick: () => {
            const s = useCanvasState.getState();
            if (s.patternClipboard) s.pastePatternValues(singleFullPath.id, 'back');
          }, disabled: !useCanvasState.getState().patternClipboard},
          { id: 'sep-top', separator: true }
        );
      }
      
      items.push(
          { id: 'dup-sel', label: 'Duplicate Selection', onClick: () => {
            const s = useCanvasState.getState();
            s.copySelectedPoints();
            s.pasteClipboardPoints();
          }},
          { id: 'del-sel', label: 'Delete Selection', onClick: () => useCanvasState.getState().deleteSelectedPoints() },
      );
      
      addTransformActions(targetIds);
      
      items.push(
          { id: 'sep-sel', separator: true },
          { id: 'desel', label: 'Deselect', onClick: () => useCanvasState.getState().clearSelectedPointIds() }
      );

  } else if (context.type === 'SEAM') {
    items.push(
             { id: 'sel-seam', label: 'Select Seam Segment', onClick: () => toast.info('Select seam coming soon') },
             { id: 'remove-seam', label: 'Remove Seam', onClick: () => toast.info('Remove seam via selection/delete key for now') },
             { id: 'flip-seam', label: 'Flip Seam Mapping', onClick: () => toast.info('Flip seam coming soon') },
             { id: 'props', label: 'Seam Properties', onClick: () => toast.info('Seam properties coming soon') }
    );
  }

  return items;
}
