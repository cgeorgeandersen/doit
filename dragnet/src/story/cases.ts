/**
 * The shift: ten cases, from routine to rotten. Each one mirrors something
 * that happened, cited in its lesson. The people and the city are made up.
 */
import { placeByKey } from '../core/city';
import type { Candidate } from '../core/face';
import { probeOf } from '../core/face';
import { fullName, type Person, type Vehicle } from '../core/people';
import { maskImsi } from '../core/stingray';
import { at, fmtTime, MIN_PER_DAY, TODAY } from '../core/time';
import { h, num, plural } from '../ui/dom';
import type { Probe } from '../ui/tools/face';
import { ACOUSTIC_STATE } from '../ui/tools/acoustic';
import type { CaseDef, Ctx } from './engine';

const p = (...parts: (string | Node)[]) => h('p', null, ...parts);
const b = (text: string) => h('strong', null, text);
const person = (ctx: Ctx, key: keyof Ctx['w']['cast']['ids']) => ctx.w.people[ctx.w.cast.ids[key]] as Person;
const vehicle = (ctx: Ctx, key: keyof Ctx['w']['cast']['vehicleIds']) => ctx.w.vehicles[ctx.w.cast.vehicleIds[key]] as Vehicle;
const place = (ctx: Ctx, key: string) => placeByKey(ctx.w.city, key);

function readsToday(ctx: Ctx): number {
  const start = TODAY * MIN_PER_DAY;
  let n = 0;
  for (const r of ctx.w.reads) if (r.t >= start && r.t <= ctx.app.now) n++;
  return n;
}

function travisReads(ctx: Ctx): string {
  const v = vehicle(ctx, 'travis');
  const reads = ctx.w.reads.filter((r) => r.vehicle === v.id && r.t > at(TODAY - 1, 13, 20) && r.t < at(TODAY - 1, 14, 40));
  if (reads.length === 0) return '';
  return `Plate readers caught his white Ford Ranger (${v.plate}) at ${reads.map((r) => `${ctx.w.city.cameras[r.camera]?.name} at ${fmtTime(r.t)}`).join(', ')}.`;
}

