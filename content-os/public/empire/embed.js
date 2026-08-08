/**
 * Portable Growth-layer status card for empire dashboards.
 *
 *   import { mountEmpirePanel, fetchEmpireStatus } from "/empire/embed.js";
 *   mountEmpirePanel(el, { baseUrl: "http://127.0.0.1:3950", agentKey: "…", pollMs: 20000 });
 */

export async function fetchEmpireStatus({ baseUrl = "", agentKey = "" } = {}) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const headers = { Accept: "application/json" };
  if (agentKey) {
    headers.Authorization = `Bearer ${agentKey}`;
    headers["X-Agent-Key"] = agentKey;
  }
  const res = await fetch(`${base}/api/agent/empire-status`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pill(ok) {
  return ok
    ? `<span class="eos-pill on">on</span>`
    : `<span class="eos-pill off">off</span>`;
}

export function renderEmpirePanel(data, { baseUrl = "" } = {}) {
  const s = data.services || {};
  const f = data.feed || {};
  const top = (f.top || [])
    .slice(0, 4)
    .map(
      (a) =>
        `<li><b>${esc(a.priority_score ?? "—")}</b> ${esc(a.title || "Untitled")}</li>`
    )
    .join("");
  const href = (baseUrl || data.url || "").replace(/\/$/, "") || "#";
  return `
    <div class="eos-card">
      <div class="eos-head">
        <span class="eos-title">Growth · Content-OS</span>
        <span class="eos-status ${data.ok ? "ok" : "bad"}">${data.ok ? "ONLINE" : "DEGRADED"}</span>
      </div>
      <div class="eos-metrics">
        <div><span class="lbl">Feed</span><span class="val">${esc(f.fresh_total ?? 0)}</span></div>
        <div><span class="lbl">Shortlist</span><span class="val">${esc(f.shortlisted ?? 0)}</span></div>
        <div><span class="lbl">Drafts</span><span class="val">${esc(data.studio?.drafts ?? 0)}</span></div>
        <div><span class="lbl">Queue</span><span class="val">${esc(data.queue ?? 0)}</span></div>
      </div>
      <div class="eos-svc">
        FC ${pill(s.firecrawl)} · OR ${pill(s.openrouter)} · ZN ${pill(s.zernio)} · GM ${pill(s.gmail)}
      </div>
      <ul class="eos-top">${top || "<li class='empty'>No ranked items in window</li>"}</ul>
      <a class="eos-link" href="${esc(href)}" target="_blank" rel="noopener">Open Content-OS →</a>
    </div>
  `;
}

const DEFAULT_CSS = `
.eos-card{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e8eefc;border:1px solid #1e2a44;border-radius:12px;padding:14px 16px;max-width:420px}
.eos-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.eos-title{font-weight:700;letter-spacing:.04em;font-size:12px;text-transform:uppercase;color:#8fb4ff}
.eos-status{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
.eos-status.ok{background:#0f3d2e;color:#5dffa8}
.eos-status.bad{background:#3d1515;color:#ff8b8b}
.eos-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.eos-metrics .lbl{display:block;font-size:10px;color:#7a88a8}
.eos-metrics .val{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
.eos-svc{font-size:11px;color:#9aabc9;margin-bottom:8px}
.eos-pill{font-size:10px;padding:1px 5px;border-radius:4px}
.eos-pill.on{background:#0f3d2e;color:#5dffa8}
.eos-pill.off{background:#2a2f3d;color:#889}
.eos-top{margin:0 0 10px;padding-left:16px;font-size:12px;line-height:1.45;color:#c9d4ea}
.eos-top .empty{list-style:none;margin-left:-16px;color:#6a7690}
.eos-link{font-size:12px;color:#7eb6ff;text-decoration:none}
.eos-link:hover{text-decoration:underline}
.eos-err{color:#ff8b8b;font-size:12px;padding:8px}
`;

export function mountEmpirePanel(el, opts = {}) {
  if (!el) throw new Error("mountEmpirePanel requires an element");
  const {
    baseUrl = "",
    agentKey = "",
    pollMs = 20000,
    injectStyles = true,
  } = opts;

  if (injectStyles && !document.getElementById("eos-embed-style")) {
    const st = document.createElement("style");
    st.id = "eos-embed-style";
    st.textContent = DEFAULT_CSS;
    document.head.appendChild(st);
  }

  let timer = 0;
  const paint = async () => {
    try {
      const data = await fetchEmpireStatus({ baseUrl, agentKey });
      el.innerHTML = renderEmpirePanel(data, { baseUrl });
    } catch (e) {
      el.innerHTML = `<div class="eos-card"><div class="eos-err">Growth offline: ${esc(e.message)}</div></div>`;
    }
  };

  paint();
  if (pollMs > 0) timer = setInterval(paint, pollMs);
  return () => clearInterval(timer);
}

// Auto-mount when data-eos-auto is present
if (typeof document !== "undefined") {
  const auto = document.querySelector("[data-eos-mount]");
  if (auto) {
    mountEmpirePanel(auto, {
      baseUrl: auto.dataset.baseUrl || "",
      agentKey: auto.dataset.agentKey || "",
      pollMs: Number(auto.dataset.pollMs || 20000),
    });
  }
}
