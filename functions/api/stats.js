// Open on purpose (owner, 2026-11-16): the token prompt got in the way on the
// phone and the owner chose no token. The page is noindex and not linked from the
// site. The dashboard is same-origin, so there are no CORS headers.

import { markOwnerNetwork } from '../lib/owner.js';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env.ANALYTICS_KV) {
      return json({
        error: 'KV binding ANALYTICS_KV not available',
        summary: { total_visits: 0, total_clicks: 0, daily: {}, notes: {}, targets: {}, countries: {} },
        recent: []
      });
    }

    // Whoever opens the dashboard is the owner: stop counting visits from this network.
    await markOwnerNetwork(request, env.ANALYTICS_KV).catch(() => {});

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
