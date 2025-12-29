1. Pattern inside a pattern should be on top of the pattern (hirachy), you should be able to select on a pattern that is on top of another pattern to seam it to the pattern underneath it, then you should be able to somehow select which sides you don't want to seam

2. With the select tool when you hover over a pattern it should highlight the borders and when clicking it it should select the whole pattern and make it movable

3. Use industry-standard DXF files for import/export; DXF supports patterns and seams positions. JSON export/import is still available for compatibility.


- **DXF settings moved to config file** (`src/config/dxfConfig.ts`): DXF scale, simplification settings, and seam match tolerance are centrally configured and **no longer** exposed in the toolbar.

- Added **DXF simplification** on import (Ramer–Douglas–Peucker); seam anchors are preserved during simplification so seams remain attached.
- Added SPLINE parsing and approximation: SPLINE entities are now parsed, evaluated with de Boor (supporting weights), and adaptively approximated as cubic Bézier segments while preserving seam anchors. This keeps files accurate while drastically reducing point counts and preserving editable handles.

- Added support for LWPOLYLINE bulge arcs, ARC, and ELLIPSE: these are converted to cubic Bézier segments on import so curves are preserved as editable handles instead of dense straight-line vertices.