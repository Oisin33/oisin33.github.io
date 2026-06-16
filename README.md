# Portfolio site

One static site, one link for your CV. Landing page plus two live project pages:

- **`darkscan/`** — fully interactive: the real trained model runs in the browser.
- **`nexus/`** — an interactive recorded walkthrough of the AI codebase agent
  (a live instance would cost money per query, so it's a captured session plus
  deploy-it-yourself instructions).

It's plain HTML/CSS/JS — no build step, no framework, nothing to compile.

## Before you publish — fill in these placeholders

Search the files for `YOUR-` and replace:

- **`index.html`** (the hub) and its footer:
  - `https://github.com/YOUR-USERNAME` → your GitHub
  - `https://www.linkedin.com/in/YOUR-PROFILE` → your LinkedIn
  - `mailto:YOUR-EMAIL@example.com` → your email
  - `YOUR-CV.pdf` → drop your CV PDF in this folder with that name (or change the link)
  - the two `github.com/YOUR-USERNAME/{darkscan,nexus}` source links
- **`nexus/index.html`** — the `github.com/YOUR-USERNAME/nexus` source links (×2)

That's it — everything else is content-complete.

## Run locally

```bash
python -m http.server 8080
# open http://localhost:8080
```

## Deploy (free)

**GitHub Pages**
1. Push this folder to a repo (e.g. name it `portfolio` or `<username>.github.io`).
2. Settings → Pages → deploy from branch, root folder.
3. Live at `https://<username>.github.io/<repo>/` (or `https://<username>.github.io/`
   if you named the repo `<username>.github.io`).

   Note: GitHub Pages can't run serverless functions, so the DarkScan "Scan a URL"
   feature falls back to a public CORS proxy (best-effort). For the robust version,
   deploy on Cloudflare/Vercel/Netlify instead (below).

**Cloudflare Pages / Vercel / Netlify** — point the project at this folder, no
build command, publish directory = root. These hosts run the included serverless
function, so "Scan a URL" works reliably:
- **Cloudflare Pages** uses `functions/api/scan-url.js` automatically.
- **Vercel** uses `api/scan-url.js` automatically.
- **Netlify** — move `api/scan-url.js` to `netlify/functions/` and add a redirect
  from `/api/scan-url`, or just rely on the proxy fallback.

**Custom domain (recommended for a CV link):** buy something like
`oisinmcsherry.dev` (~€10/yr) and point it at the host — then your CV link is
yours, not `username.github.io`.

## The DarkScan "Scan a URL" feature

Browsers can't fetch arbitrary cross-origin pages (CORS), so the URL scan tries,
in order: a same-origin serverless function (`/api/scan-url`, included for
Cloudflare/Vercel) → a public CORS proxy → a clear "paste the HTML instead"
message. It fetches the page's *initial* HTML, so server-rendered sites scan well
and heavy JavaScript SPAs may return little — the paste-HTML tab is always the
reliable path.

## Updating the DarkScan model

The demo's `darkscan/model.json` is exported from the trained classifier. If you
retrain, regenerate it from the DarkScan project
(`web/build_model.py`) and copy the new `model.json` into `darkscan/`.

## A note on the Nexus walkthrough

The answers and tool sequences shown are genuine output the agent produced
against the FastAPI repo — it's a recorded session, clearly labelled as such, not
a mock-up. If you'd rather have a live instance, deploy the backend (Docker
Compose, an Anthropic key) and link it; just be aware every visitor query costs
you money, so add rate-limiting and a spend cap first.
