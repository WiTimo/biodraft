Developer notes - Canvas feature refactor ✅

- The canvas feature has been moved to `src/features/canvas` to improve readability, separation of concerns, and future expandability.
- To avoid breaking existing imports immediately, a compatibility re-export exists at `src/canvas/Canvas.tsx` and `src/canvas/index.ts`.
- Preferred import path going forward: `import { Canvas } from 'src/features/canvas'` or from the feature index: `import { Canvas } from './features/canvas'`.
- Next actions (optional):
  - After review, remove old files under `src/canvas` and update any remaining imports to use `src/features/canvas` directly.
  - Update documentation and developer onboarding notes to reflect the new layout.

Notes:
- I ran a full TypeScript build (vite build) — it succeeded.
- I started the dev server (Vite) — it started on http://localhost:4901 (port 4900 was in use, so it fell back to 4901).
- I also added the new `src/features/canvas/Previews/PenSegmentPreview.tsx` to address a missing import used during development.

If you'd like, I can also:
- Run a small automated UI smoke test (headless) to verify canvas interactions.
- Remove old files under `src/canvas` with `git rm` if you want the repo to only contain the new structure.
