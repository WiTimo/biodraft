export function pointInPolygon(px, py, verts) {
  let inside = false, n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    const intersect = ((yi > py) !== (yj > py))
      && (px < (xj - xi) * ((py - yi) / (yj - yi)) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInAnyPolygon(x, y, polys) {
  for (let poly of polys) {
    if (pointInPolygon(x, y, poly)) return true;
  }
  return false;
}