// Cloudflare Pages Function → serves GET /api/scan-url?url=...
//
// The browser can't fetch arbitrary cross-origin pages (CORS). This runs on the
// server, where that restriction doesn't apply, fetches the page, and returns
// its HTML with a permissive CORS header so the static front end can read it.
//
// Deploy: put this file at functions/api/scan-url.js in a Cloudflare Pages
// project. It's free and needs no configuration.

export async function onRequestGet(context) {
  const target = new URL(context.request.url).searchParams.get("url");

  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response("Provide a valid http(s) url.", { status: 400 });
  }

  try {
    const resp = await fetch(target, {
      headers: {
        // Some sites serve different / no content to obvious bots.
        "User-Agent": "Mozilla/5.0 (compatible; DarkScanBot/1.0; +portfolio-demo)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      cf: { cacheTtl: 60 },
    });

    const html = await resp.text();
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (e) {
    return new Response("Upstream fetch failed: " + e.message, { status: 502 });
  }
}
