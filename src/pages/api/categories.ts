import type { APIRoute } from 'astro';

// Helper to create an authenticated Supabase client
async function getAuthClient(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

// GET: List all categories for the current user
export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthClient(request);
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const { data, error } = await auth.supabase
      .from('categories')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('name');

    if (error) throw error;
    return new Response(JSON.stringify(data || []), { status: 200 });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};

// POST: Create a new category OR update/delete
export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthClient(request);
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const body = await request.json();
    const { action, id, name } = body;

    if (action === 'create') {
      if (!name || !name.trim()) {
        return new Response(JSON.stringify({ error: 'Category name is required' }), { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from('categories')
        .insert({ user_id: auth.user.id, name: name.trim() })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return new Response(JSON.stringify({ error: 'Category already exists' }), { status: 400 });
        }
        throw error;
      }
      return new Response(JSON.stringify(data), { status: 201 });
    }

    if (action === 'rename') {
      if (!id || !name?.trim()) {
        return new Response(JSON.stringify({ error: 'ID and name required' }), { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', id)
        .eq('user_id', auth.user.id)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200 });
    }

    if (action === 'delete') {
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
      }

      // Nullify category on subscriptions first
      await auth.supabase
        .from('feed_subscriptions')
        .update({ category_id: null })
        .eq('category_id', id)
        .eq('user_id', auth.user.id);

      const { error } = await auth.supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', auth.user.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if (action === 'assign') {
      // Assign a feed subscription to a category
      const { subscriptionId, categoryId } = body;
      if (!subscriptionId) {
        return new Response(JSON.stringify({ error: 'subscriptionId required' }), { status: 400 });
      }

      const { error } = await auth.supabase
        .from('feed_subscriptions')
        .update({ category_id: categoryId || null })
        .eq('id', subscriptionId)
        .eq('user_id', auth.user.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (error) {
    console.error('Category operation error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
