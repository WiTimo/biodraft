import { useCanvasState } from '../../../state/CanvasState';
import { evaluateBezier, seamsEqual } from '../../../state/utils';
import type { Segment, SegmentPortion } from '../../../state/types';
import { arcToBeziers, bulgeToBeziers, ellipseToBeziers } from '../geometry/bezierFromCad';
import { simplifyWithPreserve } from '../geometry/rdp';

type DxfPolyline = { layer: string; vertices: { x: number; y: number }[]; closed: boolean };

type SeamLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  meta: string | null;
};

type SeamMeta = { idx: number; part: 'start' | 'end' | 'mid' };

function parseSeamMeta(meta: string | null): SeamMeta | null {
  if (!meta) return null;
  const m = /^SEAM_META:idx=(\d+):part=(start|end|mid)$/.exec(meta.trim());
  if (!m) return null;
  return { idx: Number(m[1]), part: m[2] as SeamMeta['part'] };
}

/**
 * Minimal DXF import that understands the DXF we export:
 * - POLYLINE/VERTEX
 * - SPLINE (as control-point based spline)
 * - LWPOLYLINE (bulge arcs)
 * - ARC
 * - ELLIPSE
 * - LINE (as seam hints)
 */
export function importFromDxf(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    if (!reader.result) return;

    const isDebug = import.meta.env.MODE !== 'production';

    const text = reader.result as string;
    const rawLines = text.split(/\r?\n/).map((l) => l.trim());

    const stateScale = useCanvasState.getState().dxfScale ?? 1;

    const { polylines, seamLines } = parseEntities(rawLines, stateScale);

    // Debug: show parsed DXF counts
    if (isDebug) {
      console.debug('[DXF import] parsed polylines:', polylines.length, 'seamLines:', seamLines.length, 'stateScale:', stateScale);
      console.debug('[DXF import] seamLines sample:', seamLines.slice(0, 10));
    }

    // Optionally simplify polylines to reduce dense point clouds (RDP), preserving seam anchors
    const simplifyTolerance = useCanvasState.getState().dxfSimplifyTolerance ?? 2;

    simplifyAndAnnotatePolylines(polylines, seamLines, simplifyTolerance);

    const newPaths = buildPathsFromPolylines(polylines, seamLines, simplifyTolerance);

    const newSeams = matchSeamsToPaths(newPaths, seamLines);

    // Commit to state (deduplicate seams against existing ones)
    const existingSeams = useCanvasState.getState().present.seams;
    const mergedSeams: any[] = [...existingSeams];
    for (const ns of newSeams) {
      const exists = mergedSeams.some((es) => seamsEqual(es, ns));
      if (!exists) mergedSeams.push(ns);
    }

    useCanvasState.setState((prev) => ({
      present: {
        ...prev.present,
        paths: [...prev.present.paths, ...newPaths],
        seams: mergedSeams,
      },
    }));
  };

  reader.readAsText(file);
}

