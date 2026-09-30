/**
 * One feed for everything published: posts, projects and frameworks, newest
 * first. Posts carry their full text; projects and frameworks their summary.
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { getSite } from '../lib/content';

export const GET: APIRoute = async (context) => {
  const site = await getSite();

  const items = [
    ...site.posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      content: post.rendered?.html,
      pubDate: post.data.date,
      link: `/writing/${post.id}`,
      categories: [SITE.sections.writing.label, ...post.data.tags],
    })),
    ...site.projects.map((project) => ({
      title: `Project: ${project.data.title}`,
      description: project.data.summary,
      pubDate: project.data.date,
      link: `/projects/${project.id}`,
      categories: ['Project', ...project.data.tags],
    })),
    ...site.frameworks.map((framework) => ({
      title: `Framework: ${framework.data.title}`,
      description: framework.data.thesis,
      pubDate: framework.data.date,
      link: `/frameworks/${framework.id}`,
      categories: ['Framework'],
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? 'http://localhost:4321',
    items,
    trailingSlash: false,
    customData: `<language>${SITE.locale.toLowerCase()}</language>`,
  });
};
