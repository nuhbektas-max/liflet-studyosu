// AURORA - isteğe bağlı güvenli ara sunucu (Cloudflare Worker).
// Gerçek Anthropic API anahtarı yalnızca bu sunucuda (gizli ortam değişkeni) durur; telefonda
// yalnızca uygulama belirteci olur. Uygulamada Ayarlar > Sunucu adresi = bu Worker'ın adresi,
// API anahtarı alanına APP_TOKEN yazılır.
//
// Kurulum (bilgisayarda):
//   npm i -g wrangler
//   wrangler init aurora-proxy   (bu dosyayı src/index.js olarak koyun)
//   wrangler secret put ANTHROPIC_API_KEY   (gerçek anahtar)
//   wrangler secret put APP_TOKEN           (uzun rastgele bir parola)
//   wrangler deploy
//
// Yalnızca /v1/messages ve /v1/models yollarını geçirir.

const ALLOWED = [/^\/v1\/messages$/, /^\/v1\/models(\/[\w.-]+)?$/];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access, x-stainless-arch, x-stainless-lang, x-stainless-os, x-stainless-package-version, x-stainless-retry-count, x-stainless-runtime, x-stainless-runtime-version, x-stainless-timeout, x-api-key',
  'access-control-max-age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (!ALLOWED.some((re) => re.test(url.pathname))) return json(404, 'Bu yol desteklenmiyor.');

    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-api-key') || '';
    if (!env.APP_TOKEN || !timingSafeEqual(token, env.APP_TOKEN)) return json(401, 'Uygulama belirteci geçersiz.');

    const headers = new Headers();
    for (const h of ['content-type', 'anthropic-version', 'anthropic-beta']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('x-api-key', env.ANTHROPIC_API_KEY);

    const upstream = await fetch(`https://api.anthropic.com${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined,
    });
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

function json(status, message) {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message } }), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
