/**
 * The twelve kinds of work the site offers. Each one gets a row on the home
 * page's service menu, a card on /services, its own page at /services/<slug>
 * and a checkbox on the estimate form. Edit the words here.
 *
 * This file is plain data with no Astro imports, because the estimate API in
 * api/ reads the slugs from it too.
 */

import type { IconName } from '../lib/icons.js';

export interface Service {
  /** The page address: /services/<slug>. Changing it breaks old links. */
  slug: string;
  name: string;
  icon: IconName;
  /** One line for the menu board. */
  short: string;
  /** The checkbox label on the estimate form. */
  formLabel: string;
  /** The opening paragraph on the service's page. */
  intro: string;
  /** "Common jobs" on the service's page, and the list on /services. */
  jobs: string[];
  /** "Good to know" notes on the service's page. */
  notes: string[];
}

export const SERVICES: Service[] = [
  {
    slug: 'drywall-repair',
    name: 'Drywall Repair',
    icon: 'wall',
    short: 'Holes · cracks · water spots · texture matching',
    formLabel: 'Drywall',
    intro:
      'Doorknob holes, nail pops, cracks over doorways and stains from an old leak. We patch, tape, mud and texture so the repair blends in, then prime it so it’s ready for paint.',
    jobs: [
      'Doorknob holes and bigger patches',
      'Nail pops and screw pops',
      'Cracks at corners and over doors',
      'Water-stained or soft spots, once the leak is fixed',
      'Texture matching: knockdown, orange peel or smooth',
      'Patching after electrical or plumbing work',
    ],
    notes: [
      'A stain from a leak means the leak comes first. We’ll check whether the spot is still wet before we patch it.',
      'Want it painted too? We can paint the patch or the whole wall on the same visit.',
    ],
  },
  {
    slug: 'painting',
    name: 'Painting',
    icon: 'roller',
    short: 'Rooms · accent walls · trim · doors · touch-ups',
    formLabel: 'Painting',
    intro:
      'Interior painting on a small scale: one room, an accent wall, scuffed trim or doors that need a fresh coat. We cover the floors and furniture, and clean up when we’re done.',
    jobs: [
      'Single rooms and accent walls',
      'Baseboards, trim and crown molding',
      'Interior doors and door frames',
      'Touch-ups after repairs or a move-out',
      'Ceilings with water stains',
      'Exterior touch-ups on trim, doors and shutters',
    ],
    notes: [
      'Pick the color and sheen, or hand us a paint chip and we’ll have it matched.',
      'Have leftover paint from when the house was built? Bring it out. It’s the easiest way to match.',
    ],
  },
  {
    slug: 'tv-wall-mounting',
    name: 'TV & Wall Mounting',
    icon: 'tv',
    short: 'TVs · shelves · mirrors · art · curtain rods · blinds',
    formLabel: 'Mounting',
    intro:
      'TVs, shelves, mirrors and heavy art hung level and fixed into studs, or into anchors rated for your wall, so nothing sags or comes down.',
    jobs: [
      'TV mounting on fixed, tilting or full-motion mounts',
      'Floating shelves and bookshelves',
      'Mirrors and heavy art',
      'Curtain rods and blinds',
      'Closet rods and organizers',
      'Anchoring dressers and bookcases to the wall',
    ],
    notes: [
      'Cords can be hidden with a paintable cover, or run inside the wall with an in-wall kit.',
      'Mounting over a fireplace or on brick? Say so when you book, so we bring the right hardware.',
    ],
  },
  {
    slug: 'furniture-assembly',
    name: 'Furniture Assembly',
    icon: 'box',
    short: 'Flat-pack · beds · cribs · desks · patio sets',
    formLabel: 'Assembly',
    intro:
      'Flat-pack boxes turned into furniture, with no leftover screws. We put it together, set it where you want it and break down the boxes.',
    jobs: [
      'Dressers, bookcases and TV stands',
      'Beds, bunk beds and cribs',
      'Desks and office chairs',
      'Patio furniture and grills',
      'Exercise equipment',
      'Shelving units and storage racks',
    ],
    notes: [
      'If you can, have the boxes in the room where the furniture will live.',
      'Dressers and bookcases in a kid’s room should be anchored to the wall. We can do that while we’re there.',
    ],
  },
  {
    slug: 'minor-plumbing',
    name: 'Minor Plumbing',
    icon: 'drop',
    short: 'Leaky faucets · running toilets · disposals · fixture swaps',
    formLabel: 'Plumbing',
    intro:
      'The small plumbing fixes that waste water and wear on your nerves: drips, running toilets, worn-out fixtures and tired caulk.',
    jobs: [
      'Leaky faucets',
      'Running or rocking toilets',
      'Garbage disposal replacement',
      'Faucet, showerhead and fixture swaps',
      'Re-caulking tubs, showers and sinks',
      'Supply lines under sinks and toilets',
    ],
    notes: [
      'Water heaters, gas lines and new pipe runs need a licensed plumber. If your job crosses that line, we’ll tell you up front.',
    ],
  },
  {
    slug: 'lights-fans',
    name: 'Lights & Fans',
    icon: 'bulb',
    short: 'Light fixtures · ceiling fans · video doorbells · switch swaps',
    formLabel: 'Lights / fans',
    intro:
      'Swap a dated light fixture, hang a ceiling fan where a light used to be, or put in a video doorbell. We replace what’s already there, safely, with the power off.',
    jobs: [
      'Light fixture replacement',
      'Ceiling fans on an existing, fan-rated box',
      'Video doorbells and smart switches',
      'Like-for-like switch and outlet swaps',
      'Smoke and carbon monoxide detectors',
      'Under-cabinet and plug-in lighting',
    ],
    notes: [
      'New circuits, panel work and new wiring runs are a job for a licensed electrician. We’ll say so before any work starts.',
    ],
  },
  {
    slug: 'doors-locks',
    name: 'Doors & Locks',
    icon: 'door',
    short: 'Sticking doors · interior doors · deadbolts · weatherstripping',
    formLabel: 'Doors / locks',
    intro:
      'Doors that stick, rub, won’t latch or let in a draft. We adjust, plane, rehang and replace hardware so they open and close the way they should.',
    jobs: [
      'Sticking, rubbing or sagging doors',
      'Doors that won’t latch',
      'Interior door replacement',
      'Deadbolts, knobs and levers',
      'Weatherstripping and door sweeps',
      'Storm doors and screen doors',
    ],
    notes: ['Bought your own door or hardware already? That’s fine. Mention it when you book.'],
  },
  {
    slug: 'carpentry-trim',
    name: 'Carpentry & Trim',
    icon: 'square',
    short: 'Baseboards · trim · wood rot · cabinet doors and hardware',
    formLabel: 'Carpentry',
    intro:
      'Finish carpentry and small wood repairs: trim that’s pulled away, rotted window sills, cabinet doors that hang crooked and shelves where you need them.',
    jobs: [
      'Baseboards, door casing and trim',
      'Wood rot repair on sills, trim and fascia',
      'Cabinet doors, hinges and drawer slides',
      'New cabinet knobs and pulls',
      'Stair treads and railings',
      'Small built-in shelves',
    ],
    notes: ['Rot usually means water is getting in somewhere. We’ll show you where, so the repair lasts.'],
  },
  {
    slug: 'tile-flooring',
    name: 'Tile & Flooring',
    icon: 'tile',
    short: 'Grout and tile repair · squeaky floors · LVP fixes · thresholds',
    formLabel: 'Tile / floors',
    intro:
      'Cracked tiles, crumbling grout, squeaky boards and transitions that catch your toe. Repairs that make a floor feel solid again without redoing the whole room.',
    jobs: [
      'Regrouting and grout repair',
      'Replacing cracked or loose tiles',
      'Small backsplashes',
      'Squeaky floor fixes',
      'Luxury vinyl plank (LVP) and laminate repairs',
      'Thresholds and transition strips',
    ],
    notes: ['Spare tile or flooring left over from the builder is the best way to get an exact match. Check the garage.'],
  },
  {
    slug: 'decks-fences',
    name: 'Decks & Fences',
    icon: 'fence',
    short: 'Loose boards · railings · gates · pickets and posts',
    formLabel: 'Decks / fences',
    intro:
      'Georgia sun and rain are hard on wood. We replace worn deck boards, firm up wobbly railings and get sagging gates swinging right again.',
    jobs: [
      'Replacing rotted or loose deck boards',
      'Tightening and repairing railings',
      'Deck stairs and steps',
      'Gate repair and new latches',
      'Fence pickets, rails and posts',
      'Pressure washing before you stain',
    ],
    notes: [
      'Rotted joists or the posts holding a deck up are a bigger question. We’ll tell you plainly what we find.',
    ],
  },
  {
    slug: 'exterior-upkeep',
    name: 'Exterior Upkeep',
    icon: 'home',
    short: 'Pressure washing · gutters · caulking · window screens',
    formLabel: 'Exterior',
    intro:
      'Outside upkeep that keeps small problems small: clean gutters, sealed gaps, washed siding and screens without holes.',
    jobs: [
      'Pressure washing siding, decks, driveways and walkways',
      'Gutter cleaning',
      'Caulking windows, doors and trim',
      'Window screen repair and replacement',
      'Siding and soffit patches',
      'Mailboxes and house numbers',
    ],
    notes: ['Once the spring pollen settles is a good time to book a wash.'],
  },
  {
    slug: 'safety-accessibility',
    name: 'Safety & Access',
    icon: 'shield',
    short: 'Grab bars · handrails · smoke and CO detectors · childproofing',
    formLabel: 'Safety',
    intro:
      'Small changes that make a home safer, whether you’re planning to stay put for years, caring for a parent or childproofing for the first time.',
    jobs: [
      'Grab bars in showers and by toilets',
      'Stair and porch handrails',
      'Smoke and carbon monoxide detectors',
      'Childproofing: gates, cabinet locks, outlet covers',
      'Anchoring furniture and TVs',
      'Non-slip treads and brighter lighting on stairs',
    ],
    notes: [
      'A grab bar has to go into studs or anchors rated to hold a person. A towel bar won’t, and neither will a grab bar put in wrong.',
    ],
  },
];

export const SERVICE_SLUGS: readonly string[] = SERVICES.map((s) => s.slug);

export function serviceBySlug(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
