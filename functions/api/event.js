export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    let data = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await request.json().catch(() => ({}));
    } else {
      const text = await request.text().catch(() => '');
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = {};
      }
    }

    const type = data.type === 'click' ? 'click' : 'visit';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const ts = now.toISOString();

    const cf = request.cf || {};
    const country = cf.country || 'Unknown';
    const city = cf.city || '';
    const device = cf.deviceType || (request.headers.get('user-agent')?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop');
    const referrer = data.referrer ? String(data.referrer).slice(0, 250) : '';

    const eventRecord = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: ts,
      type,
      note: String(data.note || (type === 'visit' ? 'pageview' : 'unknown')).slice(0, 50),
      target: String(data.target || '').slice(0, 250),
      element: String(data.element || '').slice(0, 50),
      country,
      city,
      device,
      referrer
    };

    if (env.ANALYTICS_KV) {
      let summary = await env.ANALYTICS_KV.get('summary', { type: 'json' });
      if (!summary) {
        summary = {
          total_visits: 0,
          total_clicks: 0,
          daily: {},
          notes: {},
          targets: {},
          countries: {}
        };
      }

      if (type === 'visit') {
        summary.total_visits = (summary.total_visits || 0) + 1;
        if (!summary.daily[dateStr]) summary.daily[dateStr] = { visits: 0, clicks: 0 };
        summary.daily[dateStr].visits = (summary.daily[dateStr].visits || 0) + 1;
      } else {
        summary.total_clicks = (summary.total_clicks || 0) + 1;
        if (!summary.daily[dateStr]) summary.daily[dateStr] = { visits: 0, clicks: 0 };
        summary.daily[dateStr].clicks = (summary.daily[dateStr].clicks || 0) + 1;

        const noteKey = eventRecord.note;
        summary.notes[noteKey] = (summary.notes[noteKey] || 0) + 1;

        if (eventRecord.target) {
          try {
            const host = new URL(eventRecord.target).hostname.replace(/^www./, '');
            summary.targets[host] = (summary.targets[host] || 0) + 1;
          } catch (e) {
            const safeTarget = eventRecord.target.slice(0, 60);
            summary.targets[safeTarget] = (summary.targets[safeTarget] || 0) + 1;
          }
        }
      }

      if (country && country !== 'Unknown') {
        summary.countries[country] = (summary.countries[country] || 0) + 1;
      }

      const days = Object.keys(summary.daily).sort();
      if (days.length > 30) {
        for (const oldDay of days.slice(0, days.length - 30)) {
          delete summary.daily[oldDay];
        }
      }

      let recent = await env.ANALYTICS_KV.get('recent_events', { type: 'json' }) || [];
      recent.unshift(eventRecord);
      if (recent.length > 100) recent = recent.slice(0, 100);

      await Promise.all([
        env.ANALYTICS_KV.put('summary', JSON.stringify(summary)),
        env.ANALYTICS_KV.put('recent_events', JSON.stringify(recent))
      ]);
    }

    return new Response(JSON.stringify({ ok: true, event: eventRecord.id }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
