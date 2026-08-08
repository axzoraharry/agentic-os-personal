/**
 * Agent control-plane auth.
 *
 * - If AGENT_API_KEY is set: require Authorization: Bearer <key> or X-Agent-Key.
 * - If unset: allow only loopback (local agents / Termux localhost).
 */

import { createHash, timingSafeEqual } from "crypto";

import { config } from "../config.js";

/**
 * Constant-time string compare. Both sides are hashed first so the comparison
 * runs over fixed-length buffers — timingSafeEqual throws on length mismatch,
 * and a length-dependent early exit would itself leak the key length.
 */
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a), "utf8").digest();
  const hb = createHash("sha256").update(String(b), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The direct peer address. This is the only address a client cannot forge,
 * so it is the basis of the loopback trust decision.
 */
function socketIp(req) {
  return req.socket?.remoteAddress || "";
}

/**
 * The original client as reported by a fronting proxy, if any. Client-
 * controlled, so it is only ever used to *deny*, never to grant trust.
 */
function forwardedIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  if (typeof raw === "string" && raw.length) return raw.split(",")[0].trim();
  return "";
}

function isLoopback(ip) {
  if (!ip) return false;
  const n = ip.replace(/^::ffff:/, "");
  return n === "127.0.0.1" || n === "::1" || n === "localhost";
}

export function extractAgentKey(req) {
  const h = req.headers.authorization || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const x = req.headers["x-agent-key"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return "";
}

export function agentAuth(req, res, next) {
  const expected = config.agentApiKey;
  if (expected) {
    const got = extractAgentKey(req);
    if (!got || !safeEqual(got, expected)) {
      return res.status(401).json({
        error: "Unauthorized",
        hint: "Send Authorization: Bearer <AGENT_API_KEY> or X-Agent-Key header",
      });
    }
    return next();
  }

  // No key configured — local mesh only.
  //
  // Two independent checks, because either one alone is bypassable:
  //   1. The socket peer must be loopback. Unforgeable, so this blocks any
  //      remote client connecting to us directly (including one that sends a
  //      spoofed X-Forwarded-For: 127.0.0.1).
  //   2. If a proxy fronts us and reports a non-loopback original client, deny.
  //      The socket peer would be the proxy on 127.0.0.1 and would otherwise
  //      pass check 1, letting the whole internet through nginx.
  const denied = {
    error: "Agent API requires AGENT_API_KEY for non-local clients",
    hint: "Set AGENT_API_KEY in .env, or call from localhost",
  };

  if (!isLoopback(socketIp(req))) return res.status(403).json(denied);

  const forwarded = forwardedIp(req);
  if (forwarded && !isLoopback(forwarded)) return res.status(403).json(denied);

  return next();
}
