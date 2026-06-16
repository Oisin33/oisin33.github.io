// Vercel Serverless Function → serves GET /api/scan-url?url=...
//
// Same purpose as functions/api/scan-url.js (Cloudflare): fetch a page
// server-side and return its HTML so the static front end can scan it.
//
// Deploy: put this file at api/scan-url.js in a Vercel project. (If you deploy
// on Cloudflare Pages instead, use functions/api/scan-url.js; on GitHub Pages
// there are no functions, and the demo falls back to a public CORS proxy.)

export default async function handler(req, res) {
  const target = req.query.url;

  if (!target || !/^https?:\/\//i.test(target)) {
    res.status(400).send("Provide a valid http(s) url.");
    return;
  }

  try {
    const resp = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DarkScanBot/1.0; +portfolio-demo)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const html = await resp.text();
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=60");
    res.status(200).send(html);
  } catch (e) {
    res.status(502).send("Upstream fetch failed: " + e.message);
  }
}
