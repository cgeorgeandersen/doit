/**
 * Typed access to the content, and the links between it.
 *
 * getSite() loads every collection once per build, drops drafts, sorts
 * everything, and resolves the links. The link between a project and a
 * framework is stored once, on the project; each framework's list of projects
 * is derived from it here, so the two directions can never disagree.
 *
 * It also checks every link. Astro 7 only logs a misspelled reference and
 * carries on, which would quietly drop a link from the site, so a broken link
 * stops the build here with the file, the typo and the likely fix.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'projects'>;
export type Framework = CollectionEntry<'frameworks'>;
export type Post = CollectionEntry<'writing'>;
export type Page = CollectionEntry<'pages'>;

export interface Site {
  /** Published projects, by `order` then newest first. */
  projects: Project[];
  /** Published frameworks, by `order`. */
  frameworks: Framework[];
  /** The umbrella framework (kind: philosophy), if there is one. */
  philosophy: Framework | undefined;
  /** Frameworks with kind: method, in order. These get the numerals 01, 02, … */
  methods: Framework[];
  /** Published posts, newest first. */
  posts: Post[];
  /** Standalone pages such as About. */
  pages: Page[];
  /** The frameworks a project puts into practice, in framework order. */
  frameworksFor(project: Project): Framework[];
  /** Projects that name this framework, plus any it lists as related. */
  projectsFor(framework: Framework): { applied: Project[]; related: Project[] };
  /** "01", "02", … for methods; undefined for the philosophy. */
  numberOf(framework: Framework): string | undefined;
}

/** Top-level routes a standalone page must not take over. */
const RESERVED_PAGE_SLUGS = new Set(['index', 'projects', 'frameworks', 'writing', 'og', '404', 'rss.xml', 'robots.txt']);

/** Drafts appear in `npm run dev`, marked as drafts, and are left out of the built site. */
function isPublished(entry: { data: { draft: boolean } }): boolean {
  return import.meta.env.DEV || !entry.data.draft;
}

function byOrder<T extends { data: { order: number; title: string } }>(a: T, b: T): number {
  return a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);
}

function projectOrder(a: Project, b: Project): number {
  return a.data.order - b.data.order || b.data.date.getTime() - a.data.date.getTime() || a.data.title.localeCompare(b.data.title);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

let cached: Promise<Site> | undefined;

export function getSite(): Promise<Site> {
  // In dev, rebuild on every request so edits to Markdown show up immediately.
  if (import.meta.env.DEV) return loadSite();
  cached ??= loadSite();
  return cached;
}

async function loadSite(): Promise<Site> {
  const [allProjects, allFrameworks, allPosts, allPages] = await Promise.all([
    getCollection('projects'),
    getCollection('frameworks'),
    getCollection('writing'),
    getCollection('pages'),
  ]);

  checkLinks(allProjects, allFrameworks);
  checkPageSlugs(allPages);

  const projects = allProjects.filter(isPublished).sort(projectOrder);
  const frameworks = allFrameworks.filter(isPublished).sort(byOrder);
  const posts = allPosts.filter(isPublished).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const pages = allPages.filter(isPublished);

  const frameworkById = new Map(frameworks.map((f) => [f.id, f]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const methods = frameworks.filter((f) => f.data.kind === 'method');

  return {
    projects,
    frameworks,
    philosophy: frameworks.find((f) => f.data.kind === 'philosophy'),
    methods,
    posts,
    pages,
    frameworksFor: (project) =>
      project.data.frameworks
        .map((ref) => frameworkById.get(ref.id))
        .filter(isDefined)
        .sort(byOrder),
    projectsFor: (framework) => {
      const applied = projects.filter((p) => p.data.frameworks.some((ref) => ref.id === framework.id));
      const related = framework.data.relatedProjects
        .map((ref) => projectById.get(ref.id))
        .filter(isDefined)
        .filter((p) => !applied.includes(p));
      return { applied, related };
    },
    numberOf: (framework) => {
      const index = methods.findIndex((m) => m.id === framework.id);
      return index < 0 ? undefined : String(index + 1).padStart(2, '0');
    },
  };
}

// ---------- Link checks ----------

function checkLinks(projects: Project[], frameworks: Framework[]): void {
  const frameworkIds = frameworks.map((f) => f.id);
  const projectIds = projects.map((p) => p.id);
  const problems: string[] = [];

  for (const project of projects) {
    for (const ref of project.data.frameworks) {
      if (!frameworkIds.includes(ref.id)) problems.push(brokenLink(project, 'frameworks', ref.id, 'frameworks', frameworkIds));
    }
  }
  for (const framework of frameworks) {
    for (const ref of framework.data.relatedProjects) {
      if (!projectIds.includes(ref.id)) problems.push(brokenLink(framework, 'relatedProjects', ref.id, 'projects', projectIds));
    }
  }

  if (problems.length > 0) {
    throw new Error(`Broken content link${problems.length > 1 ? 's' : ''}. Fix the file name below, then build again.\n\n${problems.join('\n\n')}\n`);
  }
}

function brokenLink(entry: Project | Framework, field: string, id: string, collection: string, available: string[]): string {
  const file = entry.filePath ?? `src/content/${entry.collection}/${entry.id}.md`;
  const guess = closest(id, available);
  return [
    `  ${file}`,
    `  "${field}" lists "${id}", but there is no file src/content/${collection}/${id}.md.`,
    guess ? `  Did you mean "${guess}"?` : undefined,
    `  Available: ${available.join(', ') || '(none yet)'}`,
  ]
    .filter(isDefined)
    .join('\n');
}

function checkPageSlugs(pages: Page[]): void {
  const clash = pages.find((p) => RESERVED_PAGE_SLUGS.has(p.id));
  if (clash) {
    throw new Error(
      `${clash.filePath ?? clash.id}: a page called "${clash.id}" would replace the site's own /${clash.id} section. Rename the file, e.g. "${clash.id}-page.md".`,
    );
  }
}

/** The nearest available name by edit distance, if it's close enough to be a typo. */
function closest(id: string, candidates: string[]): string | undefined {
  let best: { name: string; score: number } | undefined;
  for (const name of candidates) {
    const score = editDistance(id, name);
    if (!best || score < best.score) best = { name, score };
  }
  return best && best.score <= Math.max(2, Math.floor(id.length / 3)) ? best.name : undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] ?? 0;
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

// ---------- Small helpers used by pages ----------

/** "theconfidentmachine.com" from "https://www.theconfidentmachine.com/". */
export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

/** "AI literacy" → "ai-literacy", for filter values in URLs. */
export function tagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Every tag used by the given projects, alphabetically. */
export function tagsOf(projects: Project[]): string[] {
  return [...new Set(projects.flatMap((p) => p.data.tags))].sort((a, b) => a.localeCompare(b));
}

/** When a post was last reviewed: its lastReviewed date, or its publish date. */
export function reviewedOn(post: Post): Date {
  return post.data.lastReviewed ?? post.data.date;
}

/** The oldest review date among frameworks: every framework has been reviewed since then. */
export function reviewedSince(frameworks: Framework[]): Date | undefined {
  return frameworks.reduce<Date | undefined>((oldest, f) => (!oldest || f.data.lastReviewed < oldest ? f.data.lastReviewed : oldest), undefined);
}
