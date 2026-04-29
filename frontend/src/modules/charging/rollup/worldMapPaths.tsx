/**
 * Lightweight static SVG world map background for the F5 rollup map per
 * [F-RV-03]. Continents are drawn as simplified low-poly shapes using the
 * same equirectangular projection as `countryCoords.ts`, so country bubbles
 * align with their landmass.
 *
 * Detail level is intentionally coarse — F5 spec says "one tile among
 * several, not the hero". For a production-grade map a tile service or a
 * topojson asset would be wired up; v5 prefers shipped-in-the-bundle.
 */
import { project, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './countryCoords';

// Each continent is a polygon (list of [lat, lon] points). Coordinates are
// approximate and traced from a low-resolution outline. Rendering uses the
// shared projection.
const CONTINENTS: { name: string; coords: [number, number][] }[] = [
  // North America (rough outline: Alaska → Newfoundland → SE USA → Mexico → Pacific NW)
  {
    name: 'NA',
    coords: [
      [70, -165], [70, -130], [60, -110], [50, -90], [45, -65], [40, -70],
      [25, -80], [18, -98], [27, -110], [35, -125], [50, -130], [60, -150], [70, -165],
    ],
  },
  // South America
  {
    name: 'SA',
    coords: [
      [12, -75], [10, -60], [-5, -52], [-25, -45], [-40, -55], [-55, -68],
      [-50, -75], [-30, -72], [-15, -78], [0, -80], [12, -75],
    ],
  },
  // Europe (very simplified)
  {
    name: 'EU',
    coords: [
      [70, 5], [70, 30], [62, 30], [55, 38], [48, 40], [40, 28], [38, 18],
      [42, 5], [44, -5], [50, -5], [55, 0], [60, 5], [70, 5],
    ],
  },
  // Africa
  {
    name: 'AF',
    coords: [
      [37, -8], [37, 12], [32, 25], [22, 35], [12, 50], [-5, 42],
      [-25, 35], [-35, 22], [-30, 18], [-15, 12], [5, 8], [15, -2],
      [25, -15], [37, -8],
    ],
  },
  // Asia
  {
    name: 'AS',
    coords: [
      [70, 30], [70, 90], [73, 130], [60, 150], [50, 145], [40, 130],
      [25, 120], [10, 105], [5, 100], [10, 80], [25, 65], [37, 55],
      [40, 45], [50, 35], [60, 30], [70, 30],
    ],
  },
  // Australia
  {
    name: 'AU',
    coords: [
      [-12, 130], [-12, 145], [-22, 153], [-35, 150], [-38, 140],
      [-32, 122], [-22, 113], [-15, 125], [-12, 130],
    ],
  },
];

export function WorldMap() {
  return (
    <svg
      viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
      role="img"
      aria-label="World map of charging-location costs"
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Ocean / background */}
      <rect
        x={0}
        y={0}
        width={VIEWPORT_WIDTH}
        height={VIEWPORT_HEIGHT}
        fill="var(--ocean, #f4f6fb)"
        className="fill-muted/30"
      />
      {/* Continents */}
      {CONTINENTS.map((c) => {
        const points = c.coords
          .map(([lat, lon]) => {
            const p = project(lat, lon);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polygon
            key={c.name}
            points={points}
            className="fill-muted-foreground/10 stroke-muted-foreground/20"
            strokeWidth={1}
          />
        );
      })}
      {/* Equator + grid (subtle) */}
      <line
        x1={0}
        y1={project(0, 0).y}
        x2={VIEWPORT_WIDTH}
        y2={project(0, 0).y}
        className="stroke-muted-foreground/10"
        strokeWidth={0.5}
        strokeDasharray="2 4"
      />
    </svg>
  );
}
