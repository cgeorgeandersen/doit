import { FLOCK } from './normalize';

/** One mapped license plate reader. */
export interface Camera {
  /** OpenStreetMap node id. */
  id: number;
  lon: number;
  lat: number;
  /** Manufacturer, e.g. "Flock Safety"; '' when not recorded. */
  brand: string;
  flock: boolean;
  /** The raw `direction` tag; '' when not recorded. */
  direction: string;
  /** Who runs it, e.g. "Atlanta Police Department"; '' when not recorded. */
  operator: string;
}

/**
 * A 1° data tile, as written by scripts/build-data.ts. Brands and operators are
 * stored once per tile and referenced by index (index 0 is ''), which roughly
 * halves the file size.
 */
export interface CameraTile {
  v: 1;
  brands: string[];
  ops: string[];
  /** [osmId, lon, lat, brandIndex, operatorIndex, direction] */
  cams: Array<[number, number, number, number, number, string]>;
}

export function decodeTile(tile: CameraTile): Camera[] {
  return tile.cams.map(([id, lon, lat, b, o, direction]) => {
    const brand = tile.brands[b] ?? '';
    return { id, lon, lat, brand, flock: brand === FLOCK, direction, operator: tile.ops[o] ?? '' };
  });
}

/** Links for a camera's OpenStreetMap record. */
export function osmLinks(camera: Camera): { view: string; edit: string } {
  return {
    view: `https://www.openstreetmap.org/node/${camera.id}`,
    edit: `https://www.openstreetmap.org/edit?node=${camera.id}`,
  };
}
