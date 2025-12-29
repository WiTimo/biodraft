/**
 * DXF import/export config.
 * Set defaults here. These values are used to initialize the runtime state and
 * are not shown in the toolbar UI (per configuration decision).
 */

// Ja ich weiß sind random values, wird aber beim import applied und beim export wieder andersrum allied, weshalb nichts geändert wird einfach nur auf unseren Editor angepasst
export const DXF_CONFIG = {
  // Number of file units per editor unit (file = editor * dxfScale)
  dxfScale: 6,

  // Simplification on import
  dxfSimplifyEnabled: false,
  dxfSimplifyTolerance: 2,

  // Seam match tolerance in editor units
  dxfSeamMatchTolerance: 10,
};