function parseEntities(lines: string[], stateScale: number): { polylines: any[]; seamLines: SeamLine[] } {
  const polylines: any[] = [];
  const seamLines: SeamLine[] = [];

  // Our exporter writes pattern geometry as a sequence of LINE/SPLINE entities on layer `PATTERN_<id>_<side>`.
  // To preserve continuity (and avoid “holes”), we group those segments per layer and rebuild a single bezierSegments chain.
  const patternSegmentsByLayer = new Map<
    string,
    { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }[]
  >();

  const isPatternLayer = (layer: string) => /^PATTERN_.+_(front|back)$/.test(layer);
  const pushPatternBezier = (
    layer: string,
    seg: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number } }
  ) => {
    const list = patternSegmentsByLayer.get(layer);
    if (list) list.push(seg);
    else patternSegmentsByLayer.set(layer, [seg]);
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  let i = 0;
  while (i < lines.length) {
    const code = lines[i++] || '';
    const value = lines[i++] || '';

    if (code === '0' && value === 'POLYLINE') {
      let layer = '0';
      let closed = false;
      const vertices: { x: number; y: number }[] = [];

      // read block until SEQEND
      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0' && v === 'SEQEND') break;
        if (c === '8') layer = v;
        if (c === '70') closed = v === '1';
        if (c === '0' && v === 'VERTEX') {
          let vx = 0,
            vy = 0;
          // read vertex's group pairs until next 0 or group
          while (i < lines.length) {
            const cc = lines[i++] || '';
            const vv = lines[i++] || '';
            if (cc === '0') {
              i -= 2;
              break;
            }
            if (cc === '10') vx = Number(vv);
            if (cc === '20') vy = Number(vv);
          }
          // convert from file units to editor units by dividing by scale
          vertices.push({ x: vx / stateScale, y: vy / stateScale });
        }
      }

      polylines.push({ layer, vertices, closed } satisfies DxfPolyline);
      continue;
    }

    if (code === '0' && value === 'SPLINE') {
      // parse spline entity: collect degree, control points, knots, weights
      let degree = 3;
      const ctrlPts: { x: number; y: number }[] = [];
      const knots: number[] = [];
      const weights: number[] = [];
      let closed = false;
      let layer = '0';

      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0') {
          i -= 2;
          break;
        }
        // basic codes: 71 = degree, 10/20 = control point, 40 = knot, 41 = weight, 70 flags
        if (c === '8') layer = v;
        if (c === '71') degree = Number(v);
        if (c === '70') {
          const flags = Number(v);
          closed = !!(flags & 1); // spline closed flag in some DXF versions
        }
        if (c === '10') {
          const x = Number(v);
          // next expected is 20
          const cc = lines[i++] || '';
          const vv = lines[i++] || '';
          if (cc === '20') {
            const y = Number(vv);
            ctrlPts.push({ x: x / stateScale, y: y / stateScale });
          } else {
            // unexpected, backtrack
            i -= 2;
          }
        }
        if (c === '40') knots.push(Number(v));
        if (c === '41') weights.push(Number(v));
      }

      // Fast-path: our exporter writes each cubic Bezier segment as a single degree-3 SPLINE
      // with 4 control points and a fixed knot vector [0,0,0,0,1,1,1,1].
      if (
        isPatternLayer(layer) &&
        degree === 3 &&
        ctrlPts.length === 4 &&
        knots.length === 8 &&
        knots.slice(0, 4).every((k) => k === 0) &&
        knots.slice(4).every((k) => k === 1)
      ) {
        pushPatternBezier(layer, {
          p0: ctrlPts[0],
          p1: ctrlPts[1],
          p2: ctrlPts[2],
          p3: ctrlPts[3],
        });
      } else {
        const poly: any = { layer, vertices: [], closed };
        poly.spline = { degree, ctrlPts, knots, weights };
        polylines.push(poly);
      }
      continue;
    }

    if (code === '0' && value === 'LWPOLYLINE') {
      // lightweight polyline with optional bulge (arc) per vertex
      const verts: { x: number; y: number; bulge?: number }[] = [];
      let closed = false;
      // LWPOLYLINE encodes vertices as repeating 10/20 and optional 42 for bulge
      let expectVertex: { x?: number; y?: number; bulge?: number } | null = null;
      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0') {
          i -= 2;
          break;
        }
        if (c === '70') {
          const flags = Number(v);
          closed = !!(flags & 1);
        }
        if (c === '10' || c === '20') {
          // start or continue a vertex
          if (!expectVertex) expectVertex = {};
          if (c === '10') expectVertex.x = Number(v) / stateScale;
          if (c === '20') expectVertex.y = Number(v) / stateScale;
          // if we have both push
          if (expectVertex.x !== undefined && expectVertex.y !== undefined) {
            verts.push({ x: expectVertex.x, y: expectVertex.y, bulge: expectVertex.bulge });
            expectVertex = null;
          }
        }
        if (c === '42') {
          if (!expectVertex) expectVertex = {};
          expectVertex.bulge = Number(v);
        }
      }

      // convert bulges to bezier segments appended to a new poly structure
      const bezSegments: any[] = [];
      for (let vi = 0; vi < verts.length; vi++) {
        const a = verts[vi];
        const b = verts[(vi + 1) % verts.length];
        const isLast = vi === verts.length - 1;
        if (a.bulge && Math.abs(a.bulge) > 1e-6) {
          // convert bulge for arc from a to b
          const segs = bulgeToBeziers(a, b, !!(closed && isLast));
          for (const s of segs) bezSegments.push(s);
        } else {
          // straight segment; represent as degenerate bezier
          bezSegments.push({
            p0: { x: a.x, y: a.y },
            p1: { x: (a.x * 2 + b.x) / 3, y: (a.y * 2 + b.y) / 3 },
            p2: { x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3 },
            p3: { x: b.x, y: b.y },
          });
        }
      }

      polylines.push({ layer: `PATTERN_lwp`, vertices: [], closed, bezierSegments: bezSegments });
      continue;
    }

    if (code === '0' && value === 'ARC') {
      // ARC: center (10/20), radius (40), start angle (50), end angle (51)
      let cx = 0,
        cy = 0,
        r = 0,
        startA = 0,
        endA = 0;
      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0') {
          i -= 2;
          break;
        }
        if (c === '10') cx = Number(v) / stateScale;
        if (c === '20') cy = Number(v) / stateScale;
        if (c === '40') r = Number(v) / stateScale;
        if (c === '50') startA = Number(v) * (Math.PI / 180);
        if (c === '51') endA = Number(v) * (Math.PI / 180);
      }
      // convert arc to bezier segments (one or more)
      const segs = arcToBeziers({ x: cx, y: cy }, r, startA, endA);
      polylines.push({ layer: `PATTERN_arc`, vertices: [], closed: false, bezierSegments: segs });
      continue;
    }

    if (code === '0' && value === 'ELLIPSE') {
      // ELLIPSE parsing (approximated via sampling to bezier)
      let cx = 0,
        cy = 0,
        ax = 1,
        ay = 0,
        ratio = 1,
        startParam = 0,
        endParam = 2 * Math.PI;
      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0') {
          i -= 2;
          break;
        }
        if (c === '10') cx = Number(v) / stateScale;
        if (c === '20') cy = Number(v) / stateScale;
        if (c === '11') ax = Number(v) / stateScale;
        if (c === '21') ay = Number(v) / stateScale;
        if (c === '40') ratio = Number(v); // ratio of minor axis to major
        if (c === '41') startParam = Number(v);
        if (c === '42') endParam = Number(v);
      }
      // sample ellipse into bezier segments
      const segs = ellipseToBeziers({ x: cx, y: cy }, { x: ax, y: ay }, ratio, startParam, endParam);
      polylines.push({ layer: `PATTERN_ellipse`, vertices: [], closed: false, bezierSegments: segs });
      continue;
    }

    if (code === '0' && value === 'LINE') {
      let x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0,
        layer = '0';
      let meta: string | null = null;
      // read properties of line
      while (i < lines.length) {
        const c = lines[i++] || '';
        const v = lines[i++] || '';
        if (c === '0') {
          i -= 2;
          break;
        }
        if (c === '10') x1 = Number(v);
        if (c === '20') y1 = Number(v);
        if (c === '11') x2 = Number(v);
        if (c === '21') y2 = Number(v);
        if (c === '8') layer = v;
        if (c === '999') meta = v;
      }
      // convert to editor units
      // Seams are exported as LINE on layer SEAMS (with optional SEAM_META).
      // Pattern geometry is also exported as LINE on PATTERN_* layers.
      const seamMeta = parseSeamMeta(meta);
      if (layer === 'SEAMS' || seamMeta) {
        seamLines.push({
          x1: x1 / stateScale,
          y1: y1 / stateScale,
          x2: x2 / stateScale,
          y2: y2 / stateScale,
          layer,
          meta,
        });
      } else if (isPatternLayer(layer)) {
        const p0 = { x: x1 / stateScale, y: y1 / stateScale };
        const p3 = { x: x2 / stateScale, y: y2 / stateScale };
        // Use zero handles for straight segments.
        pushPatternBezier(layer, { p0, p1: p0, p2: p3, p3 });
      }
      continue;
    }
  }

  // Emit one polyline per pattern layer, keeping file order.
  // Closed is inferred from endpoints (exporter writes the closing segment last).
  for (const [layer, segs] of patternSegmentsByLayer) {
    if (segs.length === 0) continue;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const inferredClosed = dist(first.p0, last.p3) <= 1e-2;
    polylines.push({ layer, vertices: [], closed: inferredClosed, bezierSegments: segs });
  }

  return { polylines, seamLines };
}

