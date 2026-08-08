#!/usr/bin/env node
/**
 * Lightweight CLI for Termux / Commander shells.
 * Usage:
 *   node scripts/agent-cli.js health
 *   node scripts/agent-cli.js feed [--limit 10]
 *   node scripts/agent-cli.js empire
 *   node scripts/agent-cli.js invoke <tool> [json-args]
 *   node scripts/agent-cli.js tools
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadDotEnv();

const BASE = (process.env.CONTENT_OS_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3950").replace(/\/$/, "");
const KEY = process.env.AGENT_API_KEY || "";

async function agentFetch(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (KEY) {
    headers.Authorization = `Bearer ${KEY}`;
    headers["X-Agent-Key"] = KEY;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

function usage() {
  console.log(`Content-OS agent CLI
  Base: ${BASE}
  Auth: ${KEY ? "AGENT_API_KEY set" : "loopback / no key"}

Commands:
  health              Agent health
  empire              Empire status snapshot
  feed [--limit N]    Ranked feed
  tools               List tool names
  invoke <tool> [json]  POST /api/agent/invoke
  prompt              Commander prompt text
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    return;
  }

  if (cmd === "health") {
    console.log(JSON.stringify(await agentFetch("/api/agent/health"), null, 2));
    return;
  }
  if (cmd === "empire") {
    console.log(JSON.stringify(await agentFetch("/api/agent/empire-status"), null, 2));
    return;
  }
  if (cmd === "tools") {
    const t = await agentFetch("/api/agent/tools");
    console.log((t.tools || []).map((x) => x.name).join("\n"));
    return;
  }
  if (cmd === "prompt") {
    const res = await fetch(`${BASE}/api/agent/prompt`, {
      headers: KEY ? { Authorization: `Bearer ${KEY}` } : {},
    });
    console.log(await res.text());
    return;
  }
  if (cmd === "feed") {
    let limit = 10;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--limit" && rest[i + 1]) limit = Number(rest[++i]);
    }
    const r = await agentFetch("/api/agent/invoke", {
      method: "POST",
      body: { tool: "list_feed", arguments: { limit } },
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "invoke") {
    const tool = rest[0];
    if (!tool) {
      console.error("invoke requires tool name");
      process.exit(1);
    }
    let args = {};
    if (rest[1]) {
      try {
        args = JSON.parse(rest[1]);
      } catch {
        console.error("arguments must be JSON");
        process.exit(1);
      }
    }
    const r = await agentFetch("/api/agent/invoke", {
      method: "POST",
      body: { tool, arguments: args },
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  if (e.data) console.error(JSON.stringify(e.data, null, 2));
  process.exit(1);
});
