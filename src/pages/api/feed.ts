import type { APIRoute } from 'astro';
import { fetchFeed } from '../../lib/feed-parser';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const feedUrl = url.searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing feed URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const feed = await fetchFeed(feedUrl);
    return new Response(JSON.stringify(feed), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300', // Cache for 1 min
      },
    });
  } catch (error) {
    console.error('Feed fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch feed', details: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
