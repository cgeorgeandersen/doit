/**
 * The content model. Each collection is a folder of Markdown files under
 * src/content/, and each file's frontmatter is checked against a schema here
 * at build time. A missing or malformed field stops the build with a message
 * that names the file, the field, and what it should contain.
 *
 * Links between content are stored once: a project lists the frameworks it
 * puts into practice, and each framework's list of projects is derived from
 * that (see src/lib/content.ts).
 */
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { PROJECT_STATUSES } from './lib/status';
import { typeset } from './lib/typeset';

/** Plain-English errors: one message when the field is missing, another when it's present but wrong. */
function explain(missing: string, invalid = missing) {
  return {
    error: (issue: { input?: unknown }) => (issue.input === undefined ? `Required: ${missing}` : `Not valid: ${invalid}`),
  };
}

const DATE = 'a date written like 2026-09-29';

const draft = z.boolean(explain('true or false')).default(false);

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(explain('the project’s name')).min(1, 'Required: the project’s name').transform(typeset),
        summary: z
          .string(explain('one line describing the project, under 160 characters'))
          .max(160, 'Too long: keep the summary to one line, under 160 characters')
          .transform(typeset),
        status: z.enum(PROJECT_STATUSES, explain('live, in progress, or archived', 'use exactly one of: live, in progress, archived')),
        date: z.coerce.date(explain(DATE)),
        tags: z.array(z.string(), explain('a list like [ai-literacy, interactive]')).default([]),
        cover: image().optional(),
        coverAlt: z.string(explain('a short description of the cover image')).optional(),
        liveUrl: z.url(explain('a full web address starting with https://')).optional(),
        frameworks: z.array(reference('frameworks'), explain('a list of framework file names like [calibrated-trust]')).default([]),
        featured: z.boolean(explain('true or false')).default(false),
        order: z.number(explain('a number; lower numbers come first')).default(100),
        draft,
      })
      .superRefine((data, ctx) => {
        if (data.status === 'live' && !data.liveUrl) {
          ctx.addIssue({ code: 'custom', path: ['liveUrl'], message: 'Required when status is live: the project’s address, starting with https://' });
        }
        if (data.cover && !data.coverAlt?.trim()) {
          ctx.addIssue({ code: 'custom', path: ['coverAlt'], message: 'Required when there is a cover: a short description of the image for people using screen readers' });
        }
      }),
});

const frameworks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/frameworks' }),
  schema: z.object({
    title: z.string(explain('the framework’s name')).min(1, 'Required: the framework’s name').transform(typeset),
    thesis: z
      .string(explain('the idea in one line, under 200 characters'))
      .max(200, 'Too long: keep the thesis to one line, under 200 characters')
      .transform(typeset),
    date: z.coerce.date(explain(DATE)),
    lastReviewed: z.coerce.date(explain(`${DATE}: the last time you re-read and stood behind this framework`)),
    relatedProjects: z.array(reference('projects'), explain('a list of project file names like [the-confident-machine]')).default([]),
    kind: z.enum(['philosophy', 'method'], explain('method or philosophy', 'use method or philosophy')).default('method'),
    question: z.string(explain('the question this framework answers, e.g. “Where does AI fit in the work?”')).transform(typeset).optional(),
    order: z.number(explain('a number; lower numbers come first')).default(100),
    draft,
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(explain('the post’s title')).min(1, 'Required: the post’s title').transform(typeset),
    date: z.coerce.date(explain(DATE)),
    summary: z.string(explain('one or two sentences describing the post')).transform(typeset),
    tags: z.array(z.string(), explain('a list like [ai-strategy, governance]')).default([]),
    lastReviewed: z.coerce.date(explain(DATE)).optional(),
    draft,
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(explain('the page’s title')).min(1, 'Required: the page’s title').transform(typeset),
    description: z.string(explain('one sentence for search engines and link previews')).transform(typeset),
    draft,
  }),
});

export const collections = { projects, frameworks, writing, pages };
