export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    if (!env.ANALYTICS_KV) {
      return new Response(JSON.stringify({ 
        error: 'KV binding ANALYTICS_KV not available',
        summary: { total_visits: 0, total_clicks: 0, daily: {}, notes: {}, targets: {}, countries: {} },
        recent: []
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    const [summary, recent] = await Promise.all([
      env.ANALYTICS_KV.get('summary', { type: 'json' }),
      env.ANALYTICS_KV.get('recent_events', { type: 'json' })
    ]);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
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

    const data = {
      summary: sum,
      today: todayStats,
      ctr,
      recent: recent || []
    };

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
