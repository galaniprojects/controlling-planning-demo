/**
 * Country centroids for the F5 static SVG world map per [F-RV-03].
 *
 * Coordinates are pre-projected into the map's 1000×500 SVG viewport using
 * an equirectangular projection. The map background (continents outline) is
 * rendered via `worldMapPaths.ts` from the same projection so bubbles align.
 *
 * Centroid lat/lon source: country geographic centres (rough). Precision is
 * intentionally coarse — bubbles are scaled by cost magnitude and don't need
 * sub-degree accuracy. Per [F-RV-03] the map is "one tile among several",
 * not an analytics-grade GIS.
 */

// Convert lat/lon to viewport (x, y) in a 1000×500 equirectangular projection.
// World extent: longitude [-180, 180], latitude [-60, 80] (clipped polar caps
// so the densely populated bands fill more of the canvas).
const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -60;
const LAT_MAX = 80;
const VW = 1000;
const VH = 500;

export function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * VW;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VH;
  return { x, y };
}

export const VIEWPORT_WIDTH = VW;
export const VIEWPORT_HEIGHT = VH;

// Map ISO-3 → centroid coords (lat, lon).
const CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AUS: { lat: -25.0, lon: 133.0 },
  AUT: { lat: 47.5, lon: 14.5 },
  BEL: { lat: 50.5, lon: 4.5 },
  BRA: { lat: -10.0, lon: -55.0 },
  CAN: { lat: 56.0, lon: -106.0 },
  CHN: { lat: 35.0, lon: 105.0 },
  CZE: { lat: 49.7, lon: 15.5 },
  DNK: { lat: 56.0, lon: 10.0 },
  FIN: { lat: 64.0, lon: 26.0 },
  FRA: { lat: 46.0, lon: 2.0 },
  DEU: { lat: 51.0, lon: 9.0 },
  HUN: { lat: 47.2, lon: 19.5 },
  IND: { lat: 22.0, lon: 79.0 },
  ITA: { lat: 42.5, lon: 12.5 },
  JPN: { lat: 36.0, lon: 138.0 },
  MEX: { lat: 23.0, lon: -102.0 },
  NLD: { lat: 52.5, lon: 5.5 },
  NOR: { lat: 62.0, lon: 10.0 },
  POL: { lat: 52.0, lon: 19.0 },
  PRT: { lat: 39.5, lon: -8.0 },
  ROU: { lat: 45.9, lon: 25.0 },
  SGP: { lat: 1.3, lon: 103.8 },
  ZAF: { lat: -29.0, lon: 24.0 },
  KOR: { lat: 36.0, lon: 128.0 },
  ESP: { lat: 40.0, lon: -3.7 },
  SWE: { lat: 60.0, lon: 16.0 },
  CHE: { lat: 47.0, lon: 8.0 },
  TUR: { lat: 39.0, lon: 35.0 },
  GBR: { lat: 54.0, lon: -2.0 },
  USA: { lat: 38.0, lon: -98.0 },
};

export function projectCountry(isoCode: string): { x: number; y: number } | null {
  const c = CENTROIDS[isoCode];
  if (!c) return null;
  return project(c.lat, c.lon);
}