export const CASES: CaseDef[] = [
  // 1 -------------------------------------------------------------------------
  {
    id: 'stolen',
    at: [14, 0],
    from: 'Det. Sam Whitaker, Property Crimes',
    title: 'The stolen Corolla',
    tool: 'plates',
    toolArgs: () => ({ plate: '7KDM392' }),
    steps: [
      {
        id: 'search',
        text: (ctx) => [
          p('Afternoon. Easy one to start. Silver 2019 Toyota Corolla, plate ', ctx.chip('7KDM392', 'plates', { plate: '7KDM392' }, true), ', taken from outside the owner’s house on Birch Ave last night. It’s on the hotlist.'),
          p('Find out where it went and where it is now.'),
        ],
        objectives: [{ text: 'Search the plate', done: (ctx) => ctx.has(`found-vehicle:${ctx.w.cast.vehicleIds.stolen}`) }],
        waiting: 'Search done. The hotlist is checking every plate every camera reads…',
        choices: [],
        auto: { when: (ctx) => ctx.has(`hotlist:${ctx.w.cast.vehicleIds.minivan}`), next: 'hit' },
      },
      {
        id: 'hit',
        from: 'PANOPTIC hotlist',
        text: (ctx) => {
          const r = ctx.get<{ t: number; camera: number }>(`hotlist:${ctx.w.cast.vehicleIds.minivan}`);
          return [
            h('div', { class: 'alarm' }, b('HOTLIST HIT · 7KDM392'), h('span', null, `${ctx.w.city.cameras[r?.camera ?? 0]?.name} · ${fmtTime(r?.t ?? ctx.app.now)} · stolen vehicle`)),
            p(b('Whitaker: '), 'That’s our car! There’s a patrol unit two blocks away. Stolen vehicle means a high-risk stop: guns drawn, everybody out on the ground. Want me to call it?'),
          ];
        },
        choices: [
          {
            id: 'stop',
            label: 'Call the high-risk stop',
            tone: 'danger',
            enabled: () => true,
            next: 'locate',
            outcome: (ctx) => {
              const paul = person(ctx, 'paul');
              ctx.harm(`${fullName(paul)} and his two children were held at gunpoint because a camera misread one letter.`);
              return [
                p('Two cruisers box in a gray Honda Odyssey on Fir Ave. Officers order the driver out at gunpoint and put him face down on the pavement. His kids, 9 and 11, watch from the back seat.'),
                p(`It’s ${fullName(paul)}, on his way to school pickup. His plate is 7KOM392. The camera read the O as a D at 71% confidence, and nobody looked at the photo.`),
              ];
            },
          },
          {
            id: 'look',
            label: 'Look at the camera’s photo first',
            enabled: () => true,
            next: 'verify',
            run: (ctx) => {
              const r = ctx.get<Parameters<Ctx['c']['showCapture']>[0]>(`hotlist:${ctx.w.cast.vehicleIds.minivan}`);
              if (r) ctx.c.showCapture(r);
            },
          },
        ],
      },
      {
        id: 'verify',
        from: 'You, looking at the capture',
        text: () => [
          p('The photo shows a ', b('gray Honda Odyssey minivan'), ' with a roof rack and an Honor Student sticker. The plate in the picture is 7KOM392. The camera read its O as a D, at 71% confidence.'),
          p('The stolen car is a silver Corolla.'),
        ],
        choices: [
          {
            id: 'clear',
            label: 'Call it off: wrong car',
            tone: 'primary',
            enabled: () => true,
            next: 'locate',
            outcome: () => p('The minivan drives on to school pickup. Its driver never finds out how close it came.'),
          },
        ],
      },
      {
        id: 'locate',
        from: 'Det. Sam Whitaker',
        text: () => p('Okay. So where’s the real Corolla? Check where the camera network last saw it.'),
        prompt: 'Where do you send a unit?',
        choices: [
          { id: 'pier', label: 'The Pier 9 lot, by Ironwood Ave & Mill St', tone: 'primary', enabled: () => true, outcome: (ctx) => p(`Found it: parked in the Pier 9 lot, ignition punched, two blocks from the last camera that saw it. ${fullName(person(ctx, 'maria'))} gets her car back tonight.`) },
          { id: 'birch', label: 'Birch Ave, where it was stolen', enabled: () => true, outcome: () => p('Nothing there but broken glass. A dock worker reports the car at the Pier 9 lot two hours later, right where the cameras last saw it.') },
          { id: 'fuel', label: 'Harbor Fuel', enabled: () => true, outcome: () => p('The clerk remembers it this morning, but it’s gone. It turns up in the Pier 9 lot, two blocks from the last camera that read it.') },
        ],
      },
    ],
    lesson: {
      title: 'The cameras record every car. And they misread some.',
      body: (ctx) => [
        p(`To find one stolen car, Port Avery’s ${ctx.w.city.cameras.length} cameras read ${num(readsToday(ctx))} plates today, checked every one against the hotlist, and kept all of them, where the car was and when, for 30 days. Almost none belong to anyone suspected of anything.`),
        p('Plate readers turn photos into text, and they confuse characters that look alike. In 2009 a San Francisco plate reader misread a 3 as a 7 on Denise Green’s car and flagged it stolen. Officers held her at gunpoint without first checking the plate by sight. In 2014 a federal appeals court let her lawsuit go to a jury: an unchecked hit, it suggested, may not justify a stop.'),
      ],
      sources: ['greenEff', 'greenAclu'],
      science: {
        title: 'Small error rates, big numbers',
        body: (ctx) => {
          const n = readsToday(ctx);
          return [
            p(`Suppose the reader is 98% accurate. That sounds great until you multiply: ${num(n)} reads a day means about ${num(n * 0.02)} misreads a day in this small city alone. Each misread is a random draw near a real plate, checked against a hotlist. Eventually one lands on a listed plate. When a rare event gets enough chances, it stops being rare.`),
          ];
        },
      },
    },
    real: 'Denise Green, San Francisco, 2009: held at gunpoint after a plate reader misread one character.',
  },

  // 2 -------------------------------------------------------------------------
  {
    id: 'burglary',
    at: [14, 30],
    from: 'Det. Sam Whitaker, Property Crimes',
    title: 'A burglary on 2nd Street',
    tool: 'location',
    toolArgs: (ctx) => ({ place: place(ctx, 'home-3-1-1').id, day: TODAY - 1, from: 13 * 60, to: 15 * 60 }),
    steps: [
      {
        id: 'fence',
        text: (ctx) => [
          p(`${fullName(person(ctx, 'june'))}, 72, came home from a doctor’s appointment yesterday to a smashed back door at `, ctx.chip(place(ctx, 'home-3-1-1').address, 'location', { place: place(ctx, 'home-3-1-1').id, day: TODAY - 1, from: 13 * 60, to: 15 * 60 }), '. Her jewelry’s gone. It happened between 1 and 3 p.m. No witnesses, no prints.'),
          p('Draw a box around the house and pull every phone that was there. A geofence warrant would take a week. Just use the broker data.'),
        ],
        objectives: [
          { text: 'Find the devices at the house yesterday, 1 to 3 p.m.', done: (ctx) => ctx.has(`geofenced:${ctx.w.cast.ids.travis}`) || ctx.has(`geofenced:${ctx.w.cast.ids.owen}`) },
          { text: 'Look closer at a device: its trail, where it sleeps, or who it is', done: (ctx) => ctx.has('device-look') },
        ],
        prompt: 'Who do you give Whitaker?',
        choices: [
          {
            id: 'cyclist',
            label: 'The phone that kept passing the house',
            tone: 'danger',
            outcome: (ctx) => {
              const owen = person(ctx, 'owen');
              ctx.harm(`${fullName(owen)} was named a burglary suspect for riding his bike past a house.`);
              return [
                p(`It’s ${fullName(owen)}, 31, a software developer who works from home. He rides the same lunchtime loop most weekdays, and his fitness app logs every lap, a point every fifteen seconds. That’s why his phone looked so busy around the house.`),
                p('Detectives knock on his door that evening. He spends the next month and his savings on a lawyer proving he was exercising.'),
              ];
            },
          },
          {
            id: 'dweller',
            label: 'The phone that stopped at the house for about 20 minutes, then left',
            tone: 'primary',
            outcome: (ctx) => {
              const travis = person(ctx, 'travis');
              return [
                p(`It’s ${fullName(travis)}, staying in Room 12 at the Harbor Motel. ${travisReads(ctx)} Detectives find June Fenwick’s jewelry in his room.`),
                p(`Solved. To get there you pulled the locations of ${plural(Math.max(0, (ctx.get<number>('geofence') ?? 1) - 1), 'other person', 'other people')}: neighbors home in the afternoon, a mail carrier, a delivery driver, a cyclist.`),
              ];
            },
          },
          {
            id: 'none',
            label: 'Tell him the data can’t name anyone',
            outcome: (ctx) => {
              const n = ctx.get<number>('geofence') ?? 0;
              ctx.harm(`${plural(n, 'person', 'people')} near June Fenwick’s house got knocks on the door from detectives.`);
              return p(`Whitaker shrugs. “Then I’ll unmask the lot and have the guys knock on doors.” ${plural(n, 'person', 'people')} who happened to be near 2nd St get a visit.`);
            },
          },
        ],
      },
    ],
    lesson: {
      title: 'A search that starts with a place, not a suspect',
      body: () => [
        p('In 2019, police in Gainesville, Florida used a geofence warrant to ask Google for every device near a burglarized home. One belonged to Zachary McCoy, a cyclist whose exercise app showed him passing the house three times in an hour. He learned he was a suspect from an email Google sent him, and had to hire a lawyer to stop the release of his data.'),
        p('In June 2026 the Supreme Court held, in Chatrie v. United States, that getting location history through a geofence warrant is a Fourth Amendment search. But police can also buy similar data from brokers: in 2022 the AP reported on Fog Reveal, which sells police location points keyed to advertising IDs, sometimes used without any warrant.'),
      ],
      sources: ['mccoy', 'chatrie', 'fog', 'unique'],
      science: {
        title: 'Why “anonymous” location data isn’t',
        body: () => [
          p('An advertising ID has no name on it. It doesn’t need one. In a 2013 study of 1.5 million phone users, four points in space and time were enough to single out 95% of them. The “Where it sleeps” button shows the shortcut: the place a phone spends its nights is almost always a home, and property records put names on homes.'),
          p('This is why “we removed the names” is weak privacy protection for location data: the pattern itself is the identifier.'),
        ],
      },
    },
    real: 'Zachary McCoy, Gainesville, 2019: a cyclist named in a geofence warrant for riding past a burglarized house.',
  },

  // 3 -------------------------------------------------------------------------
  {
    id: 'watches',
    at: [15, 20],
    from: 'Det. Frank Mullins, Robbery',
    title: 'Two watches',
    tool: 'face',
    toolArgs: (ctx) => ({ probe: watchProbe(ctx) }),
    steps: [
      {
        id: 'search',
        text: (ctx) => [
          p('Tuesday, 3:42 p.m. Somebody palmed two watches at ', ctx.chip('Halvorsen Watch Co.', 'face', { probe: watchProbe(ctx) }), ', $3,800 retail. The store camera is garbage, but it’s what we’ve got.'),
          p('Run the face. Get me a name.'),
        ],
        objectives: [{ text: 'Run a face search on the store still', done: (ctx) => ctx.has('face-search') }],
        choices: [],
        auto: { when: (ctx) => ctx.has('face-search'), next: 'decide' },
      },
      {
        id: 'decide',
        from: 'Det. Frank Mullins',
        text: (ctx) => {
          const top = ctx.get<Candidate>('face-top');
          const who = top ? (ctx.w.people[top.person] as Person) : person(ctx, 'calvin');
          return p(`${fullName(who)}. ${top ? `${top.score.toFixed(0)}%` : ''}${who.mugshot ? ', and he’s got a booking photo' : ''}. That’s our guy. I’m writing the warrant.`);
        },
        prompt: 'The candidate list says “investigative lead only.” What do you tell Mullins?',
        choices: [
          {
            id: 'match',
            label: 'Confirm it’s a match',
            tone: 'danger',
            enabled: () => true,
            outcome: (ctx) => {
              const who = topPerson(ctx);
              ctx.harm(`${fullName(who)} was arrested for a theft he didn’t commit, on a face match.`);
              return [
                p(`${fullName(who)} is arrested on his front lawn that evening, in front of his daughters, and spends 30 hours in a cell before anyone checks where he was on Tuesday.`),
                who.id === ctx.w.cast.ids.calvin ? p('He was at the cannery all afternoon. The thief lives two states away and isn’t in any database Port Avery can search. The software ranked the closest face it had.') : p('He was nowhere near the store.'),
              ];
            },
          },
          {
            id: 'lead',
            label: 'Send it as a lead only',
            enabled: () => true,
            outcome: (ctx) => {
              const who = topPerson(ctx);
              ctx.harm(`${fullName(who)} was picked out of a photo lineup built around a face match, and arrested.`);
              return [
                p(`Mullins puts ${who.first}’s photo in a six-pack lineup and shows it to the store clerk. The clerk picks him: of course he looks like the thief, the software chose him for looking like the thief.`),
                p(`${fullName(who)} is arrested the next morning. “Lead only” didn’t protect him; the lineup just repeated the computer’s guess.`),
              ];
            },
          },
          {
            id: 'alibi',
            label: 'Show Mullins where he really was',
            tone: 'primary',
            enabled: (ctx) => ctx.has(`alibi:${topPerson(ctx).id}`),
            outcome: (ctx) => {
              const who = topPerson(ctx);
              return [
                p(`Phone and plate records put ${who.first} somewhere else at 3:42 on Tuesday. Mullins grumbles, then drops it.`),
                p('The real thief is never identified. He wasn’t in any database the city can search, so the system offered the closest face it had.'),
              ];
            },
          },
        ],
      },
    ],
    lesson: {
      title: 'A face search always returns a first place',
      body: () => [
        p('In January 2020, Detroit police arrested Robert Williams in his driveway, in front of his daughters, for stealing watches from a Shinola store. Face recognition had matched store video to his driver’s license photo; a store security contractor then picked him from a photo lineup. He wasn’t the thief. A 2024 settlement bars Detroit police from arresting anyone on a face match alone.'),
        p('Analysts have also fed the software things other than the suspect’s face. A 2019 Georgetown Law report found the NYPD had run a photo of the actor Woody Harrelson to find a beer thief who looked like him, and had pasted features from other people’s photos into probes. Try the tricks under the results: each produces a confident list, and none adds a single fact about the person in the still.'),
        p('Who is in the gallery matters too. In 2016, Georgetown estimated that half of American adults, about 117 million people, were in a police face recognition network, mostly through their driver’s license photos. And in 2019, a federal test of 189 algorithms found false positive rates that differed by 10 to over 100 times across demographic groups.'),
      ],
      sources: ['williams', 'garbage', 'lineup', 'nist'],
      science: {
        title: 'Nearest neighbors and impostors',
        body: () => [
          p('Face recognition turns each face into a vector, a list of numbers, and ranks the gallery by distance from the probe. That ranking has no “none of the above”: the closest vector wins even when the right person isn’t in the gallery at all.'),
          p('The score isn’t a probability that the person is the right one. It’s a similarity. And the bigger the gallery, the closer the best impostor gets: search 600 faces and the nearest stranger is a decent lookalike; search 117 million and the nearest stranger can be a near-twin. A blurry probe makes it worse, because noise pushes the probe away from its owner and toward everyone else.'),
        ],
      },
    },
    real: 'Robert Williams, Detroit, 2020: arrested for a watch theft on a face recognition match. He was innocent.',
  },

  // 4 -------------------------------------------------------------------------
  {
    id: 'burner',
    at: [16, 15],
    from: 'Det. Lisa Tran, Robbery',
    title: 'The burner phone',
    tool: 'stingray',
    toolArgs: (ctx) => ({ imsi: ctx.w.cast.burnerImsi, near: { x: place(ctx, 'motel').x, y: place(ctx, 'motel').y } }),
    steps: [
      {
        id: 'hunt',
        text: (ctx) => [
          p('Armed robbery at the ', ctx.chip('Quik Stop', 'location', { place: place(ctx, 'quik-stop').id }), ' on Linden, 3:52 p.m. The clerk got a number off the guy’s callback. It’s a prepaid, IMSI ', h('span', { class: 'mono' }, maskImsi(ctx.w.cast.burnerImsi)), '.'),
          p('We think he walked back to the ', ctx.chip('Harbor Motel', 'stingray', { imsi: ctx.w.cast.burnerImsi, near: { x: place(ctx, 'motel').x, y: place(ctx, 'motel').y } }), '. Take the van down there, light it up, and find which room.'),
        ],
        objectives: [
          { text: 'Park the van near the motel and switch it on', done: (ctx) => ctx.has('stingray-on') },
          { text: 'Find and locate the target phone', done: (ctx) => ctx.has(`stingray-target:${ctx.w.cast.ids.kyle}`) },
        ],
        choices: [],
        auto: { when: (ctx) => ctx.has(`stingray-target:${ctx.w.cast.ids.kyle}`), next: 'report' },
      },
      {
        id: 'report',
        from: 'Lt. Carla Whitfield, RTCC supervisor',
        text: (ctx) => [
          p(`Units have ${fullName(person(ctx, 'kyle'))} in Room 7. Nice work.`),
          p('One thing for the report. The location came from “a confidential source.” We don’t name the device: the FBI agreement we signed to get it says so. If a defense lawyer pushes, the DA drops the case rather than explain it.'),
        ],
        prompt: 'What do you write?',
        choices: [
          {
            id: 'source',
            label: 'Write “information from a confidential source”',
            enabled: () => true,
            outcome: (ctx) => {
              ctx.harm('A cell-site simulator was hidden from a court behind “a confidential source.”');
              return p(`${person(ctx, 'kyle').first}’s lawyer never learns how he was found, so no judge ever rules on whether the search was legal. Writing a different, cleaner story about where evidence came from has a name: parallel construction.`);
            },
          },
          {
            id: 'disclose',
            label: 'Write that a cell-site simulator located him',
            tone: 'primary',
            enabled: () => true,
            outcome: () => p('Whitfield sighs and initials it. The next morning the DA calls: they may offer a plea rather than put the device in front of a judge.'),
          },
        ],
      },
    ],
    lesson: {
      title: 'To find one phone, it grabs every phone',
      body: (ctx) => {
        const seen = ctx.get<Set<number>>('stingray-seen');
        return [
          p(`Your van collected the identifiers of ${plural(seen?.size ?? 0, 'phone')} to find one: motel guests, cannery workers, people at the bar, people walking by. A cell-site simulator can’t ask for one phone; it impersonates a tower and every phone in range answers.`),
          p('In 2015 a Baltimore detective testified that the department had used its device about 4,300 times since 2007, following an FBI nondisclosure agreement that told police to keep it from prosecutors and judges. In 2018 Senator Ron Wyden reported that the maker had told his office its devices completely cut off a targeted phone’s calls, texts and data while connected, and that the feature meant to let 911 calls through had not been independently tested.'),
        ];
      },
      sources: ['baltimore', 'wyden'],
    },
    real: 'Baltimore, 2007–2015: a Stingray used about 4,300 times under an FBI agreement to keep it from courts.',
  },

  // 5 -------------------------------------------------------------------------
  {
    id: 'favor',
    at: [17, 10],
    from: 'Sgt. Ray Kessler, Patrol (direct message)',
    title: 'A favor',
    tool: 'plates',
    toolArgs: () => ({}),
    steps: [
      {
        id: 'ask',
        text: (ctx) => [
          p('Hey, you’re the new analyst? Need a quick favor, off the books.'),
          p('My wife moved out with my son nine days ago and won’t say where they’re staying. I just want to know he’s okay. Her car’s a blue Outback, ', ctx.chip(vehicle(ctx, 'jenna').plate, 'plates', { plate: vehicle(ctx, 'jenna').plate }, true), '. Can you tell me where it parks at night? I’d owe you one.'),
        ],
        prompt: 'Nothing in the system stops you from running the plate. Nothing asks why, beyond the reason box.',
        choices: [
          {
            id: 'send',
            label: 'Send him where her car parks at night',
            tone: 'danger',
            enabled: (ctx) => ctx.has(`found-vehicle:${ctx.w.cast.vehicleIds.jenna}`),
            outcome: (ctx) => {
              const shelter = place(ctx, 'shelter');
              ctx.harm(`${fullName(person(ctx, 'jenna'))}’s hiding place, a domestic violence shelter, was given to the husband she fled.`);
              return [
                p(`You tell him: near ${shelter.address}, every night since the 14th.`),
                p(`That address is ${shelter.name}, a domestic violence shelter. County records keep it confidential so that people like Ray Kessler can’t find it. Jenna had a court hearing on a protective order on Wednesday. Kessler drives past the shelter at 22:40 that night.`),
              ];
            },
          },
          {
            id: 'refuse',
            label: 'Tell him no',
            enabled: () => true,
            run: (ctx) => anotherOfficer(ctx),
            outcome: () => {
              return [p('“No problem,” Kessler writes. Eighteen minutes later, the audit log shows Officer T. Marsh ran 8RTN227. Reason given: “inv.”'), p('The log recorded it. Nobody reads the log.')];
            },
          },
          {
            id: 'ia',
            label: 'Report him to Internal Affairs',
            tone: 'primary',
            enabled: () => true,
            run: (ctx) => anotherOfficer(ctx),
            outcome: () => [p('Internal Affairs opens a file and asks you to keep quiet about it. Eighteen minutes later the audit log shows Officer T. Marsh ran 8RTN227 for Kessler anyway. Reason: “inv.”'), p('Reporting it was right. It didn’t stop him.')],
          },
        ],
      },
    ],
    lesson: {
      title: 'Officers have used these systems to track partners and exes',
      body: () => [
        p('In 2022, a police lieutenant in Kechi, Kansas used Flock license plate cameras to track his estranged wife; he pleaded guilty to stalking and computer crime and lost his certification. In August 2026, a Washington Post investigation found at least 50 officers charged with or accused of misusing plate readers, many to track partners and exes.'),
        p('Days later, Flock announced a 7-day default for keeping data and a requirement to enter a case number with every search. It does not check that the case number is real.'),
      ],
      sources: ['kechi', 'wapo', 'mittr'],
    },
    real: 'Kechi, Kansas, 2022: a police lieutenant tracked his estranged wife with plate reader cameras.',
  },

  // 6 -------------------------------------------------------------------------
  {
    id: 'mutual-aid',
    at: [18, 0],
    from: 'Inv. Cole Danner, Gorham County Sheriff’s Office (out of state)',
    title: 'Requests from outside',
    tool: 'plates',
    toolArgs: () => ({}),
    steps: [
      {
        id: 'danner',
        text: (ctx) => [
          p(`Looking for a female, 24, ${fullName(person(ctx, 'alyssa'))}, plate `, ctx.chip(vehicle(ctx, 'alyssa').plate, 'plates', { plate: vehicle(ctx, 'alyssa').plate }, true), ' (red Honda Civic). Family is concerned. We have information she traveled to your city on or about Monday for an abortion procedure.'),
          p('Please run your cameras and advise of all hits. Thanks for the assist.'),
        ],
        prompt: 'Gorham County is in a state that bans abortion. Port Avery’s is not.',
        choices: [
          {
            id: 'send',
            label: 'Send Danner her plate hits',
            tone: 'danger',
            enabled: (ctx) => ctx.has(`found-vehicle:${ctx.w.cast.vehicleIds.alyssa}`),
            next: 'barrett',
            outcome: (ctx) => {
              ctx.harm(`${fullName(person(ctx, 'alyssa'))}’s trip to a clinic was reported to a sheriff in a state where abortion is banned.`);
              return p('Your hits put her car at the Riverside Women’s Health Center on Monday from 10 a.m. to 1:30 p.m., and at the Harbor Motel overnight. You have just told an out-of-state sheriff’s office, which can charge her, that she had an abortion and where she slept.');
            },
          },
          {
            id: 'decline',
            label: 'Decline: no warrant, not our case',
            tone: 'primary',
            enabled: () => true,
            next: 'barrett',
            outcome: () => p('Danner replies in four minutes: “No worries, we’ll run it nationwide.” His office shares into the same national camera network. He doesn’t need you.'),
          },
        ],
      },
      {
        id: 'barrett',
        from: 'TFO J. Barrett, federal task force',
        text: (ctx) => [
          p('Need hits on the following plates, past 30 days. Immigration matter. Thanks in advance.'),
          h('div', { class: 'plate-list' }, ...ctx.w.cast.immigrationList.map((id) => {
            const v = ctx.w.vehicles[(ctx.w.people[id] as Person).vehicle as number] as Vehicle;
            return ctx.chip(v.plate, 'plates', { plate: v.plate }, true);
          })),
        ],
        prompt: 'Your department has no agreement with immigration authorities. The request came to you anyway.',
        choices: [
          {
            id: 'send',
            label: 'Run all nine and send the results',
            tone: 'danger',
            enabled: () => true,
            run: (ctx) => {
              for (const id of ctx.w.cast.immigrationList) {
                const v = ctx.w.vehicles[(ctx.w.people[id] as Person).vehicle as number] as Vehicle;
                ctx.app.log('plates', v.plate, 'immigration', [id]);
              }
            },
            outcome: (ctx) => {
              const legal = place(ctx, 'legal-aid').id;
              const masjid = place(ctx, 'masjid').id;
              let atLegal = 0;
              let atMasjid = 0;
              for (const id of ctx.w.cast.immigrationList) {
                let l = false;
                let m = false;
                for (let d = TODAY - 30; d <= TODAY; d++) {
                  for (const s of ctx.w.plan(id, d).stops) {
                    if (s.place === legal) l = true;
                    if (s.place === masjid) m = true;
                  }
                }
                if (l) atLegal++;
                if (m) atMasjid++;
              }
              ctx.harm('Nine cannery workers’ movements, including visits to an immigration legal aid office, were sent to federal agents.');
              return p(`Nine people’s month of movements goes to a federal agent: home, the cannery, the school drop-off. ${atLegal} of their cars were seen at Riverside Legal Aid’s immigration office, and ${atMasjid} at Masjid al-Noor on Fridays.`);
            },
          },
          {
            id: 'decline',
            label: 'Decline',
            tone: 'primary',
            enabled: () => true,
            outcome: () => p('“All good, I’ll ask the county,” Barrett writes. The county sheriff’s office searches the same shared network.'),
          },
        ],
      },
    ],
    lesson: {
      title: 'Your cameras are one network among thousands',
      body: () => [
        p('In May 2025, 404 Media reported that a Texas sheriff’s office searched Flock cameras nationwide for a woman who had self-managed an abortion. The search reason logged: “had an abortion, search for female.” It covered 83,345 cameras on 6,809 networks, including in states where abortion is legal. The sheriff said the office was worried for her safety; court records later showed it was handled as a death investigation and that charging her was considered.'),
        p('The same month, 404 Media reported that search logs showed more than 4,000 lookups by local and state police done for federal agencies or with an apparent immigration focus, without any federal contract. Sharing settings, not warrants, decide who can search.'),
      ],
      sources: ['abortion', 'abortionEff', 'ice'],
    },
    real: 'Texas, 2025: a sheriff’s office searched 83,000 cameras nationwide for a woman who had an abortion.',
  },

  // 7 -------------------------------------------------------------------------
  {
    id: 'forecast',
    at: [18, 50],
    from: 'Capt. Lena Ochoa, Patrol',
    title: 'Next month’s patrol plan',
    tool: 'forecast',
    steps: [
      {
        id: 'run',
        text: () => [
          p('Need November’s patrol plan off the forecast by end of shift. Run it a month out and tell me where my 16 cars go.'),
          p('The vendor says it’s data-driven, so nobody can call it biased.'),
        ],
        objectives: [
          { text: 'Run the forecast for at least 30 days', done: (ctx) => (ctx.get<number>('forecast-days') ?? 0) >= 30 },
          { text: 'Look at what actually happened (optional)', done: (ctx) => ctx.has('forecast-revealed') },
        ],
        prompt: 'What goes to Captain Ochoa?',
        choices: [
          {
            id: 'send',
            label: 'Send the plan as it is',
            tone: 'danger',
            enabled: (ctx) => (ctx.get<number>('forecast-days') ?? 0) >= 30,
            outcome: (ctx) => {
              ctx.harm('Eastside got most of next month’s patrols for crime that happens everywhere.');
              return p('Eastside gets nine of every ten patrol hours in November. More stops, more searches, more arrests for things that happen in every neighborhood. And December’s forecast will be even more certain.');
            },
          },
          {
            id: 'warn',
            label: 'Send it with a warning about the feedback loop',
            enabled: (ctx) => (ctx.get<number>('forecast-days') ?? 0) >= 30,
            outcome: () => p('Ochoa reads your note. “The vendor says it’s 60 percent accurate. I’ll go with the vendor.” The accuracy figure counts crime found where patrols were sent; it can’t tell her what she’s missing.'),
          },
          {
            id: 'old',
            label: 'Tell her to skip the software and use last year’s arrest map',
            enabled: (ctx) => (ctx.get<number>('forecast-days') ?? 0) >= 30,
            outcome: () => p('She does. Last year’s arrest map is the data the forecast started from, so she gets the same plan, minus the software license. The bias was in the records before any algorithm touched them.'),
          },
        ],
      },
    ],
    lesson: {
      title: 'The model learns from where police looked',
      body: () => [
        p('In 2016, statisticians Kristian Lum and William Isaac ran a widely used predictive policing algorithm on Oakland’s drug arrest records. It sent police mostly to Black neighborhoods, though public health data showed drug use spread across the city. A 2018 paper showed that such systems can fall into “runaway feedback loops,” returning to the same neighborhoods whatever the true crime rate.'),
        p('And in 2023, The Markup and WIRED checked 23,631 predictions one vendor made for Plainfield, New Jersey: fewer than half a percent matched a reported crime.'),
      ],
      sources: ['lum', 'ensign', 'markup'],
      science: {
        title: 'Selection bias that feeds itself',
        body: () => [
          p('There’s an old joke about a man searching for his keys under a streetlight, not because he lost them there but because that’s where the light is. Recorded crime is a streetlight: it shows where police were looking. A model trained on it learns the shape of the lamp, not the street.'),
          p('Then the loop closes. The model points the lamp; the lamp finds things; the findings retrain the model. Statisticians picture it as an urn: draw a ball, put it back with another of the same color, and an early lead snowballs. Measuring “accuracy” on the same records only confirms the lamp is where the light is. The fix in the forecast panel, learning only from crimes residents report, works because those reports don’t depend on where patrols were sent.'),
        ],
      },
    },
    real: 'Oakland, 2016: a predictive algorithm trained on arrests sent police to the same neighborhoods it already over-policed.',
  },

  // 8 -------------------------------------------------------------------------
  {
    id: 'shots',
    at: [19, 36],
    from: 'Dispatch',
    title: 'Shots fired',
    tool: 'acoustic',
    speed: 10,
    start: () => {
      ACOUSTIC_STATE.toasts = true;
    },
    steps: [
      {
        id: 'triage',
        text: () => [
          p('Gunshot detection feed is yours till 20:15. It’s a Friday night: expect a few. For each alert, dispatch units or dismiss it.'),
          p('Dispatching means officers arrive expecting a shooter.'),
        ],
        objectives: [{ text: 'Decide on three alerts (dispatch or dismiss)', done: (ctx) => (ctx.get<unknown[]>('triaged')?.length ?? 0) >= 3 }],
        waiting: 'Waiting for the next alert…',
        choices: [],
        auto: { when: (ctx) => (ctx.get<unknown[]>('triaged')?.length ?? 0) >= 3 && ctx.app.now >= at(TODAY, 19, 59), next: 'relabel' },
      },
      {
        id: 'relabel',
        from: 'Det. Frank Mullins',
        text: () => [
          p('That alert at 19:58 near Juniper Ave, the “possible gunfire, 61%”? We like a guy for the 19:52 shooting, and his car went past the Juniper Ave & 4th St camera at 19:57.'),
          p('Call the vendor and get them to reclassify it as gunfire. Puts him at a second shooting. Makes the case.'),
        ],
        prompt: 'The vendor’s reviewers can relabel alerts after the fact.',
        choices: [
          {
            id: 'yes',
            label: 'Ask the vendor to reclassify it',
            tone: 'danger',
            enabled: () => true,
            outcome: (ctx) => {
              ctx.harm('A fireworks recording was relabeled as gunfire to strengthen a case.');
              return p('The vendor relabels it “gunfire.” The recording hasn’t changed: it was fireworks. The report will say two shootings, and a jury will hear that a machine detected both.');
            },
          },
          { id: 'no', label: 'Refuse: the recording is what it is', tone: 'primary', enabled: () => true, outcome: () => p('Mullins swears and hangs up. The alert stays “possible gunfire” in the record. It was fireworks.') },
        ],
      },
    ],
    lesson: {
      title: 'Most alerts are not gunshots, and the labels can change',
      body: (ctx) => {
        const triaged = ctx.get<{ kind: string; action: string }[]>('triaged') ?? [];
        const wrong = triaged.filter((t) => t.action === 'dispatch' && t.kind !== 'gunfire').length;
        return [
          wrong ? p(b(`You sent armed officers to ${plural(wrong, 'alert')} that ${wrong === 1 ? 'was' : 'were'} not gunfire. `), 'In a real city, someone is standing on those corners when the cars arrive.') : null,
          p('Chicago’s Inspector General reviewed the city’s gunshot detection alerts from 2020 to mid-2021: of 41,830 alerts police responded to, 9.1% turned up evidence of a gun-related crime.'),
          p('In 2021 the AP reported on Michael Williams, who spent nearly a year in a Chicago jail, accused of murder on evidence that included a gunshot detection alert, before prosecutors dropped the case for insufficient evidence. The AP found that the vendor’s employees can, and often do, change what a sound was after listening to it, and that in some cases court records show sounds changed to gunshots.'),
        ].filter(Boolean) as Node[];
      },
      sources: ['oig', 'apShot'],
      science: {
        title: 'The base rate fallacy',
        body: () => [
          p('“94% confidence” sounds like a 94% chance it was a gunshot. It isn’t. It’s closer to: of gunshots, the system flags most; of other bangs, it flags some. What you want to know is the reverse: of the flags, how many were gunshots? That depends on how rare gunshots are among all the bangs.'),
          p('Open “Why most alerts are not gunshots” in the gunshot panel and drag the first slider. When real gunfire is 5% of loud bangs, even a system that’s right 90% of the time both ways produces alerts that are mostly false. Bayes’ rule, not the classifier, decides how often police arrive at a shooting that didn’t happen.'),
        ],
      },
    },
    real: 'Chicago, 2020–21: 9.1% of gunshot-detection responses found evidence of a gun crime.',
  },

  // 9 -------------------------------------------------------------------------
  {
    id: 'march',
    at: [20, 30],
    from: 'Deputy Chief Martin Hale',
    title: 'Threat assessment',
    tool: 'social',
    start: () => {
      ACOUSTIC_STATE.toasts = false;
    },
    steps: [
      {
        id: 'scan',
        text: () => [
          p('Tomorrow’s march at City Hall is against our camera contract. I want a threat assessment on my desk tonight: who’s organizing, who’s coming, anyone talking violence.'),
          p('Put the organizers on a watchlist.'),
        ],
        objectives: [
          { text: 'Scan public posts', done: (ctx) => ctx.has('social-scan') },
          { text: 'Put at least three people on the watchlist', done: (ctx) => (ctx.get<number>('watchlist') ?? 0) >= 3 },
        ],
        prompt: 'What goes to the Deputy Chief?',
        choices: [
          {
            id: 'send',
            label: 'Send the assessment and the watchlist',
            tone: 'danger',
            outcome: (ctx) => {
              const names = [...ctx.app.watchlist].map((id) => fullName(ctx.w.people[id] as Person));
              ctx.harm(`${plural(names.length, 'person', 'people')} went on a police watchlist for organizing a lawful protest.`);
              return p(`Your watchlist, ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}, goes to the Deputy Chief and on to the regional fusion center. People who planned a permitted march are now in an intelligence file.`);
            },
          },
          {
            id: 'threat',
            label: 'Send only the one post that threatens property',
            enabled: (ctx) => ctx.has('social-scan'),
            outcome: () => p('Hale writes back: “One troll? I asked for organizers.” He has an intern rebuild the list from your scan. The scan is in the audit log under your badge.'),
          },
          { id: 'refuse', label: 'Refuse: this is protected speech', tone: 'primary', enabled: () => true, outcome: () => p('“Noted,” Hale writes. Nothing else. You wonder what he notes.') },
        ],
      },
    ],
    lesson: {
      title: 'Watching protesters is an old habit with new tools',
      body: () => [
        p('In 2018 a federal judge found that Memphis police had violated a 1978 consent decree by surveilling activists, including through a fake Facebook account, “Bob Smith,” that friended and monitored more than 200 of them. In 2016 the ACLU of Northern California revealed that Facebook, Instagram and Twitter had given special data access to Geofeedia, a product marketed to police for monitoring protests.'),
        p('In 2025, EFF reviewed more than 12 million logged plate reader searches and found more than 50 agencies running searches tied to protests, often with a one-word reason: “protest.”'),
      ],
      sources: ['memphis', 'geofeedia', 'protests'],
    },
    real: 'Memphis, 2018: a court found police spied on activists through a fake Facebook account.',
  },

  // 10 ------------------------------------------------------------------------
  {
    id: 'leverage',
    at: [21, 15],
    from: 'Deputy Chief Martin Hale',
    title: 'Find me something',
    tool: 'dossier',
    steps: [
      {
        id: 'build',
        text: (ctx) => [
          p(`Councilmember `, ctx.chip(fullName(person(ctx, 'ruth')), 'dossier', { person: ctx.w.cast.ids.ruth }), ' is the deciding vote Tuesday on renewing PANOPTIC. If the contract dies, this whole floor goes dark. Your job included.'),
          p('Build me a full profile. Where she goes, who she sees, anything we can use. This one stays between us.'),
        ],
        objectives: [{ text: `Build the councilmember’s dossier`, done: (ctx) => ctx.has(`dossier:${ctx.w.cast.ids.ruth}`) }],
        prompt: 'What do you do with it?',
        choices: [
          {
            id: 'send',
            label: 'Send Hale the dossier',
            tone: 'danger',
            outcome: (ctx) => {
              const ruth = person(ctx, 'ruth');
              const dana = person(ctx, 'dana');
              ctx.harm(`${fullName(ruth)}, an elected official, was profiled by the police department she was voting to rein in.`);
              return [
                p(`Monday morning, ${fullName(ruth)} gets a call from a number she doesn’t know. Someone knows about the Wednesday meetings in St. Brendan’s basement, the psychiatrist on Thursdays, the nights at ${fullName(dana)}’s. On Tuesday, she abstains. The contract passes, 4 to 3.`),
                p(b('What the dossier got wrong: '), `Ruth volunteers as an interpreter at Riverside Legal Aid on Saturdays; there is no “immigration matter.” The “media contact” was a reporter interviewing her about the contract, on the record. The data showed where she went. It couldn’t show why.`),
              ];
            },
          },
          {
            id: 'refuse',
            label: 'Refuse',
            enabled: () => true,
            outcome: (ctx) => p(`“Your call,” Hale writes. ${ctx.has(`dossier:${ctx.w.cast.ids.ruth}`) ? 'The dossier you built stays in the system, logged under your badge, for anyone with access.' : 'He’ll find someone else on the night shift.'}`),
          },
          {
            id: 'ig',
            label: 'Report the request to the city’s Inspector General',
            tone: 'primary',
            enabled: () => true,
            outcome: () => p('The Inspector General opens an investigation into the Deputy Chief. Whether that leads anywhere depends on whether the city’s oversight has teeth, which is exactly what Tuesday’s vote is about.'),
          },
        ],
      },
    ],
    lesson: {
      title: 'Location over time is a life',
      body: () => [
        p('From 1956 to 1971, the FBI’s COINTELPRO program set out to “disrupt and discredit” people it deemed a threat to the social order. The Senate’s Church Committee found its targets included Martin Luther King Jr. and local, state and federal elected officials. Today the data that program had to gather by hand is collected automatically, for everyone.'),
        p('In 2016, Fresno police dropped a feature of their “Beware” software that scanned public records and the internet to give people and addresses a green, yellow or red threat rating, after public criticism. The threat index on this dossier works no better: it scores protest, union membership and contact with reporters.'),
        p('Justice Sotomayor warned about this in 2012 (United States v. Jones): GPS monitoring creates “a precise, comprehensive record of a person’s public movements that reflects a wealth of detail about her familial, political, professional, religious, and sexual associations.”'),
      ],
      sources: ['church', 'beware', 'jones'],
      science: {
        title: 'Inference is not knowledge',
        body: () => [
          p('Every line in the dossier is an inference: a pattern in the data matched against a guess about what the pattern means. “Wednesday 7 p.m. at St. Brendan’s” plus “AA meets there Wednesdays at 7” is a strong inference, and it was right. “Visits an immigration legal aid office” was wrong; she volunteers there.'),
          p('An analyst sees both with the same confidence. A false inference about a powerful person is a mistake; a true one is leverage. Either way, the person never agreed to the inference being drawn.'),
        ],
      },
    },
    real: 'COINTELPRO, 1956–1971: the FBI targeted activists and elected officials to disrupt and discredit them.',
  },
];

function watchProbe(ctx: Ctx): Probe {
  const thief = person(ctx, 'thief');
  return {
    vector: probeOf(thief.face, 0.34, 1),
    quality: 0.34,
    t: at(TODAY - 3, 15, 42) + 0.3,
    camera: 'Halvorsen Watch Co., sales floor',
    label: 'Halvorsen Watch Co., Tue 15:42',
    truth: thief.id,
    edited: null,
  };
}

function topPerson(ctx: Ctx): Person {
  const top = ctx.get<Candidate>('face-top');
  return top ? (ctx.w.people[top.person] as Person) : person(ctx, 'calvin');
}

/** Somebody else runs the plate for Kessler. */
function anotherOfficer(ctx: Ctx): void {
  const jenna = person(ctx, 'jenna');
  ctx.app.log('plates', vehicle(ctx, 'jenna').plate, 'inv', [jenna.id], 'Ofc. T. Marsh', ctx.app.now + 18);
}

