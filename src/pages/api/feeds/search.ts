import type { APIRoute } from 'astro';
import { fetchFeed } from '../../../lib/feed-parser';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim().toLowerCase();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: 'Query must be at least 2 characters' }), { status: 400 });
    }

    // Auth
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Fetch all user subscriptions
    const { data: subs, error: subsError } = await supabase
      .from('feed_subscriptions')
      .select('feeds(url, title)')
      .eq('user_id', user.id);

    if (subsError) throw subsError;

    // Fetch all feeds in parallel
    const feedUrls = (subs || []).map((s: any) => s.feeds.url);
    const feedResults = await Promise.allSettled(feedUrls.map(u => fetchFeed(u)));

    // Search through all items
    let results: any[] = [];
    feedResults.forEach(result => {
      if (result.status === 'fulfilled') {
        const feedContent = result.value;
        const matchingItems = feedContent.items.filter((item: any) => {
          const titleMatch = item.title?.toLowerCase().includes(query);
          const descMatch = item.contentSnippet?.toLowerCase().includes(query);
          const authorMatch = item.author?.toLowerCase().includes(query);
          return titleMatch || descMatch || authorMatch;
        });

        const itemsWithMeta = matchingItems.map((item: any) => ({
          ...item,
          feedTitle: feedContent.title,
          feedUrl: feedContent.feedUrl
        }));
        results = results.concat(itemsWithMeta);
      }
    });

    // Sort by relevance (title matches first, then by date)
    results.sort((a, b) => {
      const aTitle = a.title?.toLowerCase().includes(query) ? 1 : 0;
      const bTitle = b.title?.toLowerCase().includes(query) ? 1 : 0;
      if (bTitle !== aTitle) return bTitle - aTitle;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

    // Limit results
    results = results.slice(0, 50);

    return new Response(JSON.stringify({
      query,
      count: results.length,
      items: results
    }), { status: 200 });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed' }), { status: 500 });
  }
};
