import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { item, feedUrl } = await request.json();

    if (!item || !feedUrl) {
      return new Response(JSON.stringify({ error: 'Item and feedUrl are required' }), { status: 400 });
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error in mark-item-read:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // 1. Resolve feed_id
    const { data: feed, error: feedError } = await supabase
      .from('feeds')
      .select('id')
      .eq('url', feedUrl)
      .single();

    if (feedError || !feed) {
      console.error('Feed lookup error:', feedError);
      return new Response(JSON.stringify({ error: `Feed not found: ${feedUrl}` }), { status: 404 });
    }

    // 2. Upsert item into feed_items
    const { data: dbItem, error: itemError } = await supabase
      .from('feed_items')
      .upsert({
        feed_id: feed.id,
        guid: item.guid,
        url: item.link,
        title: item.title,
        description: item.contentSnippet || '',
        content: item.content || '',
        author: item.author || '',
        image_url: item.imageUrl || '',
        published_at: item.pubDate,
      }, { onConflict: 'feed_id, guid' })
      .select('id')
      .single();

    if (itemError) {
      console.error('Error upserting item:', itemError);
      return new Response(JSON.stringify({ error: 'Failed to save item' }), { status: 500 });
    }

    // 3. Mark as read
    const { error: stateError } = await supabase
      .from('user_item_states')
      .upsert({
        user_id: user.id,
        item_id: dbItem.id,
        is_read: true,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, item_id' });

    if (stateError) {
      console.error('Error marking item as read:', stateError);
      return new Response(JSON.stringify({ error: 'Failed to mark as read' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Mark item read error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
