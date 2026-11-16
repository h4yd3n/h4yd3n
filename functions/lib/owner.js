// The owner's networks, so their visits aren't counted from any browser.
//
// Opening /stats remembers the network it was opened from for OWNER_DAYS (the
// dashboard's /api/stats call does it). event.js then skips visits from those
// networks. This covers every browser and device on that Wi-Fi, private windows
// included, which the per-browser _h_owner flag can't. Trade-off: anyone else on
// that Wi-Fi isn't counted either.
//
// Stored as salted SHA-256 hashes, not raw IPs. IPv6 is keyed by its /64, since
// devices rotate the low half of the address.

const KEY = 'owner_networks';
const OWNER_DAYS = 30;
const REFRESH_MS = 12 * 3600 * 1000;   // re-stamp at most twice a day per network
const MAX_NETWORKS = 50;

function networkOf(ip) {
  if (!ip) return '';
  if (ip.includes(':')) {
    // Expand '::' so '2600:1700::1' and '2600:1700:0:0:1::' key the same /64.
    const [head, tail = ''] = ip.toLowerCase().split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    return full.slice(0, 4).map(x => parseInt(x || '0', 16).toString(16)).join(':') + '::/64';
  }
  return ip;
}

async function hashNetwork(request) {
  const net = networkOf(request.headers.get('cf-connecting-ip') || '');
  if (!net) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('h4yd3n-owner:' + net));
  return [...new Uint8Array(buf)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fresh(map, now) {
  const cutoff = now - OWNER_DAYS * 86400 * 1000;
  const out = {};
  for (const [h, t] of Object.entries(map || {})) if (t > cutoff) out[h] = t;
  return out;
}

export async function isOwnerNetwork(request, kv) {
  const h = await hashNetwork(request);
  if (!h) return false;
  const map = fresh(await kv.get(KEY, { type: 'json' }), Date.now());
  return h in map;
}

export async function markOwnerNetwork(request, kv) {
  const h = await hashNetwork(request);
  if (!h) return;
  const now = Date.now();
  const raw = (await kv.get(KEY, { type: 'json' })) || {};
  if (raw[h] && now - raw[h] < REFRESH_MS) return;   // already marked recently
  let map = fresh(raw, now);
  map[h] = now;
  const keys = Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, MAX_NETWORKS);
  map = Object.fromEntries(keys.map(k => [k, map[k]]));
  await kv.put(KEY, JSON.stringify(map));
}
