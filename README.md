# Portfolio site

One static site, one link for your CV. Landing page plus two live project pages:

- **`darkscan/`**: fully interactive: the real trained model runs in the browser.
- **`nexus/`**: an interactive recorded walkthrough of the AI codebase agent
  (a live instance would cost money per query, so it's a captured session plus
  deploy-it-yourself instructions).

It's plain HTML/CSS/JS, no build step, no framework, nothing to compile.


## Run locally
```bash
python -m http.server 8080
# open http://localhost:8080
```

## The DarkScan "Scan a URL" feature

Browsers can't fetch arbitrary cross-origin pages (CORS), so the URL scan tries,
in order: a same-origin serverless function (`/api/scan-url`, included for
Cloudflare/Vercel) → a public CORS proxy → a clear "paste the HTML instead"
message. It fetches the page's *initial* HTML, so server-rendered sites scan well
and heavy JavaScript SPAs may return little, the paste-HTML tab is always the
reliable path.

## Updating the DarkScan model

The demo's `darkscan/model.json` is exported from the trained classifier. If you
retrain, regenerate it from the DarkScan project
(`web/build_model.py`) and copy the new `model.json` into `darkscan/`.