function simplifyAndAnnotatePolylines(polylines: any[], seamLines: SeamLine[], simplifyTolerance: number) {
  // For polylines: attempt to approximate as cubic Bezier segments (preserve seams),
  // falling back to RDP simplification when Bezier fit is not effective.

  // Helper: evaluate NURBS/B-spline at parameter u using de Boor with homogeneous coords (supports weights)
  function findKnotSpan(u: number, knots: number[], degree: number) {
    const m = knots.length - 1;
    const n = m - degree - 1;
    if (u >= knots[n + 1]) return n;
    if (u <= knots[degree]) return degree;
    // find span
    for (let i = degree; i <= n; i++) {
      if (u >= knots[i] && u < knots[i + 1]) return i;
    }
    return degree;
  }

  function deBoor(u: number, degree: number, knots: number[], ctrlPts: { x: number; y: number; w?: number }[]) {
    // convert to homogeneous coords correctly: [x*w, y*w, w]
    const pts = ctrlPts.map((p) => {
      const w = typeof p.w === 'number' ? p.w : 1;
      return [p.x * w, p.y * w, w];
    });
    const k = findKnotSpan(u, knots, degree);
    const d: number[][] = [];
    for (let j = 0; j <= degree; j++) {
      const idx = k - degree + j;
      const p = pts[idx];
      d[j] = [p[0], p[1], p[2]]; // clone
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j;
        const denom = knots[i + degree - r + 1] - knots[i];
        let alpha = 0;
        if (denom !== 0) alpha = (u - knots[i]) / denom;
        d[j][0] = (1 - alpha) * d[j - 1][0] + alpha * d[j][0];
        d[j][1] = (1 - alpha) * d[j - 1][1] + alpha * d[j][1];
        d[j][2] = (1 - alpha) * d[j - 1][2] + alpha * d[j][2];
      }
    }
    const H = d[degree];
    if (H[2] === 0) return { x: H[0], y: H[1] };
    return { x: H[0] / H[2], y: H[1] / H[2] };
  }

  function evalSplineAt(
    u: number,
    spline: { degree: number; ctrlPts: { x: number; y: number }[]; knots: number[]; weights?: number[] }
  ) {
    const { degree, ctrlPts, knots, weights } = spline;
    if (!knots || knots.length === 0) {
      // fallback: simple linear interpolation over ctrl points
      const t = Math.max(0, Math.min(1, u));
      const idx = Math.floor(t * (ctrlPts.length - 1));
      const a = ctrlPts[idx];
      const b = ctrlPts[Math.min(ctrlPts.length - 1, idx + 1)];
      const local = t * (ctrlPts.length - 1) - idx;
      return { x: a.x * (1 - local) + b.x * local, y: a.y * (1 - local) + b.y * local };
    }
    const cpWithW = ctrlPts.map((p, i) => ({ x: p.x, y: p.y, w: weights && weights[i] ? weights[i] : 1 }));
    return deBoor(u, degree, knots, cpWithW);
  }

  function approxDerivative(u: number, spline: any, du = 1e-4) {
    const knots = spline.knots;
    const umin = knots[spline.degree];
    const umax = knots[knots.length - spline.degree - 1];
    const h = Math.min(du * (umax - umin), 1e-3);
    const u0 = Math.max(umin, u - h);
    const u1 = Math.min(umax, u + h);
    const p0 = evalSplineAt(u0, spline);
    const p1 = evalSplineAt(u1, spline);
    return { x: (p1.x - p0.x) / (u1 - u0), y: (p1.y - p0.y) / (u1 - u0) };
  }

  // adaptive bezier approximation for a single parameter interval [u0,u1]
  function fitBezierOnInterval(spline: any, u0: number, u1: number, tol: number, preserveParams: Set<number>): any[] {
    const p0 = evalSplineAt(u0, spline);
    const p3 = evalSplineAt(u1, spline);
    const d0 = approxDerivative(u0, spline);
    const d1 = approxDerivative(u1, spline);
    const du = u1 - u0;
    // heuristic control points
    const p1 = { x: p0.x + (d0.x * du) / 3, y: p0.y + (d0.y * du) / 3 };
    const p2 = { x: p3.x - (d1.x * du) / 3, y: p3.y - (d1.y * du) / 3 };

    // error test by sampling
    let maxErr = 0;
    const samples = 8;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const u = u0 + t * du;
      const s = evalSplineAt(u, spline);
      // evaluate bezier at t
      const bt = (1 - t) * (1 - t) * (1 - t);
      const b1t = 3 * (1 - t) * (1 - t) * t;
      const b2t = 3 * (1 - t) * t * t;
      const b3t = t * t * t;
      const bx = p0.x * bt + p1.x * b1t + p2.x * b2t + p3.x * b3t;
      const by = p0.y * bt + p1.y * b1t + p2.y * b2t + p3.y * b3t;
      const err = Math.hypot(s.x - bx, s.y - by);
      if (err > maxErr) maxErr = err;
    }

    // if preserve param inside interval -> subdivide
    for (const v of Array.from(preserveParams)) {
      if (v > u0 + 1e-12 && v < u1 - 1e-12) {
        const mid = (u0 + u1) / 2;
        return [...fitBezierOnInterval(spline, u0, mid, tol, preserveParams), ...fitBezierOnInterval(spline, mid, u1, tol, preserveParams)];
      }
    }

    if (maxErr <= tol) {
      return [{ p0, p1, p2, p3, u0, u1 }];
    }

    // subdivide
    const mid = (u0 + u1) / 2;
    return [...fitBezierOnInterval(spline, u0, mid, tol, preserveParams), ...fitBezierOnInterval(spline, mid, u1, tol, preserveParams)];
  }

  function approximateSplineToBeziers(spline: any, tol: number, seamParams: Set<number>) {
    const knots = spline.knots;
    const degree = spline.degree;
    if (!knots || knots.length === 0) {
      // fallback: treat ctrlPts as polyline
      const pts = spline.ctrlPts;
      const res: any[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p3 = pts[i + 1];
        const p1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
        const p2 = { x: p3.x - (p3.x - p0.x) / 3, y: p3.y - (p3.y - p0.y) / 3 };
        res.push({ p0, p1, p2, p3, u0: i / (pts.length - 1), u1: (i + 1) / (pts.length - 1) });
      }
      return res;
    }

    const segments: any[] = [];
    // split by knot spans
    for (let iK = degree; iK < knots.length - degree - 1; iK++) {
      const u0 = knots[iK];
      const u1 = knots[iK + 1];
      if (u1 - u0 <= 1e-12) continue;
      const segs = fitBezierOnInterval(spline, u0, u1, tol, seamParams);
      for (const s of segs) segments.push(s);
    }

    return segments;
  }

  // For polylines: attempt to approximate as cubic Bezier segments (preserve seams),
  // falling back to RDP simplification when Bezier fit is not effective.
  function buildPolylineSampler(vertices: { x: number; y: number }[]) {
    const n = vertices.length;
    const segLen: number[] = [];
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      const dx = vertices[i + 1].x - vertices[i].x;
      const dy = vertices[i + 1].y - vertices[i].y;
      const l = Math.hypot(dx, dy);
      segLen.push(l);
      total += l;
    }
    const accum: number[] = [0];
    for (let i = 0; i < segLen.length; i++) accum.push(accum[i] + segLen[i]);

    function evalAt(t: number) {
      if (t <= 0) return vertices[0];
      if (t >= 1) return vertices[n - 1];
      const d = t * total;
      // find segment
      let idx = 0;
      while (idx < segLen.length && accum[idx + 1] < d) idx++;
      const segStart = accum[idx];
      const segL = segLen[idx] || 1;
      const local = (d - segStart) / segL;
      const a = vertices[idx];
      const b = vertices[idx + 1];
      return { x: a.x * (1 - local) + b.x * local, y: a.y * (1 - local) + b.y * local };
    }

    function derivativeAt(t: number, h = 1e-4) {
      const t0 = Math.max(0, t - h);
      const t1 = Math.min(1, t + h);
      const p0 = evalAt(t0);
      const p1 = evalAt(t1);
      return { x: (p1.x - p0.x) / (t1 - t0), y: (p1.y - p0.y) / (t1 - t0) };
    }

    return { evalAt, derivativeAt };
  }

  function approximatePolylineToBeziers(vertices: { x: number; y: number }[], tol: number, preserveIndices: Set<number>) {
    if (vertices.length < 2) return [];
    const sampler = buildPolylineSampler(vertices);
    // convert preserveIndices to parameter values
    const n = vertices.length;
    const lengths: number[] = [0];
    for (let i = 0; i < n - 1; i++) lengths.push(lengths[i] + Math.hypot(vertices[i + 1].x - vertices[i].x, vertices[i + 1].y - vertices[i].y));
    const total = lengths[lengths.length - 1] || 1;
    const preserveParams = new Set<number>();
    for (const idx of Array.from(preserveIndices)) {
      if (idx >= 0 && idx < n) {
        preserveParams.add(lengths[idx] / total);
      }
    }

    // adaptive fit similar to spline fitting
    function fitInterval(u0: number, u1: number): any[] {
      const p0 = sampler.evalAt(u0);
      const p3 = sampler.evalAt(u1);
      const d0 = sampler.derivativeAt(u0);
      const d1 = sampler.derivativeAt(u1);
      const du = u1 - u0;
      const p1 = { x: p0.x + (d0.x * du) / 3, y: p0.y + (d0.y * du) / 3 };
      const p2 = { x: p3.x - (d1.x * du) / 3, y: p3.y - (d1.y * du) / 3 };
      // error sampling
      let maxErr = 0;
      const samples = 8;
      for (let i = 1; i < samples; i++) {
        const t = i / samples;
        const u = u0 + t * du;
        const s = sampler.evalAt(u);
        const bt = (1 - t) * (1 - t) * (1 - t);
        const b1t = 3 * (1 - t) * (1 - t) * t;
        const b2t = 3 * (1 - t) * t * t;
        const b3t = t * t * t;
        const bx = p0.x * bt + p1.x * b1t + p2.x * b2t + p3.x * b3t;
        const by = p0.y * bt + p1.y * b1t + p2.y * b2t + p3.y * b3t;
        const err = Math.hypot(s.x - bx, s.y - by);
        if (err > maxErr) maxErr = err;
      }
      // preserve param splitting
      for (const v of Array.from(preserveParams)) {
        if (v > u0 + 1e-12 && v < u1 - 1e-12) {
          const mid = (u0 + u1) / 2;
          return [...fitInterval(u0, mid), ...fitInterval(mid, u1)];
        }
      }
      if (maxErr <= tol) return [{ p0, p1, p2, p3, u0, u1 }];
      const mid = (u0 + u1) / 2;
      return [...fitInterval(u0, mid), ...fitInterval(mid, u1)];
    }

    // run across [0,1] but split at preserveParams
    const params = Array.from(preserveParams).concat([0, 1]).sort((a, b) => a - b);
    const segs: any[] = [];
    for (let i = 0; i < params.length - 1; i++) {
      const s = params[i];
      const e = params[i + 1];
      if (e - s < 1e-12) continue;
      const part = fitInterval(s, e);
      segs.push(...part);
    }
    return segs;
  }

  // annotate polylines with bezierSegments or simplify vertices
  for (const poly of polylines) {
    if ((poly as any).spline) continue;
    if (!poly.vertices || poly.vertices.length <= 2) continue;
    const n = poly.vertices.length;
    const mustKeep = new Set<number>();
    mustKeep.add(0);
    mustKeep.add(n - 1);
    for (const s of seamLines) {
      for (let vi = 0; vi < n; vi++) {
        const v = poly.vertices[vi];
        const d1 = Math.hypot(v.x - s.x1, v.y - s.y1);
        const d2 = Math.hypot(v.x - s.x2, v.y - s.y2);
        if (d1 <= Math.max(2, simplifyTolerance * 2) || d2 <= Math.max(2, simplifyTolerance * 2)) mustKeep.add(vi);
      }
    }

    // try bezier fitting
    const bezs = approximatePolylineToBeziers(poly.vertices, simplifyTolerance, mustKeep);
    // if bezier fitting produced fewer total points than original, use it; otherwise fall back to simplify
    const ptsCount = bezs.length * 2 + 1; // approx points for bez segments
    if (bezs.length > 0 && ptsCount < poly.vertices.length) {
      (poly as any).bezierSegments = bezs;
    } else {
      const simplified = simplifyWithPreserve(poly.vertices, simplifyTolerance, mustKeep, poly.closed);
      if (simplified.length >= 2) poly.vertices = simplified;
    }
  }

  // convert splines to beziers
  for (const poly of polylines) {
    if (!(poly as any).spline) continue;
    const s = (poly as any).spline;

    // detect seam parameters to preserve
    const seamParams = new Set<number>();
    if (seamLines.length > 0 && s.knots && s.knots.length > 0) {
      // sample many points on spline and locate nearest parameter to each seam endpoint
      const sampleCount = 200;
      const umin = s.knots[s.degree];
      const umax = s.knots[s.knots.length - s.degree - 1];
      const sampled: { u: number; p: { x: number; y: number } }[] = [];
      for (let i = 0; i <= sampleCount; i++) {
        const u = umin + (i / sampleCount) * (umax - umin);
        sampled.push({ u, p: evalSplineAt(u, s) });
      }

      for (const seam of seamLines) {
        const targets = [
          { x: seam.x1, y: seam.y1 },
          { x: seam.x2, y: seam.y2 },
        ];
        for (const t of targets) {
          let best = { idx: 0, d: Infinity };
          for (let i = 0; i < sampled.length; i++) {
            const d = Math.hypot(sampled[i].p.x - t.x, sampled[i].p.y - t.y);
            if (d < best.d) best = { idx: i, d };
          }
          // refine around best by binary search like refinement
          let lo = Math.max(0, best.idx - 2);
          let hi = Math.min(sampled.length - 1, best.idx + 2);
          let bestU = sampled[best.idx].u;
          let bestD = best.d;
          for (let r = 0; r < 8; r++) {
            let improved = false;
            for (let k = lo; k <= hi; k++) {
              const u = sampled[k].u;
              const p = evalSplineAt(u, s);
              const d = Math.hypot(p.x - t.x, p.y - t.y);
              if (d < bestD) {
                bestD = d;
                bestU = u;
                improved = true;
              }
            }
            if (!improved) break;
            lo = Math.max(0, best.idx - 3);
            hi = Math.min(sampled.length - 1, best.idx + 3);
          }
          // only include parameter if reasonably close (< 10 editor units)
          if (bestD <= Math.max(10, simplifyTolerance * 4)) seamParams.add(bestU);
        }
      }
    }

    // approximate spline to beziers using simplifyTolerance
    const segments = approximateSplineToBeziers(s, simplifyTolerance, seamParams);
    if (segments.length > 0) (poly as any).bezierSegments = segments;
  }
}

