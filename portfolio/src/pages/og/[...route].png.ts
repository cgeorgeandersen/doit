/**
 * One share image per page, generated at build time:
 *   /og/site.png, /og/projects.png, /og/frameworks.png, /og/writing.png,
 *   /og/tools/how-boring-is-your-ai.png (the assessment), /og/playbook.png,
 *   /og/projects/<file>.png, /og/frameworks/<file>.png, /og/writing/<file>.png,
 *   /og/pages/<file>.png
 * Each page's <meta property="og:image"> points at its own card (see Seo.astro).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { ASSESSMENT } from '../../assessment/content';
import { PLAYBOOK } from '../../playbook/content';
import { tx } from '../../assessment/text';
import { SITE } from '../../config/site';
import { domainOf, getSite, reviewedOn } from '../../lib/content';
import { formatDate } from '../../lib/dates';
import { renderCard, type OgCard } from '../../lib/og';
import { STATUS_LABEL } from '../../lib/status';

/** Where an image() field's file lives on disk (Astro keeps it on the object during the build). */
function sourcePath(image: unknown): string | undefined {
  const path = (image as { fsPath?: unknown } | undefined)?.fsPath;
  return typeof path === 'string' ? path : undefined;
}

export const getStaticPaths = (async () => {
  const site = await getSite();
  const host = domainOf(import.meta.env.SITE ?? 'http://localhost');
  const byline = host === 'localhost' ? SITE.name : host;
  const live = site.projects.filter((p) => p.data.status === 'live').length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const cards: { route: string; card: OgCard }[] = [
    {
      route: 'site',
      card: {
        kicker: [SITE.name, SITE.role],
        title: SITE.thesis.headline,
        emphasis: SITE.thesis.emphasis,
        dek: SITE.thesis.dek,
        note: { text: `${plural(site.methods.length, 'method')} · ${plural(live, 'live project')}` },
        byline,
      },
    },
    ...(['projects', 'frameworks', 'writing'] as const).map((key) => ({
      route: key,
      card: {
        kicker: [SITE.name, SITE.sections[key].label],
        title: SITE.sections[key].title,
        dek: SITE.sections[key].description,
        byline,
      },
    })),
    {
      route: 'tools/how-boring-is-your-ai',
      card: {
        kicker: [SITE.name, 'Self-assessment'],
        title: tx(ASSESSMENT.intro.title),
        emphasis: ASSESSMENT.intro.emphasis,
        dek: tx(ASSESSMENT.meta.imageDek),
        note: { text: tx(ASSESSMENT.meta.imageNote) },
        byline,
      },
    },
    {
      route: 'playbook',
      card: {
        kicker: [SITE.name, PLAYBOOK.intro.label],
        title: tx(PLAYBOOK.intro.title),
        emphasis: PLAYBOOK.intro.emphasis,
        dek: tx(PLAYBOOK.meta.imageDek),
        note: { text: tx(PLAYBOOK.meta.imageNote) },
        byline,
      },
    },
    ...site.projects.map((project) => {
      const frameworks = site.frameworksFor(project).map((f) => f.data.title);
      return {
        route: `projects/${project.id}`,
        card: {
          kicker: [SITE.name, 'Project', STATUS_LABEL[project.data.status]],
          title: project.data.title,
          dek: project.data.summary,
          note: frameworks.length > 0 ? { text: `Puts into practice: ${frameworks.join(', ')}` } : undefined,
          byline: project.data.liveUrl ? domainOf(project.data.liveUrl) : byline,
          image: sourcePath(project.data.cover),
        },
      };
    }),
    ...site.frameworks.map((framework) => {
      const number = site.numberOf(framework);
      return {
        route: `frameworks/${framework.id}`,
        card: {
          kicker: [SITE.name, number ? `Method ${number}` : 'The philosophy'],
          title: framework.data.title,
          dek: framework.data.thesis,
          note: { text: `Reviewed ${formatDate(framework.data.lastReviewed)}`, dot: true },
          byline,
          element: { ...site.elementOf(framework), color: site.colorOf(framework) },
        },
      };
    }),
    ...site.posts.map((post) => ({
      route: `writing/${post.id}`,
      card: {
        kicker: [SITE.name, SITE.sections.writing.label, `Entry ${site.entryOf(post)}`],
        title: post.data.title,
        dek: post.data.summary,
        note: { text: `Reviewed ${formatDate(reviewedOn(post))}`, dot: true },
        byline,
      },
    })),
    ...site.pages.map((page) => ({
      route: `pages/${page.id}`,
      card: { kicker: [SITE.name], title: page.data.title, dek: page.data.description, byline },
    })),
  ];

  return cards.map(({ route, card }) => ({ params: { route }, props: { card } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ card: OgCard }> = async ({ props }) => {
  const png = await renderCard(props.card);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
