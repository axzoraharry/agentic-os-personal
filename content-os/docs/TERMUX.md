# Content-OS on Termux / proot

Hardened local run for phone (Termux) or proot-Ubuntu. SQLite uses **wasm** — no native compiler required.

## One-shot install

```bash
cd ~/agentic-os-personal/content-os   # or your clone path
bash deploy/termux-setup.sh
./start-termux.sh
```

Open `http://127.0.0.1:3950`.

## Environment model

| Variable | Termux recommendation |
|----------|------------------------|
| `PORT` | `3950` |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:3950` locally; tunnel URL for OAuth |
| `AGENT_API_KEY` | **Always set** on device (script auto-generates) |
| OpenRouter / Firecrawl / Zernio | Required for full growth loop |

Copy template:

```bash
cp .env.example .env
# or let termux-setup.sh create it
```

## Hardening checklist

1. **Single writer** — never run two `node server/index.js` against the same `data/`. Use `./stop-termux.sh` first.
2. **Agent auth** — `AGENT_API_KEY` required for non-loopback clients (other proot namespaces, LAN).
3. **Do not commit `.env`** — secrets stay on device.
4. **Backups** — copy `data/content-os.sqlite` and `storage/images/`.
5. **Thermal** — on Fold/phone, avoid heavy scrape + image gen while charging hot; lower `SCRAPE_CONCURRENCY`.
6. **Tunnel only when needed** — Instagram OAuth / remote Commander need `PUBLIC_BASE_URL` = public tunnel; keep `AGENT_API_KEY` on every remote call.

## Agent CLI (device)

```bash
export CONTENT_OS_URL=http://127.0.0.1:3950
export AGENT_API_KEY="$(grep '^AGENT_API_KEY=' .env | cut -d= -f2-)"

node scripts/agent-cli.js health
node scripts/agent-cli.js feed --limit 5
node scripts/agent-cli.js invoke list_feed '{"limit":5}'
node scripts/agent-cli.js empire
```

## PM2 (proot / VPS only)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

Termux often prefers plain `./start-termux.sh` or `termux-wake-lock` + background job.

## Wake lock (Termux)

```bash
termux-wake-lock
./start-termux.sh &
# later:
./stop-termux.sh
termux-wake-unlock
```

## Boundary: Termux vs proot

- Paths differ (`$PREFIX` vs `/usr`). Always `cd` into `content-os/` before start.
- Node binary from Termux `pkg` is not the same as proot Ubuntu’s; install deps **inside** the environment that will run the process.
- If DB says `database is locked`, another shell still holds the lock file under `data/`.

See also: [AGENT_API.md](./AGENT_API.md), [EMPIRE_FUSE.md](./EMPIRE_FUSE.md).