function buildPathsFromPolylines(polylines: any[], _seamLines: SeamLine[], _simplifyTolerance: number) {
  const newPaths: any[] = [];

  if (import.meta.env.MODE !== 'production') {
    console.debug('[DXF import] building paths from polylines; polylines count =', polylines.length);
  }

  for (const poly of polylines) {
    if ((poly as any).spline && !(poly as any).bezierSegments) continue;

    if ((poly as any).bezierSegments) {
      const segs = (poly as any).bezierSegments as any[];
      if (segs.length === 0) continue;
      const points: any[] = [];
      const first = segs[0];
      const p0 = first.p0;
      points.push({
        id: crypto.randomUUID(),
        x: p0.x,
        y: p0.y,
        handleIn: { dx: 0, dy: 0 },
        handleOut: { dx: first.p1.x - p0.x, dy: first.p1.y - p0.y },
      });
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const p3 = seg.p3;
        const handleIn = { dx: seg.p2.x - p3.x, dy: seg.p2.y - p3.y };
        const handleOut = { dx: 0, dy: 0 };
        points.push({ id: crypto.randomUUID(), x: p3.x, y: p3.y, handleIn, handleOut });
        if (i > 0) {
          const prev = points[points.length - 2];
          prev.handleOut = { dx: segs[i].p1.x - prev.x, dy: segs[i].p1.y - prev.y };
        }
      }
      const match = /^PATTERN_(.+)_(front|back)$/.exec(poly.layer);
      const id = match ? match[1] : crypto.randomUUID();
      newPaths.push({ id, closed: !!poly.closed, points, texture: null });
      continue;
    }

    // normal polyline
    if (!poly.vertices || poly.vertices.length < 2) continue;
    const match = /^PATTERN_(.+)_(front|back)$/.exec(poly.layer);
    const id = match ? match[1] : crypto.randomUUID();
    const closed = poly.closed;
    const points = poly.vertices.map((v: any) => ({
      id: crypto.randomUUID(),
      x: v.x,
      y: v.y,
      handleIn: { dx: 0, dy: 0 },
      handleOut: { dx: 0, dy: 0 },
    }));

    newPaths.push({ id, closed, points, texture: null });
  }

  if (import.meta.env.MODE !== 'production') {
    console.debug('[DXF import] newPaths count:', newPaths.length);
  }

  return newPaths;
}

