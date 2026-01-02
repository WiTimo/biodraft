# TechPackEditor

TechPackEditor is a specialized vector-based design tool built for the fashion and apparel industry. It bridges the gap between 2D pattern making and 3D visualization, allowing designers to create technical packs, define seams, apply textures, and visualize garments on a 3D avatar (seperate project).

## Features

*   **2D Vector Editor**:
    *   **Path Drawing**: Create complex shapes using Bezier curves with precise control over points and handles.
    *   **Point Management**: Add, move, and delete points. Support for sharp and smooth (Bezier) nodes.
    *   **Snapping & Precision**: Grid system and ruler guides for accurate drafting.
    *   **Canvas Controls**: Infinite pan and zoom capabilities.
*   **Seam Management**:
    *   Define seams between pattern segments.
    *   Support for partial seams (connecting a portion of one segment to another).
    *   Visual seam allowance configuration.
*   **Texture Mapping**:
    *   Apply textures to closed pattern shapes.
    *   Interactive texture positioning (scale, rotate, move) directly on the canvas.
*   **3D Visualization**:
    *   Integrated 3D viewer to display the garment on a human avatar.
    *   **Biomesh Generation**: Generates custom 3D avatars based on user measurements (height, weight, muscle mass) via a backend render server.
*   **Import / Export**:
    *   **DXF Export**: Industry-standard export for CAD compatibility (supports ASTM/AAMA standards with `SEAM_META` extensions).
    *   **JSON**: Native format for saving and loading project state.

## Tech Stack

### Frontend
*   **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [TailwindCSS](https://tailwindcss.com/)
*   **2D Graphics**: [Konva](https://konvajs.org/) (via [react-konva](https://konvajs.org/docs/react/))
*   **3D Graphics**: [Three.js](https://threejs.org/)
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) (with persistence)
*   **Internationalization**: i18next

### Backend (Render Server)
*   **Runtime**: Node.js (Express)
*   **Rendering Engine**: [Blender](https://www.blender.org/) (5.0+)
*   **Scripting**: Python (bpy) for automated rendering and mesh processing.

## Getting Started

### Prerequisites
*   Node.js (v18+)
*   Blender 5.0+ (for the render server)
*   Python 3 (bundled with Blender)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd TechPackEditor
    ```

2.  **Install Frontend Dependencies**:
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies**:
    ```bash
    cd biomesh-render-server
    npm install
    cd ..
    ```

### Running the Application

1.  **Start the Frontend**:
    ```bash
    npm run dev
    ```
    The editor will be available at `http://localhost:5173`.

2.  **Start the Render Server** (Optional, for 3D avatar generation):
    *   Configure `biomesh-render-server/server.js` with your Blender path (`BLENDER_BIN`).
    *   Run the server:
        ```bash
        cd biomesh-render-server
        npm start
        ```
    The server runs on port `8080`.

## Project Structure

```
TechPackEditor/
├── src/
│   ├── editor/
│   │   ├── Canvas.tsx              # Main editor entry point, handles layout & split view
│   │   ├── components/             # Reusable Konva/React components (lines, points, handles)
│   │   ├── layers/                 # Logical layers of the canvas
│   │   │   ├── GridLayer.tsx       # Background grid rendering
│   │   │   ├── PathsLayer.tsx      # Core logic for drawing paths, seams, and hit detection
│   │   │   ├── PointsLayer.tsx     # Overlay for points and Bezier handles
│   │   │   ├── SeamLayer.tsx       # Visualizes connections between seams
│   │   │   └── ...
│   │   ├── state/                  # Zustand store and logic
│   │   │   ├── CanvasState.ts      # Store composition and persistence config
│   │   │   ├── slices/             # Modular state slices
│   │   │   │   ├── pointSlice.ts   # Point creation, movement, handle logic
│   │   │   │   ├── seamSlice.ts    # Seam logic (segments, portions)
│   │   │   │   ├── pathSlice.ts    # Path management
│   │   │   │   └── ...
│   │   │   └── types.ts            # centralized TypeScript definitions
│   │   ├── ui/                     # UI Panels (Toolbar, Inspector, Settings)
│   │   └── utils/                  # Helpers and Math
│   │       ├── importExport/       # DXF and JSON handlers
│   │       └── ...
│   ├── App.tsx                     # App root
│   └── main.tsx                    # Entry point
├── biomesh-render-server/          # Backend for 3D generation
│   ├── server.js                   # Express server handling /api/jobs
│   └── scripts/
│       └── render_bbox_front_back.py # Blender Python script for rendering
└── ...
```

## Architecture Deep Dive

### State Management (Zustand)
The application state is centralized but modularized using the "slice" pattern.
*   **`CanvasState.ts`**: Combines all slices into a single hook `useCanvasState`. It handles persistence (saving to local storage).
*   **`pointSlice.ts`**: Contains complex logic for Bezier curve manipulation. It handles "handle mirroring" (smooth nodes) vs. broken handles (sharp nodes) and point spawning.
*   **`seamSlice.ts`**: Manages relationships between geometric segments. It supports **partial seams** by storing `tStart` and `tEnd` values (0-1 range) along a Bezier curve segment, allowing seams that don't cover the entire edge.

### Canvas Rendering
The canvas is built with `react-konva`.
*   **Hit Detection**: The `PathsLayer` renders invisible "fill overlays" (slightly expanded paths) to capture mouse events for selection and texturing, ensuring users can interact with thin lines easily.
*   **Layering**:
    1.  **Grid**: Bottom-most reference.
    2.  **Paths/Textures**: The actual patterns.
    3.  **Seams**: Visual indicators of connections.
    4.  **Points/Handles**: Top-most interactive controls.
    5.  **UI Overlays**: Rulers, selection boxes.

### 3D & Backend Pipeline
1.  **User Request**: The user enters body measurements (height, weight, muscle) in the frontend.
2.  **Job Queue**: The frontend posts a job to `biomesh-render-server` (`POST /api/jobs`).
3.  **Biomesh Generation**: The server calls an external API (`biomesh.flussing.com`) to generate a specialized GLB model.
4.  **Blender Processing**:
    *   The server spawns a Blender process using `render_bbox_front_back.py`.
    *   Blender imports the GLB.
    *   It sets up a camera rig and lighting to render "Front" and "Back" orthographic reference images.
    *   It calculates the bounding box of the mesh.
5.  **Result**: The frontend polls for status (SSE) and eventually downloads the images to display as underlays in the 2D editor or textures in the 3D view.

### Import / Export
*   **DXF**: The `exportDxf.ts` utility converts internal Bezier paths into DXF `SPLINE` entities (degree 3) and `LINE` entities. It embeds custom metadata (`SEAM_META`) in DXF comments to preserve seam relationships when re-importing.
*   **JSON**: Dumps the entire Zustand state for full fidelity saves.

## Key Files

*   `src/editor/Canvas.tsx`: The layout manager.
*   `src/editor/layers/PathsLayer.tsx`: The heart of the vector interactions.
*   `src/editor/state/slices/pointSlice.ts`: The geometry engine.
*   `biomesh-render-server/scripts/render_bbox_front_back.py`: The bridge to Blender automation.
