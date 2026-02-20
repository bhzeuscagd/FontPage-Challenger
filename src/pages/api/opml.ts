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

// GET: Export subscriptions as OPML XML
export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthClient(request);
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    // Fetch subscriptions with categories
    const { data: subs, error } = await auth.supabase
      .from('feed_subscriptions')
      .select(`
        custom_title,
        category_id,
        feeds (
          url,
          title,
          site_url,
          description
        ),
        categories (
          name
        )
      `)
      .eq('user_id', auth.user.id);

    if (error) throw error;

    // Group by category
    const grouped: Record<string, any[]> = { 'Uncategorized': [] };
    (subs || []).forEach((sub: any) => {
      const catName = sub.categories?.name || 'Uncategorized';
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(sub);
    });

    // Build OPML
    let outlines = '';
    for (const [catName, feeds] of Object.entries(grouped)) {
      const feedOutlines = feeds.map((sub: any) => {
        const title = escapeXml(sub.custom_title || sub.feeds.title || '');
        const xmlUrl = escapeXml(sub.feeds.url || '');
        const htmlUrl = escapeXml(sub.feeds.site_url || '');
        const desc = escapeXml(sub.feeds.description || '');
        return `      <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" description="${desc}" />`;
      }).join('\n');

      if (catName === 'Uncategorized') {
        outlines += feedOutlines + '\n';
      } else {
        outlines += `    <outline text="${escapeXml(catName)}" title="${escapeXml(catName)}">\n${feedOutlines}\n    </outline>\n`;
      }
    }

    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Frontpage Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}  </body>
</opml>`;

    return new Response(opml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': 'attachment; filename="frontpage-subscriptions.opml"'
      }
    });
  } catch (error) {
    console.error('OPML export error:', error);
    return new Response(JSON.stringify({ error: 'Export failed' }), { status: 500 });
  }
};

// POST: Import OPML file
export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getAuthClient(request);
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const body = await request.json();
    const { opmlContent } = body;

    if (!opmlContent) {
      return new Response(JSON.stringify({ error: 'OPML content required' }), { status: 400 });
    }

    // Simple XML parsing for OPML outline elements
    const feeds = parseOpmlOutlines(opmlContent);

    if (feeds.length === 0) {
      return new Response(JSON.stringify({ error: 'No feeds found in the OPML file' }), { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const feed of feeds) {
      try {
        // 1. Ensure category exists if specified
        let categoryId = null;
        if (feed.category) {
          let { data: existingCat } = await auth.supabase
            .from('categories')
            .select('id')
            .eq('user_id', auth.user.id)
            .eq('name', feed.category)
            .single();

          if (existingCat) {
            categoryId = existingCat.id;
          } else {
            const { data: newCat } = await auth.supabase
              .from('categories')
              .insert({ user_id: auth.user.id, name: feed.category })
              .select('id')
              .single();
            categoryId = newCat?.id || null;
          }
        }

        // 2. Ensure feed exists in global feeds table
        let { data: existingFeed } = await auth.supabase
          .from('feeds')
          .select('id')
          .eq('url', feed.xmlUrl)
          .single();

        let feedId: string;
        if (existingFeed) {
          feedId = existingFeed.id;
        } else {
          const { data: newFeed, error: feedErr } = await auth.supabase
            .from('feeds')
            .insert({
              url: feed.xmlUrl,
              title: feed.title,
              site_url: feed.htmlUrl || null,
              description: feed.description || null,
            })
            .select('id')
            .single();

          if (feedErr) throw feedErr;
          feedId = newFeed.id;
        }

        // 3. Create subscription
        const { error: subErr } = await auth.supabase
          .from('feed_subscriptions')
          .insert({
            user_id: auth.user.id,
            feed_id: feedId,
            category_id: categoryId,
            custom_title: feed.title || null,
          });

        if (subErr) {
          if (subErr.code === '23505') {
            skipped++;
          } else {
            throw subErr;
          }
        } else {
          imported++;
        }
      } catch (err) {
        errors.push(`Failed to import ${feed.xmlUrl}: ${String(err)}`);
      }
    }

    return new Response(JSON.stringify({
      imported,
      skipped,
      total: feeds.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    }), { status: 200 });
  } catch (error) {
    console.error('OPML import error:', error);
    return new Response(JSON.stringify({ error: 'Import failed' }), { status: 500 });
  }
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface OpmlFeed {
  xmlUrl: string;
  title: string;
  htmlUrl?: string;
  description?: string;
  category?: string;
}

function parseOpmlOutlines(xml: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];
  
  // Match outline elements with xmlUrl (RSS feeds)
  // First find categorized feeds (inside parent outlines)
  const categoryRegex = /<outline[^>]*?text="([^"]*)"[^>]*?>[\s\S]*?<\/outline>/gi;
  const feedRegex = /<outline[^/>]*?xmlUrl="([^"]*)"[^/>]*?\/?\s*>/gi;
  const attrRegex = /(\w+)="([^"]*)"/g;

  // Simple approach: find all outlines with xmlUrl
  let match;
  while ((match = feedRegex.exec(xml)) !== null) {
    const fullTag = match[0];
    const attrs: Record<string, string> = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(fullTag)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }

    if (attrs.xmlUrl) {
      // Try to find parent category
      let category: string | undefined;
      const feedPos = match.index;
      // Look backwards for a parent outline that doesn't have xmlUrl
      const beforeFeed = xml.substring(0, feedPos);
      const parentMatch = beforeFeed.match(/<outline[^>]*?text="([^"]*)"[^>]*?(?!xmlUrl)[^>]*?>\s*$/i);
      if (parentMatch) {
        category = parentMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');
      }

      feeds.push({
        xmlUrl: attrs.xmlUrl,
        title: attrs.title || attrs.text || '',
        htmlUrl: attrs.htmlUrl,
        description: attrs.description,
        category,
      });
    }
  }

  return feeds;
}
