import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Fetch saved items
    const { data, error } = await supabase
      .from('user_item_states')
      .select(`
        is_saved,
        saved_at,
        feed_items (
          guid,
          url,
          title,
          description,
          content,
          author,
          image_url,
          published_at,
          feeds (
            title,
            url
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('is_saved', true)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookmarks:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch bookmarks' }), { status: 500 });
    }

    // Flatten data for frontend consumption
    const items = (data || []).map((row: any) => ({
      guid: row.feed_items.guid,
      link: row.feed_items.url,
      title: row.feed_items.title,
      contentSnippet: row.feed_items.description,
      content: row.feed_items.content,
      author: row.feed_items.author,
      imageUrl: row.feed_items.image_url,
      pubDate: row.feed_items.published_at,
      feedTitle: row.feed_items.feeds.title,
      feedUrl: row.feed_items.feeds.url,
      isBookmarked: true
    }));

    return new Response(JSON.stringify(items), { status: 200 });
  } catch (error) {
    console.error('Bookmarks list error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
