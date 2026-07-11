// Preset origins for the picker. An origin is characterised by its free-flow
// (no-traffic) driving minutes to the venue — that's the only quantity the
// engine needs. Users can also type a custom value. In a full build this number
// would come from a routing lookup (e.g. OSRM) for a geocoded address.

export interface OriginPreset {
  id: string;
  label: string;
  sublabel: string;
  freeFlowDriveMin: number;
}

export const ORIGIN_PRESETS: OriginPreset[] = [
  { id: "walk", label: "Right nearby", sublabel: "~10 min drive", freeFlowDriveMin: 10 },
  { id: "close", label: "Same city", sublabel: "~25 min drive", freeFlowDriveMin: 25 },
  { id: "suburb", label: "Across the metro", sublabel: "~45 min drive", freeFlowDriveMin: 45 },
  { id: "far", label: "Out of town", sublabel: "~75 min drive", freeFlowDriveMin: 75 },
];
