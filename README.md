# BioDraft
 
BioDraft is a technical apparel design editor for creating 2D garment pattern geometry, defining seams, applying textures, and preparing pattern data for downstream 3D visualization workflows.

The project combines a browser-based vector editor with an optional render pipeline for generating visual reference assets. It is built for experimentation around fashion tech, digital product development, and the bridge between 2D technical packs and 3D garment visualization.

## What it does

- Provides a 2D vector editor for garment pattern drafting.
- Supports Bezier path creation with editable points and handles.
- Allows seams to be defined between pattern segments, including partial seam ranges.
- Applies and manipulates textures directly on closed pattern shapes.
- Saves and restores full editor state as JSON.
- Exports pattern data to DXF for CAD-oriented workflows.
- Integrates with a render server for generated visual references.

## Why this project matters

BioDraft demonstrates engineering across frontend graphics, geometry, state management, export formats, and backend automation:

- **Interactive graphics:** complex canvas editing with Konva and React.
- **Geometry logic:** Bezier curves, smooth/sharp nodes, point handles, hit detection, seams, and segment ranges.
- **State architecture:** modular Zustand slices keep drawing, seams, textures, viewport, and editor state maintainable.
- **3D pipeline thinking:** a Node/Express render server launches Blender scripts and handles generated reference output.
- **Industry-oriented output:** DXF export supports CAD-style interoperability and preserves custom seam metadata.

## Core features

### 2D vector pattern editor

- Draw pattern shapes using Bezier curves.
- Move, add, and delete points.
- Use sharp or smooth nodes with handle mirroring.
- Pan and zoom around a large canvas.
- Work against grid and ruler-style drafting aids.

### Seam management

- Connect garment edges and pattern segments.
- Store seam relationships in editor state.
- Support partial seams using normalized curve ranges.
- Visualize seam connections directly on the canvas.

### Texture mapping

- Apply textures to closed shapes.
- Scale, rotate, and move textures interactively.
- Keep texture state inside the saved project model.

### Render pipeline

- Submit generation jobs from the frontend.
- Queue render jobs through the backend server.
- Process generated 3D assets with Blender automation.
- Render front/back orthographic references for use in the editor.

### Import and export

- Save full project state as JSON.
- Export geometry as DXF.
- Preserve seam relationships through custom `SEAM_META` metadata.

## Tech stack

| Area | Technology |
|---|---|
| Frontend framework | React 19 + Vite |
| Language | TypeScript |
| Styling | Tailwind CSS |
| 2D graphics | Konva + React Konva |
| 3D graphics | Three.js |
| State management | Zustand |
| Internationalization | i18next |
| Backend render server | Node.js + Express |
| 3D automation | Blender + Python `bpy` |

## Repository structure

```text
biodraft/
├── src/
│   ├── editor/
│   │   ├── Canvas.tsx                 # Main editor layout and split-view orchestration
│   │   ├── components/                # Reusable canvas components
│   │   ├── layers/                    # Grid, paths, seams, points, overlays
│   │   ├── state/                     # Zustand store and modular state slices
│   │   ├── ui/                        # Toolbar, inspectors, settings panels
│   │   └── utils/                     # Geometry, import/export, helpers
│   ├── App.tsx
│   └── main.tsx
├── biomesh-render-server/
│   ├── server.js                      # Express render job API
│   └── scripts/
│       └── render_bbox_front_back.py  # Blender automation script
├── package.json
└── README.md
```

## Architecture

### Frontend editor

The editor is built around a layered canvas model:

1. Grid layer for spatial reference.
2. Path and texture layer for garment pattern geometry.
3. Seam layer for visualizing relationships between pattern segments.
4. Point and handle layer for precise Bezier editing.
5. UI overlays for selection, rulers, and editor controls.

Thin or complex shapes are made easier to interact with through expanded invisible hit areas, improving usability without changing the rendered design.

### State model

The application uses Zustand with a slice-based architecture. Each editor concern has its own logic boundary:

- `pointSlice.ts` handles point creation, movement, node behavior, and Bezier handles.
- `pathSlice.ts` manages pattern shapes.
- `seamSlice.ts` manages seam relationships and partial seam ranges.
- Import/export utilities serialize and restore the complete design state.

### Backend render server

The optional render server receives jobs, uses Blender automation, and returns generated visual reference files. The frontend can poll for job status and use the resulting assets as references in the editor.

## Getting started

### Prerequisites

- Node.js 18+
- npm
- Blender 5.0+ for the optional render server
- Python 3 through Blender for render automation

### Install dependencies

```bash
npm install
```

Install render-server dependencies:

```bash
cd biomesh-render-server
npm install
cd ..
```

### Run the frontend

```bash
npm run dev
```

The editor runs at:

```text
http://localhost:5173
```

### Run the render server

Configure the Blender executable path in `biomesh-render-server/server.js`, then run:

```bash
cd biomesh-render-server
npm start
```

The render server runs on:

```text
http://localhost:8080
```

## Development commands

```bash
npm run dev      # Start Vite development server
npm run build    # Type-check and build production assets
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## Recruiter notes

BioDraft is a strong portfolio project because it goes beyond standard CRUD/web UI work. It demonstrates interactive canvas engineering, geometric modeling, CAD-style export, state architecture, 3D graphics integration, and backend automation with Blender. The project shows the ability to build specialized tools for a technical domain with real-world workflow constraints.