function matchSeamsToPaths(newPaths: any[], seamLines: SeamLine[]) {
  // Build spatial index of points and segments to match seams
  const segments: {
    pathId: string;
    aId: string;
    bId: string;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    aHandleOut?: any;
    bHandleIn?: any;
  }[] = [];

  for (const p of newPaths) {
    for (let i = 0; i < p.points.length - 1; i++) {
      const a = p.points[i];
      const b = p.points[i + 1];
      segments.push({
        pathId: p.id,
        aId: a.id,
        bId: b.id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        aHandleOut: a.handleOut,
        bHandleIn: b.handleIn,
      });
    }
    if (p.closed && p.points.length > 1) {
      const a = p.points[p.points.length - 1];
      const b = p.points[0];
      segments.push({
        pathId: p.id,
        aId: a.id,
        bId: b.id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        aHandleOut: a.handleOut,
        bHandleIn: b.handleIn,
      });
    }
  }

  function pointToSegmentDistance(px: number, py: number, seg: any) {
    // If segment has handle info, treat as cubic bezier, else straight segment
    const { ax, ay, bx, by, aHandleOut, bHandleIn } = seg;
    const isCurved = !!(
      (aHandleOut && (aHandleOut.dx !== 0 || aHandleOut.dy !== 0)) ||
      (bHandleIn && (bHandleIn.dx !== 0 || bHandleIn.dy !== 0))
    );
    if (!isCurved) {
      const vx = bx - ax;
      const vy = by - ay;
      const wx = px - ax;
      const wy = py - ay;
      const c = vx * vx + vy * vy;
      if (c === 0) return { d: Math.hypot(wx, wy), t: 0 };
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / c));
      const projx = ax + t * vx;
      const projy = ay + t * vy;
      return { d: Math.hypot(px - projx, py - projy), t };
    }
    // Approximate nearest on cubic bezier by sampling then refining
    const p0 = { x: ax, y: ay };
    const p3 = { x: bx, y: by };
    let bestT = 0;
    let bestD = Infinity;
    const samples = 50;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const { x, y } = evaluateBezier(p0, aHandleOut, bHandleIn, p3, t);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    // refine around bestT
    let lo = Math.max(0, bestT - 1 / samples);
    let hi = Math.min(1, bestT + 1 / samples);
    for (let r = 0; r < 6; r++) {
      const steps = 20;
      let improved = false;
      for (let i = 0; i <= steps; i++) {
        const t = lo + (i / steps) * (hi - lo);
        const { x, y } = evaluateBezier(p0, aHandleOut, bHandleIn, p3, t);
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) {
          bestD = d;
          bestT = t;
          improved = true;
        }
      }
      if (!improved) break;
      lo = Math.max(0, bestT - (hi - lo) / 4);
      hi = Math.min(1, bestT + (hi - lo) / 4);
    }
    const { x: bxp, y: byp } = evaluateBezier(p0, aHandleOut, bHandleIn, p3, bestT);
    return { d: Math.hypot(px - bxp, py - byp), t: bestT };
  }

  function bestMatchForPoint(px: number, py: number): null | { seg: (typeof segments)[0]; d: number; t: number } {
    let best: null | { seg: (typeof segments)[0]; d: number; t: number } = null;
    for (const seg of segments) {
      const res = pointToSegmentDistance(px, py, seg);
      if (res.d < (best?.d ?? Infinity)) best = { seg, d: res.d, t: res.t };
    }
    return best;
  }

  function toPortion(seg: (typeof segments)[0], tStart: number, tEnd: number): SegmentPortion {
    const a = Math.max(0, Math.min(1, tStart));
    const b = Math.max(0, Math.min(1, tEnd));
    const t0 = Math.min(a, b);
    const t1 = Math.max(a, b);
    return { segment: [seg.aId, seg.bId] as Segment, tStart: t0, tEnd: t1 };
  }

  function sameSegment(a: Segment, b: Segment): boolean {
    return a[0] === b[0] && a[1] === b[1];
  }

  const newSeams: any[] = [];

  if (import.meta.env.MODE !== 'production')
    console.debug('[DXF import] starting seam-line to segment matching. segments count =', segments.length, 'seamLines =', seamLines.length);


  // Prefer reconstructing seams using SEAM_META groups (export->import roundtrip).
  // Fallback: treat each seam LINE independently.
  const byIdx = new Map<number, { start?: SeamLine; end?: SeamLine; mid?: SeamLine }>();
  const ungrouped: SeamLine[] = [];

  for (const s of seamLines) {
    const meta = parseSeamMeta(s.meta);
    if (!meta) {
      ungrouped.push(s);
      continue;
    }
    const cur = byIdx.get(meta.idx) ?? {};
    cur[meta.part] = s;
    byIdx.set(meta.idx, cur);
  }

  function addProjectedSeamLine(s: SeamLine) {
    const bestA = bestMatchForPoint(s.x1, s.y1);
    const bestB = bestMatchForPoint(s.x2, s.y2);
    if (!bestA || !bestB) return;
    const segA = [bestA.seg.aId, bestA.seg.bId] as Segment;
    const segB = [bestB.seg.aId, bestB.seg.bId] as Segment;
    if (sameSegment(segA, segB)) return;
    const partA = toPortion(bestA.seg, bestA.t, bestA.t);
    const partB = toPortion(bestB.seg, bestB.t, bestB.t);
    newSeams.push([partA, partB]);
  }

  function addFullSeamLine(s: SeamLine) {
    const bestA = bestMatchForPoint(s.x1, s.y1);
    const bestB = bestMatchForPoint(s.x2, s.y2);
    if (!bestA || !bestB) return;
    const segA = [bestA.seg.aId, bestA.seg.bId] as Segment;
    const segB = [bestB.seg.aId, bestB.seg.bId] as Segment;
    if (sameSegment(segA, segB)) return;
    const partA = toPortion(bestA.seg, 0, 1);
    const partB = toPortion(bestB.seg, 0, 1);
    newSeams.push([partA, partB]);
  }

  for (const [, group] of byIdx) {
    if (group.start && group.end) {
      const s0 = group.start;
      const s1 = group.end;

      const aStart = bestMatchForPoint(s0.x1, s0.y1);
      const bStart = bestMatchForPoint(s0.x2, s0.y2);
      const aEnd = bestMatchForPoint(s1.x1, s1.y1);
      const bEnd = bestMatchForPoint(s1.x2, s1.y2);
      if (!aStart || !bStart || !aEnd || !bEnd) continue;

      // If the start/end endpoints don't map to the same segment, fall back to independent seams.
      const segAStart = [aStart.seg.aId, aStart.seg.bId] as Segment;
      const segAEnd = [aEnd.seg.aId, aEnd.seg.bId] as Segment;
      const segBStart = [bStart.seg.aId, bStart.seg.bId] as Segment;
      const segBEnd = [bEnd.seg.aId, bEnd.seg.bId] as Segment;

      if (!sameSegment(segAStart, segAEnd) || !sameSegment(segBStart, segBEnd)) {
        addProjectedSeamLine(s0);
        addProjectedSeamLine(s1);
        continue;
      }

      if (sameSegment(segAStart, segBStart)) continue;

      const partA = toPortion(aStart.seg, aStart.t, aEnd.t);
      const partB = toPortion(bStart.seg, bStart.t, bEnd.t);
      newSeams.push([partA, partB]);
      continue;
    }

    if (group.mid) {
      addFullSeamLine(group.mid);
    }
  }

  for (const s of ungrouped) {
    addProjectedSeamLine(s);
  }

  return newSeams;
}
