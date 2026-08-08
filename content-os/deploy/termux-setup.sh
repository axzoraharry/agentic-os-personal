#!/data/data/com.termux/files/usr/bin/env bash
# Content-OS hardened install for Termux or proot-Ubuntu.
# Usage (from content-os/):  bash deploy/termux-setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { printf '\n\033[1;36m[content-os]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

detect_env() {
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX" ] && command -v pkg >/dev/null 2>&1; then
    echo termux
  elif [ -f /etc/os-release ] && grep -qi ubuntu /etc/os-release 2>/dev/null; then
    echo proot-ubuntu
  elif command -v apt-get >/dev/null 2>&1; then
    echo debianish
  else
    echo unknown
  fi
}

ENV_KIND="$(detect_env)"
log "Environment: $ENV_KIND"
log "App root: $ROOT"

install_node() {
  if command -v node >/dev/null 2>&1; then
    NODE_V="$(node -v | sed 's/^v//')"
    MAJOR="${NODE_V%%.*}"
    if [ "${MAJOR:-0}" -ge 20 ]; then
      log "Node $(node -v) OK"
      return 0
    fi
    warn "Node $(node -v) < 20 — upgrading if possible"
  fi

  case "$ENV_KIND" in
    termux)
      pkg update -y
      pkg install -y nodejs git openssl curl
      ;;
    proot-ubuntu|debianish)
      if ! command -v node >/dev/null 2>&1 || [ "${MAJOR:-0}" -lt 20 ]; then
        if command -v curl >/dev/null 2>&1; then
          curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
          apt-get install -y nodejs
        else
          apt-get update -y
          apt-get install -y nodejs npm
        fi
      fi
      apt-get install -y openssl curl ca-certificates 2>/dev/null || true
      ;;
    *)
      die "Install Node.js >= 20 manually, then re-run this script"
      ;;
  esac

  command -v node >/dev/null 2>&1 || die "node still missing"
  log "Node $(node -v) / npm $(npm -v)"
}

setup_env_file() {
  if [ -f .env ]; then
    log ".env already exists — not overwriting"
  else
    cp .env.example .env
    log "Created .env from .env.example"
  fi

  # Ensure AGENT_API_KEY for non-loopback agent mesh (phone + proot often share nets)
  if ! grep -q '^AGENT_API_KEY=.\+' .env 2>/dev/null; then
    KEY="$(openssl rand -hex 24 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    if grep -q '^AGENT_API_KEY=' .env; then
      # portable in-place replace without sed -i differences
      tmp="$(mktemp)"
      while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
          AGENT_API_KEY=*) echo "AGENT_API_KEY=$KEY" ;;
          *) echo "$line" ;;
        esac
      done < .env > "$tmp"
      mv "$tmp" .env
    else
      printf '\nAGENT_API_KEY=%s\n' "$KEY" >> .env
    fi
    log "Generated AGENT_API_KEY (saved in .env)"
  fi

  # Termux-friendly defaults
  if ! grep -q '^PORT=' .env; then
    echo 'PORT=3950' >> .env
  fi
  if ! grep -q '^PUBLIC_BASE_URL=' .env; then
    echo 'PUBLIC_BASE_URL=http://127.0.0.1:3950' >> .env
  fi

  # Prevent accidental bind issues: keep 0.0.0.0 in server; user tunnels as needed
  mkdir -p data storage/images
  chmod 700 data 2>/dev/null || true
}

install_deps() {
  log "npm install (production deps)"
  npm install --omit=dev
  npm run build
}

write_start_helpers() {
  cat > start-termux.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export NODE_ENV="${NODE_ENV:-production}"
# Avoid multiple instances fighting for SQLite
if command -v lsof >/dev/null 2>&1; then
  PORT="$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo 3950)"
  PORT="${PORT:-3950}"
  if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT already in use. Stop the other process or change PORT in .env"
    lsof -i ":$PORT" -sTCP:LISTEN || true
    exit 1
  fi
fi
exec node server/index.js
EOF
  chmod +x start-termux.sh

  cat > stop-termux.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
PORT="$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo 3950)"
PORT="${PORT:-3950}"
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "Stopping PIDs on :$PORT → $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 1
    kill -9 $PIDS 2>/dev/null || true
  else
    echo "Nothing listening on :$PORT"
  fi
else
  pkill -f "node server/index.js" 2>/dev/null || echo "pkill not available; stop manually"
fi
EOF
  chmod +x stop-termux.sh

  log "Wrote start-termux.sh / stop-termux.sh"
}

print_next() {
  KEY_HINT="$(grep -E '^AGENT_API_KEY=' .env | head -1 | cut -d= -f2- | cut -c1-8)"
  cat <<EOF

────────────────────────────────────────────
 Content-OS Termux / proot setup complete
────────────────────────────────────────────
  Start:   ./start-termux.sh
  Stop:    ./stop-termux.sh
  HUD:     http://127.0.0.1:3950
  Agent:   GET  /api/agent/tools
           POST /api/agent/invoke
  Empire:  GET  /api/agent/empire-status
  CLI:     node scripts/agent-cli.js health

  AGENT_API_KEY prefix: ${KEY_HINT}…
  Edit .env for OpenRouter / Firecrawl / Zernio keys.

  Optional tunnel (for OAuth / remote Commander):
    # Termux: pkg install cloudflared  OR  use ngrok
    cloudflared tunnel --url http://127.0.0.1:3950

  Keep only ONE node process — SQLite is single-writer.
────────────────────────────────────────────
EOF
}

install_node
setup_env_file
install_deps
write_start_helpers
print_next
