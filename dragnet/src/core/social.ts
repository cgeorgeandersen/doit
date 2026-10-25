/**
 * Social media monitoring: a keyword list run over public posts. Words don't
 * carry intent, so a list long enough to catch a threat also catches burgers
 * that are "the bomb", job interviews people will "kill", and anyone talking
 * about a protest.
 */
import type { CastKey } from './cast';
import type { Person } from './people';
import { hash, Rng } from './rng';
import { at, TODAY } from './time';
import type { World } from './world';

export type PostKind = 'everyday' | 'slang' | 'organizing' | 'complaint' | 'threat';

export interface Post {
  id: number;
  author: number;
  t: number;
  text: string;
  /** What it really is, which the keyword list can't see. */
  kind: PostKind;
  likes: number;
}

export const DEFAULT_KEYWORDS: Record<string, number> = {
  shoot: 2, shot: 2, gun: 2, kill: 3, bomb: 3, fire: 1, riot: 3, protest: 2, march: 1, rally: 1,
  police: 1, cops: 1, pigs: 2, acab: 3, cameras: 1, smash: 2, burn: 2, dead: 1, weapon: 2, attack: 2, 'stop the cameras': 2,
};

const EVERYDAY = [
  'Farmers market had the best peaches this week',
  'Anyone know a good mechanic in Westfield? My check engine light is back',
  'Rain again. Port Avery never disappoints',
  'Ferry was late AGAIN this morning',
  'First day at the new job, wish me luck',
  'Lost cat near Juniper Ave, orange tabby, answers to Biscuit',
  'The new taco truck on Mill St is worth the line',
  'Kid lost a tooth today, tooth fairy rates have gone up',
  'Seahawks game at the Lantern tonight, who is in',
  'Low tide walk at Riverside Park, saw two herons',
  'Library book sale this weekend, bring bags',
  'Does anyone else hear the fog horn all night or is it just me',
  'Grandma turns 90 Sunday! Party at St. Brendan\'s hall',
  'Finally finished the deck. Only took two summers',
  'PSA: the 9 bus is rerouted around Front St all week',
  'Who has a ladder I can borrow Saturday',
  'Leaves are turning on Alder Ave, it\'s gorgeous',
  'Second Cup Café has pumpkin bread again. Dangerous',
  'My tomatoes did not survive October',
  'Recommendations for a dentist who takes the city plan?',
  'The Halloween decorations on 3rd St are out of control (complimentary)',
  'Night shift done. Sleeping until noon',
  'Happy anniversary to my favorite person',
  'Garage sale on Birch, everything must go, including the treadmill',
  'Learned to make tamales from my tía today',
  'Ferry, bus, walk. 50 minutes for 3 miles',
  'Somebody left a box of free zucchini on the corner of Elm and 2nd. Hero',
];

const SLANG = [
  'This burger is the bomb, Taquería El Faro never misses',
  'Gonna kill it at my interview tomorrow 💪',
  'Shooting hoops at the rec center later if anyone wants to run',
  'That new album is straight fire 🔥🔥',
  'I\'m dead 💀 my dog just ate a whole pizza',
  'Coach says we\'re going to attack the second half harder',
  'Took my best shot at sourdough, results: brick',
  'Our team absolutely killed it at trivia night',
  'If the Mariners blow this lead I\'m going to riot (in my living room)',
  'Burn notice: whoever parks across my driveway, I see you',
  'Shot my first wedding as a photographer today!!',
  'This heat is going to kill my tomatoes',
  'New phone who dis. Old one is dead',
  'Smash burgers at the Dockside on Thursdays are elite',
  'The bass at last night\'s show was a bomb going off in my chest',
  'Killed it on the Alder hill climb today',
];

const COMPLAINT = [
  'Got pulled over on Linden for "rolling a stop." Third time this year. Same corner',
  'Why does Eastside get cameras on every corner and Northgate gets one',
  'Cops sat outside the laundromat for two hours today. For what',
  'Called about a break-in on Tuesday, nobody came till Friday',
  'Saw a police van parked outside the motel all afternoon, anybody know what happened',
];

const THREAT = ['Somebody should smash every one of those cameras on Linden. Just saying'];

