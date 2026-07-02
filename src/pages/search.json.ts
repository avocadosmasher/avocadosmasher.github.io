import { getCollection } from 'astro:content';
import { postHref, fmtDate } from '../utils';

export async function GET() {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const data = posts.map((p) => ({
    title: p.data.title,
    category: p.data.category,
    tags: p.data.tags,
    date: fmtDate(p.data.pubDate),
    url: postHref(p.id),
  }));

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
