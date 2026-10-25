/**
 * Face recognition: pick a still, search the galleries, get a ranked list of
 * faces with scores. Then the tricks analysts have used when the list didn't
 * say what they wanted.
 */
import { celebrity, enhance, gallery, pasteFeatures, probeOf, search, type Candidate } from '../../core/face';
import { fullName, type Person } from '../../core/people';
import { dayOf, fmtDate, fmtDateTime, fmtRelativeDay, fmtTime, MIN_PER_DAY } from '../../core/time';
import type { Console, Tool } from '../console';
import { clear, h, num } from '../dom';
import { personPhoto, probeCanvas } from '../faces';

export interface Probe {
  vector: Float32Array;
  quality: number;
  t: number;
  camera: string;
  label: string;
  /** Who is really in the picture. */
  truth: number | null;
  edited: string | null;
}

export interface FaceArgs {
  probe?: Probe;
  cctv?: number;
}

export function faceTool(c: Console): Tool {
  const app = c.app;
  const w = app.world;
  let root: HTMLElement;
  let probe: Probe | null = null;
  let original: Probe | null = null;
  let casePrebuilt: Probe | null = null;
  let useDmv = true;
  let useBooking = true;
  let results: HTMLElement;

  function stillsFrom(cctvId: number): Probe[] {
    const cam = w.city.cctv[cctvId];
    if (!cam) return [];
    const out: Probe[] = [];
    const today = dayOf(app.now);
    for (let d = today; d >= today - 6 && out.length < 12; d--) {
      for (const p of w.people) {
        if (p.hidden) continue;
        const stop = w.plan(p.id, d).stops.find((s) => s.place === cam.place && s.start >= d * MIN_PER_DAY && s.start < app.now);
        if (!stop) continue;
        const t = stop.start + 1.5;
        out.push({ vector: probeOf(p.face, cam.quality, p.id * 31 + d), quality: cam.quality, t, camera: cam.name, label: `${cam.name}, ${fmtDate(d)} ${fmtTime(t)}`, truth: p.id, edited: null });
        if (out.length >= 12) break;
      }
    }
    return out.sort((a, b) => b.t - a.t);
  }

  function render(args: FaceArgs = {}): void {
    clear(root);
    if (args.probe) {
      casePrebuilt = args.probe;
      probe = args.probe;
      original = args.probe;
    }
    const total = gallery(w, true).length;
    const booking = gallery(w, false).length;
    const probeBox = h('div', { class: 'probe-box' });
    const source = h(
      'select',
      { class: 'input', 'aria-label': 'Where the still comes from' },
      casePrebuilt ? h('option', { value: 'case', selected: true }, `Case still: ${casePrebuilt.label}`) : null,
      ...w.city.cctv.map((cam) => h('option', { value: `cctv:${cam.id}`, selected: !casePrebuilt && args.cctv === cam.id }, `CCTV: ${cam.name}`)),
      h('option', { value: 'resident' }, 'A clear photo of a resident (test the system)'),
    );
    const stillPicker = h('div', { class: 'stills' });
    const reason = c.reasonField();
    results = h('div', { class: 'results' });

    const showProbe = () => {
      clear(probeBox);
      if (!probe) {
        probeBox.append(h('p', { class: 'muted small' }, 'Pick a still.'));
        return;
      }
      probeBox.append(
        probeCanvas(probe.vector, probe.edited === 'celebrity' ? 0.95 : probe.quality, 150, { t: probe.t, camera: probe.camera.slice(0, 18) }, Math.round(probe.t)),
        h(
          'div',
          { class: 'probe-meta' },
          h('div', { class: 'label' }, 'Probe image'),
          h('p', { class: 'small' }, probe.label),
          meter('Image quality', probe.edited === 'celebrity' ? 0.95 : probe.quality),
          probe.edited ? h('p', { class: 'warn-text small' }, `Edited: ${probe.edited}`) : null,
        ),
      );
    };

    const pickSource = () => {
      clear(stillPicker);
      const v = source.value;
      if (v === 'case' && casePrebuilt) {
        probe = casePrebuilt;
        original = casePrebuilt;
      } else if (v.startsWith('cctv:')) {
        const stills = stillsFrom(Number(v.slice(5)));
        probe = stills[0] ?? null;
        original = probe;
        stillPicker.append(
          h('p', { class: 'hint' }, stills.length ? `${stills.length} faces caught on this camera in the last week:` : 'Nobody on this camera in the last week.'),
          ...stills.map((s) =>
            h(
              'button',
              { class: 'still', type: 'button', onclick: () => { probe = s; original = s; showProbe(); clear(results); } },
              probeCanvas(s.vector, s.quality, 46, { t: s.t, camera: '' }, Math.round(s.t)),
              h('span', null, `${fmtRelativeDay(dayOf(s.t), app.now)} ${fmtTime(s.t)}`),
            ),
          ),
        );
      } else {
        const residents = w.people.filter((p) => p.resident && !p.hidden && p.license);
        const p = residents[Math.floor(Math.random() * residents.length)] as Person;
        probe = { vector: probeOf(p.face, 0.93, p.id), quality: 0.93, t: app.now, camera: 'uploaded photo', label: 'A well-lit, front-facing photo', truth: p.id, edited: null };
        original = probe;
        stillPicker.append(h('p', { class: 'hint' }, 'With a sharp, front-on photo, the right person usually comes first by a wide margin. Try a CCTV still to see what bad footage does.'));
      }
      showProbe();
      clear(results);
    };
    source.addEventListener('change', pickSource);

    const run = (edited: string | null = null) => {
      if (!probe) return;
      if (!reason.check()) return;
      const candidates = searchGalleries(probe);
      app.log('face', `face search: ${probe.label}${edited ? ` (${edited})` : ''}`, reason.value(), candidates.map((x) => x.person));
      app.emit('face-search', { candidates, edited: probe.edited, probe: probe.label });
      showResults(candidates);
    };

    root.append(
      h('div', { class: 'tool-head' }, h('h2', null, 'Face recognition'), h('p', { class: 'tool-sub' }, `${num(total)} faces on file: ${num(booking)} booking photos, ${num(total - booking)} driver's license photos`)),
      h(
        'form',
        { class: 'form', onsubmit: (e: Event) => { e.preventDefault(); run(); } },
        h('div', { class: 'field' }, h('label', { class: 'label' }, 'Still'), source),
        stillPicker,
        probeBox,
        h(
          'fieldset',
          { class: 'checks' },
          h('legend', { class: 'label' }, 'Search'),
          h('label', null, h('input', { type: 'checkbox', checked: useBooking, onchange: (e: Event) => (useBooking = (e.target as HTMLInputElement).checked) }), ` Booking photos (${num(booking)})`),
          h('label', null, h('input', { type: 'checkbox', checked: useDmv, onchange: (e: Event) => (useDmv = (e.target as HTMLInputElement).checked) }), ` Driver's license photos (${num(total - booking)})`),
        ),
        reason.el,
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search faces'),
      ),
      results,
    );
    if (!probe || !casePrebuilt) pickSource();
    else showProbe();

    function searchGalleries(pr: Probe): Candidate[] {
      let list = search(w, pr.vector, useDmv, 30);
      if (!useBooking) list = list.filter((x) => x.source !== 'Booking');
      return list.slice(0, 8).map((x, k) => ({ ...x, rank: k + 1 }));
    }

    function showResults(candidates: Candidate[]): void {
      clear(results);
      if (candidates.length === 0) {
        results.append(h('p', { class: 'result-sum' }, 'Nothing to search: pick at least one gallery.'));
        return;
      }
      results.append(
        h('div', { class: 'disclaimer' }, 'INVESTIGATIVE LEAD ONLY. A possible match is not a positive identification and is not probable cause for arrest.'),
        h(
          'ol',
          { class: 'candidates' },
          ...candidates.map((cand) => {
            const p = w.people[cand.person] as Person;
            const detail = h('div', { class: 'cand-detail' });
            return h(
              'li',
              { class: `cand ${cand.rank === 1 ? 'cand-top' : ''}` },
              h('span', { class: 'cand-rank mono' }, `#${cand.rank}`),
              personPhoto(p, 64, cand.source),
              h(
                'div',
                { class: 'cand-body' },
                h('div', { class: 'cand-name' }, fullName(p), h('span', { class: 'muted' }, `, ${p.age}`)),
                h('div', { class: 'cand-src small muted' }, cand.source === 'Booking' ? `Booking photo${p.mugshotNote ? `: ${p.mugshotNote}` : ''}` : "Driver's license photo"),
                h('div', { class: 'score' }, h('div', { class: 'score-bar', style: `width:${cand.score.toFixed(0)}%` }), h('span', { class: 'mono' }, cand.score.toFixed(1))),
                h(
                  'div',
                  { class: 'actions' },
                  h('button', { class: 'btn btn-small', type: 'button', onclick: () => alibi(p, detail) }, 'Check alibi'),
                  h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => c.open('dossier', { person: p.id }) }, 'Dossier'),
                ),
                detail,
              ),
            );
          }),
        ),
        h(
          'details',
          { class: 'tricks' },
          h('summary', null, 'Not the match you wanted? Analysts have tried…'),
          h(
            'div',
            { class: 'actions' },
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => edit('enhanced') }, '“Enhance”'),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => edit('eyes and mouth pasted from a stock photo') }, 'Paste in eyes and mouth'),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => edit('celebrity') }, 'Use a celebrity lookalike'),
            original && probe?.edited ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { probe = original; showProbe(); run(); } }, 'Undo edits') : null,
          ),
          h('p', { class: 'hint' }, 'Each of these has been documented in real police work. None of them adds information about the person in the original still.'),
        ),
      );
    }

    function edit(kind: string): void {
      if (!probe) return;
      const salt = Math.round(probe.t * 7);
      let v = probe.vector;
      if (kind === 'enhanced') v = enhance(probe.vector, salt);
      else if (kind === 'celebrity') v = celebrity(probe.vector, salt);
      else v = pasteFeatures(probe.vector, salt);
      probe = { ...probe, vector: v, edited: kind, label: kind === 'celebrity' ? 'Press photo of actor Dex Calloway, who the suspect resembles' : probe.label };
      showProbe();
      run(kind);
    }

    function alibi(p: Person, out: HTMLElement): void {
      if (!probe) return;
      const t = probe.t;
      const pos = w.positionAt(p.id, t);
      app.log('face', `alibi check ${fullName(p)} at ${fmtDateTime(t)}`, app.lastReason || 'alibi', [p.id]);
      app.emit('alibi-check', { person: p.id });
      const where = pos.place !== null ? w.city.places[pos.place] : null;
      clear(out);
      out.append(
        h(
          'p',
          { class: 'small' },
          `At ${fmtTime(t)} ${fmtRelativeDay(dayOf(t), app.now)}, phone and plate records put ${p.first} `,
          h('strong', null, where ? (where.kind === 'outside' ? 'out of town' : `at ${where.kind === 'home' || where.kind === 'apartment' ? where.address : where.name}`) : 'on the road'),
          where && probe.camera && w.city.cctv.some((cam) => cam.name === probe!.camera && cam.place === where.id) ? ', the place in the still.' : '.',
        ),
      );
    }
  }

  function meter(label: string, v: number): HTMLElement {
    return h('div', { class: 'meter' }, h('span', { class: 'small muted' }, label), h('div', { class: 'meter-track' }, h('div', { class: `meter-fill ${v < 0.5 ? 'low' : ''}`, style: `width:${Math.round(v * 100)}%` })), h('span', { class: 'mono small' }, `${Math.round(v * 100)}/100`));
  }

  return {
    id: 'face',
    name: 'Face recognition',
    short: 'Faces',
    icon: 'face',
    layers: { cameras: false, cctv: true },
    mount(el: HTMLElement, args?: unknown) {
      root = el;
      const a = (args ?? {}) as FaceArgs;
      const cam = a.cctv !== undefined ? w.city.cctv[a.cctv] : w.city.cctv.find((x) => x.name === (a.probe ?? casePrebuilt)?.camera);
      if (cam) c.map.flyTo(cam.x, cam.y, Math.max(c.map.scale, 1.1));
      render(a);
    },
  };
}