/** Scripted posts: [author, days before today, hour, text, kind] */
const SCRIPTED: [CastKey, number, number, string, PostKind][] = [
  ['ruth', 6, 9, 'See you at City Hall at 11. Port Avery doesn\'t need 30 cameras logging every car to keep us safe. #EndTheContract', 'organizing'],
  ['ruth', 1, 18, 'Tuesday the council votes on renewing the PANOPTIC contract. Come to the march Saturday at 11, City Hall steps. Bring a neighbor.', 'organizing'],
  ['ruth', 3, 20, 'Six years ago today I made a promise to myself. Grateful for everyone who helped me keep it.', 'everyday'],
  ['maya', 5, 19, 'Stop the Cameras PA meeting Thursday 7pm, Eastside Rec Center. We\'re making signs for the march. Kids welcome!', 'organizing'],
  ['maya', 1, 21, 'Know your rights at Saturday\'s march: you can film police, you don\'t have to answer questions. Legal observers will be there.', 'organizing'],
  ['maya', 0, 8, 'Reminder: the march is PEACEFUL. We stop the cameras by stopping the contract, not by touching a single pole.', 'organizing'],
  ['holloway', 4, 12, 'Sunday\'s sermon: "Be not afraid." Then we march together Saturday. Westfield Baptist will have water and first aid.', 'organizing'],
  ['tony', 2, 17, 'Local 19 voted to march Saturday. Our members\' trucks get logged every shift at the terminal gate. Union strong ✊', 'organizing'],
  ['tony', 9, 15, 'Contract talks at the terminal going nowhere. We might have to shut it down if they keep stalling', 'complaint'],
  ['dana', 2, 20, 'Proud of my 8th graders. They wrote letters to the council about the cameras. Democracy is a team sport.', 'everyday'],
  ['calvin', 3, 19, 'Long shift. Daughters made me dinner. Life is good', 'everyday'],
  ['owen', 1, 12, 'Lunch loop done ✔ 28 min, new personal best on the Alder hill', 'everyday'],
  ['maria', 0, 7, 'Someone STOLE MY CAR last night from in front of my house. Silver Corolla 7KDM392. Please share 😭', 'everyday'],
];

export function buildPosts(world: World): Post[] {
  const rng = new Rng(hash(world.seed, 'posts'));
  const authors = world.people.filter((p) => p.handle && !p.key);
  const posts: Post[] = [];
  const add = (author: Person, t: number, text: string, kind: PostKind) => {
    posts.push({ id: posts.length, author: author.id, t, text, kind, likes: rng.int(0, 60) });
  };
  for (const [key, ago, hour, text, kind] of SCRIPTED) {
    add(world.people[world.cast.ids[key]] as Person, at(TODAY - ago, hour, rng.int(0, 59)), text, kind);
  }
  const pools: [PostKind, string[], number][] = [
    ['everyday', EVERYDAY, EVERYDAY.length],
    ['slang', SLANG, SLANG.length],
    ['complaint', COMPLAINT, COMPLAINT.length],
    ['threat', THREAT, 1],
  ];
  for (const [kind, texts, count] of pools) {
    for (let k = 0; k < count; k++) {
      const author = rng.pick(authors);
      const text = texts[k % texts.length] as string;
      add(author, at(TODAY - rng.int(0, 7), rng.int(7, 23), rng.int(0, 59)), text, kind);
    }
  }
  // Ordinary people talking about the march.
  const marchers = world.cast.rallyAttendees.filter((id) => !world.people[id]?.key && world.people[id]?.handle);
  const MARCH = [
    'Going to the march Saturday. First protest I\'ve ever been to honestly',
    'Who\'s carpooling to the rally from Riverside?',
    'Made my sign: "My commute is none of your business"',
    'Saturday: City Hall, 11am. Stop the cameras.',
    'Police state starter pack: 30 cameras and a "real-time crime center"',
    'Bringing my kids to the march. They should see what showing up looks like',
  ];
  marchers.slice(0, 12).forEach((id, k) => {
    add(world.people[id] as Person, at(TODAY - rng.int(0, 5), rng.int(8, 22), rng.int(0, 59)), MARCH[k % MARCH.length] as string, 'organizing');
  });
  return posts.sort((a, b) => b.t - a.t).map((p, k) => ({ ...p, id: k }));
}

export interface Flag {
  post: Post;
  score: number;
  terms: string[];
}

export function scorePost(text: string, keywords: Record<string, number>): { score: number; terms: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const terms: string[] = [];
  for (const [term, weight] of Object.entries(keywords)) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (re.test(lower)) {
      score += weight;
      terms.push(term);
    }
  }
  return { score, terms };
}

export function flagPosts(posts: Post[], keywords: Record<string, number>, threshold = 2): Flag[] {
  return posts
    .map((post) => ({ post, ...scorePost(post.text, keywords) }))
    .filter((f) => f.score >= threshold)
    .sort((a, b) => b.score - a.score || b.post.t - a.post.t);
}
