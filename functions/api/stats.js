// The dashboard data includes each recent visitor's city, region, device and
// referrer, so it is only served with the owner's token:
//   Authorization: Bearer <STATS_TOKEN>
// Set the token once as a Pages secret (Production, and Preview if you use it):
//   npx wrangler pages secret put STATS_TOKEN --project-name h4yd3n-site
// Without the secret the endpoint stays closed rather than falling back to public.
// The dashboard is same-origin, so there are no CORS headers.

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function tokenMatches(given, expected) {
  // Compare SHA-256 digests so the check takes the same time whatever the input.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.STATS_TOKEN) {
    return json({ error: 'STATS_TOKEN is not set for this deployment' }, 503);
  }
  const auth = request.headers.get('authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !(await tokenMatches(given, env.STATS_TOKEN))) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    if (!env.ANALYTICS_KV) {
      return json({
        error: 'KV binding ANALYTICS_KV not available',
        summary: { total_visits: 0, total_clicks: 0, daily: {}, notes: {}, targets: {}, countries: {} },
        recent: []
      });
    }

    const [summary, recent] = await Promise.all([
      env.ANALYTICS_KV.get('summary', { type: 'json' }),
      env.ANALYTICS_KV.get('recent_events', { type: 'json' })
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const sum = summary || {
      total_visits: 0,
      total_clicks: 0,
      daily: {},
      notes: {},
      targets: {},
      countries: {}
    };

    const todayStats = (sum.daily && sum.daily[todayStr]) || { visits: 0, clicks: 0 };
    const ctr = sum.total_visits > 0 ? ((sum.total_clicks / sum.total_visits) * 100).toFixed(1) + '%' : '0.0%';

    return json({ summary: sum, today: todayStats, ctr, recent: recent || [] });
  } catch (err) {
    return json({ error: 'stats read failed' }, 500);
  }
}
