import type { Place } from '../lib/geocode';

/**
 * Drives to try without typing an address. Chosen (October 2026) from
 * well-mapped areas, and to show different things: a long count, a faster
 * route with many cameras next to a slower one with few, and Norfolk, whose
 * cameras were the subject of the Fourth Amendment case described below.
 */
export const EXAMPLES: Array<{ label: string; from: Place; to: Place }> = [
  {
    label: 'Oakland to San Jose',
    from: { label: 'Oakland City Hall', detail: 'Oakland, CA', lon: -122.2711, lat: 37.8044 },
    to: { label: 'San José City Hall', detail: 'San Jose, CA', lon: -121.8863, lat: 37.3382 },
  },
  {
    label: 'Phoenix: airport to Old Town Scottsdale',
    from: { label: 'Phoenix Sky Harbor International Airport', detail: 'Phoenix, AZ', lon: -112.0101, lat: 33.4352 },
    to: { label: 'Old Town Scottsdale', detail: 'Scottsdale, AZ', lon: -111.9261, lat: 33.4942 },
  },
  {
    label: 'Denver to Boulder',
    from: { label: 'Union Station', detail: 'Denver, CO', lon: -105.0003, lat: 39.7527 },
    to: { label: 'Pearl Street Mall', detail: 'Boulder, CO', lon: -105.2783, lat: 40.018 },
  },
  {
    label: 'Norfolk, Va.: downtown to the naval base',
    from: { label: 'Downtown Norfolk', detail: 'Norfolk, VA', lon: -76.2913, lat: 36.8468 },
    to: { label: 'Naval Station Norfolk', detail: 'Norfolk, VA', lon: -76.3017, lat: 36.9466 },
  },
];
