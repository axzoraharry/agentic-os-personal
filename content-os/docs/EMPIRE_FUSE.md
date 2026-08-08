# Empire dashboard fuse

How Satyug / Happy Paisa / AXZORA command surfaces attach to Content-OS
(Growth / Distribution layer) without owning its SQLite or UI.

## Canonical status endpoint

```http
GET /api/agent/empire-status
Authorization: Bearer {AGENT_API_KEY}
```

Returns a single JSON snapshot:

```json
{
  "layer": "growth",
  "system": "content-os",
  "ok": true,
  "time": "…",
  "url": "http://127.0.0.1:3950",
  "services": { "firecrawl": true, "openrouter": true, "zernio": false, "gmail": false },
  "queue": 0,
  "feed": {
    "fresh_total": 12,
    "new": 8,
    "shortlisted": 2,
    "used": 1,
    "dismissed": 1,
    "top": [ { "id", "title", "priority_score", "status" } ]
  },
  "studio": { "drafts": 3, "generating_images": 0 },
  "outbox": { "scheduled": 1, "published_recent": 2 },
  "sources": { "enabled": 4, "total": 5 },
  "agent": { "tools": 22, "auth": "api_key" }
}
```

Poll every 15–60s from the empire HUD. Drive actions via `POST /api/agent/invoke`.

## Embed widget (same origin or iframe)

Static assets:

- `/empire/embed.js` — drop-in status card
- `/empire/panel.html` — standalone panel page

Same-origin example (inside another page on this host):

```html
<div id="growth-panel"></div>
<script type="module">
  import { mountEmpirePanel } from "/empire/embed.js";
  mountEmpirePanel(document.getElementById("growth-panel"), {
    baseUrl: "",
    agentKey: localStorage.getItem("AGENT_API_KEY") || "",
    pollMs: 20000,
  });
</script>
```

Cross-origin empire dashboard:

```js
import { fetchEmpireStatus, mountEmpirePanel } from "https://content-os.example/empire/embed.js";
// CORS: set EMPIRE_CORS_ORIGIN in Content-OS .env if you serve from another origin
```

## Commander integration

1. On boot, `GET /api/agent/prompt` → inject into system prompt.
2. Heartbeat: `GET /api/agent/empire-status`.
3. Work: `POST /api/agent/invoke` with tools from [AGENT_API.md](./AGENT_API.md).

## In-app HUD

The main Content-OS HUD **Content System** tile shows growth metrics from
`/api/agent/empire-status` (loopback, no key needed when key is unset).

## Environment

```bash
# Optional: allow browser embeds from empire UI origin
EMPIRE_CORS_ORIGIN=https://empire.local
```

Never put `AGENT_API_KEY` in a public frontend build for production; use a
backend proxy on the empire side that holds the key.
