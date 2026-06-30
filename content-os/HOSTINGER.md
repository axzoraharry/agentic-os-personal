# Deploy on Hostinger (Node.js Web App)

## hPanel settings

| Setting | Value |
|---------|-------|
| **Application root** | `content-os` (not the repo root) |
| **Node.js version** | 20 |
| **Install command** | `npm install` |
| **Build command** | `npm run build` |
| **Start command** | `npm start` |
| **Entry file** | `server/index.js` (if asked) |
| **Output directory** | leave empty — no frontend build step |

## Environment variables

Add these in hPanel → your app → Environment variables (do **not** commit `.env`):

- `PORT` — usually set automatically by Hostinger; if missing use `3950`
- `PUBLIC_BASE_URL` — your live URL, e.g. `https://brown-lion-139149.hostingersite.com`
- `OPENROUTER_API_KEY`, `FIRECRAWL_API_KEY`, `ZERNIO_API_KEY` (as needed)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for Gmail)
- `GOOGLE_REDIRECT_URI` — `https://YOUR-DOMAIN/api/gmail/callback`

## Deprecation warnings are OK

Lines like `npm warn deprecated uuid@8.3.2` are **warnings only**. If you see:

```
added 149 packages, and audited 150 packages in 6s
```

then **`npm install` succeeded**. Look for the real error **after** that (build or start step).

## If deploy still fails

1. Open the full build log in hPanel and scroll **past** the npm warnings.
2. Common causes:
   - **Wrong root** — must be `content-os`, not repository root
   - **Missing build script** — fixed in `package.json` (`npm run build`)
   - **Missing env vars** — app may start but APIs won't work without keys
   - **Runtime crash** — check app logs for `SQLite3Error` or `EADDRINUSE`

## Fresh deploy checklist

```bash
# In Hostinger SSH (optional verification):
cd content-os
npm install
npm run build
npm start
```

The app creates `data/` and `storage/` automatically on first run.
