# Content-OS Agent API

Control plane for **Mr. Happy Commander**, Happy Agents, and The Delegation.
Subordinates Content-OS (Growth / Distribution) without driving the SPA.

## Auth

| Config | Behavior |
|--------|----------|
| `AGENT_API_KEY` set | Require `Authorization: Bearer …` or `X-Agent-Key` |
| Unset | Only `127.0.0.1` / `::1` |

## Discover

```http
GET /api/agent/tools
GET /api/agent/prompt
GET /api/agent/health
```

## Invoke (preferred for agents)

```http
POST /api/agent/invoke
Content-Type: application/json

{
  "tool": "list_feed",
  "arguments": { "limit": 20, "min_score": 50 }
}
```

Response shape:

```json
{ "ok": true, "tool": "list_feed", "result": { ... } }
```

## Content loop

```
list_feed → approve_article | reject_article
         → create_brief { article_id, generate_caption: true }
         → refine_caption { instruction }
         → generate_image { aspect_ratio: "4:3" }   # async; poll get_draft
         → list_accounts
         → schedule_post { platforms, scheduled_for | publish_now }
```

## Tools

| Tool | What it does |
|------|----------------|
| `content_os_health` | Services + queue |
| `empire_status` | Empire HUD snapshot (feed counts, top items, drafts, outbox) |
| `list_feed` | Ranked articles (`bypass_freshness`, `statuses`, `limit`, `min_score`) |
| `get_article` | One article |
| `approve_article` | status → shortlisted |
| `reject_article` | status → dismissed |
| `set_article_status` | new \| shortlisted \| used \| dismissed |
| `rank_articles` | AI rank pending |
| `create_brief` | Studio draft (from article or blank) |
| `list_drafts` / `get_draft` / `update_draft` | Studio CRUD |
| `generate_caption` / `refine_caption` | AI caption |
| `generate_image` | Async image (default 4:3) |
| `list_accounts` | Zernio-connected accounts |
| `schedule_post` | Schedule / publish via Zernio |
| `list_scheduled` | Outbox |
| `list_sources` / `create_source` / `run_source` | Collection |
| `research` | Ad-hoc research into feed |
| `list_jobs` / `get_job` | Job history, and one job with run details |

Arguments sent to `POST /api/agent/invoke` are validated against each tool's
`parameters` schema from the catalog. Unknown properties, wrong types, bad enum
values, and out-of-range numbers are rejected with `400` and a message naming
the offending path.

## REST mirrors

Same operations under paths in the tool catalog (`path` field), e.g.:

- `GET /api/agent/feed`
- `POST /api/agent/articles/:id/approve`
- `POST /api/agent/briefs`
- `POST /api/agent/drafts/:id/image`
- `POST /api/agent/drafts/:id/schedule`

## Commander wiring (snippet)

```text
You control Content-OS via POST {PUBLIC_BASE_URL}/api/agent/invoke
Auth: Authorization: Bearer {AGENT_API_KEY}
Catalog: GET /api/agent/tools
Never invent accountIds — call list_accounts first.
After generate_image, poll get_draft until image_status is ready or failed.
```

Or fetch live prompt:

```bash
curl -s http://localhost:3950/api/agent/prompt
```

## Security notes

- Do not expose agent routes without `AGENT_API_KEY` on a public host.
- UI `/api/*` routes remain open to the dashboard as before; harden reverse proxy if needed.
- Prefer invoke over scraping the SPA.
