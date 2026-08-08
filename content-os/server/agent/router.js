/**
 * Agent-facing control plane for Content-OS.
 * REST paths + POST /invoke for Commander / Happy Agents.
 */

import { Router } from "express";
import { config, serviceStatus } from "../config.js";
import {
  getAllSettings,
  listSources, createSource, updateSource, getSource,
  listJobs, getJobWithDetails,
  listArticles, getArticle, setArticleStatus, getFreshnessHours,
  listDrafts, getDraft, createDraft, updateDraft, listVersions,
  addDraftImage, listDraftImages,
  listScheduledPosts, createScheduledPost,
  listAccounts,
  insertArticle,
} from "../db.js";
import { enqueueSourceJob, queueSize } from "../jobRunner.js";
import { broadcastGlobal } from "../sse.js";
import { computeNextRun } from "../sourceScheduler.js";
import { collectResearch } from "../collectors/research.js";
import { generateCaption, refineCaption, generateDraftImage } from "../ai/contentAgent.js";
import { rankPendingArticles } from "../ai/rankArticles.js";
import { SUPPORTED_PLATFORMS, uploadMedia, createPost } from "../zernio.js";
import { agentAuth } from "./auth.js";
import { AGENT_TOOLS, toolByName, commanderPromptBlock } from "./tools.js";
import { validateArgs } from "./validate.js";

const IMAGE_RATIOS = ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"];

const ok = (res, data, status = 200) => res.status(status).json(data);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const asyncRoute = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) =>
    fail(res, err.status || 500, err.message || String(err)));

function startImageJob(draftId, { aspectRatio, research, customPrompt }) {
  updateDraft(draftId, { image_status: "generating" });
  broadcastGlobal({ type: "draft-image", draftId, status: "generating" });

  (async () => {
    try {
      const r = await generateDraftImage(draftId, customPrompt, { aspectRatio, research });
      addDraftImage(draftId, { image_path: r.imagePath, prompt: r.prompt, aspect_ratio: aspectRatio });
      updateDraft(draftId, { image_path: r.imagePath, image_prompt: r.prompt, image_status: "ready" });
      broadcastGlobal({ type: "draft-image", draftId, status: "ready", imagePath: r.imagePath });
    } catch (err) {
      updateDraft(draftId, { image_status: "failed" });
      broadcastGlobal({ type: "draft-image", draftId, status: "failed", error: err.message });
    }
  })();
}

/** Core handlers used by REST + invoke. args are plain objects. */
export const handlers = {
  async content_os_health() {
    return {
      ok: true,
      time: new Date().toISOString(),
      services: serviceStatus(),
      queue: queueSize(),
      platforms: SUPPORTED_PLATFORMS,
      agent: {
        auth: config.agentApiKey ? "api_key" : "loopback_only",
        tools: AGENT_TOOLS.length,
      },
    };
  },

  async empire_status() {
    const services = serviceStatus();
    const fresh = listArticles({ withinHours: getFreshnessHours(), limit: 300 });
    const byStatus = { new: 0, shortlisted: 0, used: 0, dismissed: 0 };
    for (const a of fresh) {
      if (byStatus[a.status] != null) byStatus[a.status] += 1;
      else byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }
    const drafts = listDrafts();
    const generating = drafts.filter((d) => d.image_status === "generating").length;
    const posts = listScheduledPosts();
    const scheduled = posts.filter((p) => p.status === "scheduled").length;
    const published = posts.filter((p) => p.status === "published").length;
    const sources = listSources();
    const top = fresh.slice(0, 8).map((a) => ({
      id: a.id,
      title: a.title,
      priority_score: a.priority_score,
      status: a.status,
      url: a.url,
    }));
    return {
      layer: "growth",
      system: "content-os",
      ok: true,
      time: new Date().toISOString(),
      url: config.publicBaseUrl,
      services,
      queue: queueSize(),
      feed: {
        fresh_total: fresh.length,
        new: byStatus.new || 0,
        shortlisted: byStatus.shortlisted || 0,
        used: byStatus.used || 0,
        dismissed: byStatus.dismissed || 0,
        top,
      },
      studio: { drafts: drafts.length, generating_images: generating },
      outbox: { scheduled, published_recent: published },
      sources: {
        enabled: sources.filter((s) => s.enabled).length,
        total: sources.length,
      },
      agent: {
        tools: AGENT_TOOLS.length,
        auth: config.agentApiKey ? "api_key" : "loopback_only",
      },
      embed: {
        panel: "/empire/panel.html",
        script: "/empire/embed.js",
      },
    };
  },

  async list_feed(args = {}) {
    const bypass = Boolean(args.bypass_freshness);
    const statuses = args.statuses
      ? String(args.statuses).split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    const withinHours = bypass ? null : getFreshnessHours();
    const limit = Math.min(300, Math.max(1, Number(args.limit) || 50));
    let rows = listArticles({ withinHours, statuses, limit: 300 });
    const minScore = args.min_score != null ? Number(args.min_score) : null;
    if (minScore != null && Number.isFinite(minScore)) {
      rows = rows.filter((a) => Number(a.priority_score ?? a.score ?? 0) >= minScore);
    }
    return { count: rows.slice(0, limit).length, articles: rows.slice(0, limit) };
  },

  async get_article(args) {
    const article = getArticle(args.id);
    if (!article) {
      const err = new Error("Article not found");
      err.status = 404;
      throw err;
    }
    return article;
  },

  async approve_article(args) {
    if (!getArticle(args.id)) {
      const err = new Error("Article not found");
      err.status = 404;
      throw err;
    }
    return setArticleStatus(args.id, "shortlisted");
  },

  async reject_article(args) {
    if (!getArticle(args.id)) {
      const err = new Error("Article not found");
      err.status = 404;
      throw err;
    }
    const article = setArticleStatus(args.id, "dismissed");
    return { ...article, reason: args.reason || null };
  },

  async set_article_status(args) {
    if (!getArticle(args.id)) {
      const err = new Error("Article not found");
      err.status = 404;
      throw err;
    }
    if (!["new", "shortlisted", "used", "dismissed"].includes(args.status)) {
      const err = new Error("Invalid status");
      err.status = 400;
      throw err;
    }
    return setArticleStatus(args.id, args.status);
  },

  async rank_articles() {
    const ranked = await rankPendingArticles();
    return { ranked };
  },

  async create_brief(args = {}) {
    if (args.article_id) {
      const article = getArticle(args.article_id);
      if (!article) {
        const err = new Error("Article not found");
        err.status = 404;
        throw err;
      }
      let caption = args.caption ?? "";
      const doGen = args.generate_caption !== false;
      if (doGen && !caption && config.openrouterApiKey) {
        caption = await generateCaption(article.id, args.platform || "general");
      }
      const draft = createDraft({
        article_id: article.id,
        title: args.title || article.title,
        caption,
      });
      setArticleStatus(article.id, "used");
      return { draft, from_article: article.id };
    }
    const draft = createDraft({
      title: args.title || "Untitled brief",
      caption: args.caption ?? "",
      article_id: null,
    });
    return { draft };
  },

  async list_drafts() {
    return { drafts: listDrafts() };
  },

  async get_draft(args) {
    const draft = getDraft(args.id);
    if (!draft) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    return {
      ...draft,
      versions: listVersions(draft.id),
      images: listDraftImages(draft.id),
    };
  },

  async update_draft(args) {
    if (!getDraft(args.id)) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    const fields = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.caption !== undefined) fields.caption = args.caption;
    if (args.status !== undefined) fields.status = args.status;
    return updateDraft(args.id, fields);
  },

  async generate_caption(args) {
    const draft = getDraft(args.id);
    if (!draft) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    if (!draft.article_id) {
      const err = new Error("Draft has no source article");
      err.status = 400;
      throw err;
    }
    const caption = await generateCaption(draft.article_id, args.platform || "general");
    return updateDraft(draft.id, { caption });
  },

  async refine_caption(args) {
    const instruction = String(args.instruction || "").trim();
    if (!instruction) {
      const err = new Error("Instruction is required");
      err.status = 400;
      throw err;
    }
    if (!getDraft(args.id)) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    const caption = await refineCaption(args.id, instruction);
    return { caption, versions: listVersions(args.id) };
  },

  async generate_image(args) {
    const draft = getDraft(args.id);
    if (!draft) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    if (draft.image_status === "generating") {
      const err = new Error("An image is already generating for this draft");
      err.status = 409;
      throw err;
    }
    const aspectRatio = IMAGE_RATIOS.includes(args.aspect_ratio) ? args.aspect_ratio : "4:3";
    startImageJob(draft.id, {
      aspectRatio,
      research: Boolean(args.research),
      customPrompt: args.prompt,
    });
    return { status: "generating", aspectRatio, draft_id: draft.id };
  },

  async list_accounts() {
    return { accounts: listAccounts() };
  },

  async schedule_post(args) {
    const draft = getDraft(args.id);
    if (!draft) {
      const err = new Error("Draft not found");
      err.status = 404;
      throw err;
    }
    const platforms = args.platforms;
    if (!Array.isArray(platforms) || !platforms.length) {
      const err = new Error("Select at least one platform/account");
      err.status = 400;
      throw err;
    }
    for (const p of platforms) {
      if (!SUPPORTED_PLATFORMS.includes(p.platform)) {
        const err = new Error(`Unsupported platform: ${p.platform}`);
        err.status = 400;
        throw err;
      }
      if (!p.accountId) {
        const err = new Error("Each platform needs an accountId");
        err.status = 400;
        throw err;
      }
    }
    const mediaUrls = [];
    if (draft.image_path) mediaUrls.push(await uploadMedia(draft.image_path));
    const publishNow = Boolean(args.publish_now);
    const scheduledFor = args.scheduled_for;
    const post = await createPost({
      content: draft.caption,
      scheduledFor,
      publishNow,
      timezone: getAllSettings().timezone,
      platforms,
      mediaUrls,
    });
    const scheduled = createScheduledPost({
      draft_id: draft.id,
      zernio_post_id: post.id,
      scheduled_for: scheduledFor || new Date().toISOString(),
      timezone: getAllSettings().timezone,
      platforms,
      status: publishNow ? "published" : "scheduled",
      status_detail: post.status,
    });
    updateDraft(draft.id, { status: "scheduled" });
    return scheduled;
  },

  async list_scheduled() {
    return { posts: listScheduledPosts() };
  },

  async list_sources() {
    return { sources: listSources() };
  },

  async create_source(args = {}) {
    if (!args.url || String(args.url).trim().length < 2) {
      const err = new Error("URL or search query is required");
      err.status = 400;
      throw err;
    }
    const source = createSource({
      name: args.name?.trim() || String(args.url).trim(),
      url: String(args.url).trim(),
      type: args.type || "auto",
      interval_value: args.interval_value,
      interval_unit: args.interval_unit,
      topic_tags: args.topic_tags,
      enabled: args.enabled,
    });
    const next = computeNextRun(new Date(), source.interval_value, source.interval_unit);
    updateSource(source.id, { next_run_at: next });
    return getSource(source.id);
  },

  async run_source(args) {
    if (!getSource(args.id)) {
      const err = new Error("Source not found");
      err.status = 404;
      throw err;
    }
    return enqueueSourceJob(args.id, "agent");
  },

  async research(args = {}) {
    const query = String(args.query || "").trim();
    if (query.length < 2) {
      const err = new Error("A research query is required");
      err.status = 400;
      throw err;
    }
    const depth = args.depth === "sonar-pro" ? "sonar-pro" : "sonar";
    const tags = Array.isArray(args.topic_tags) ? args.topic_tags : [];
    const items = await collectResearch(query, { tags, depth });
    let added = 0;
    for (const it of items) {
      const r = insertArticle({ ...it, scraped_at: new Date().toISOString() });
      if (r.inserted) added += 1;
    }
    let ranked = 0;
    try {
      ranked = await rankPendingArticles();
    } catch { /* optional */ }
    return { found: items.length, added, ranked };
  },

  async list_jobs() {
    return { jobs: listJobs(50) };
  },

  async get_job(args) {
    const job = getJobWithDetails(args.id);
    if (!job) {
      const err = new Error("Job not found");
      err.status = 404;
      throw err;
    }
    return job;
  },
};

export async function invokeTool(name, args = {}) {
  const tool = toolByName(name);
  if (!tool) {
    const err = new Error(`Unknown tool: ${name}`);
    err.status = 400;
    throw err;
  }
  const fn = handlers[name];
  if (!fn) {
    const err = new Error(`Handler missing for ${name}`);
    err.status = 500;
    throw err;
  }
  const errors = validateArgs(tool.parameters, args || {});
  if (errors.length) {
    const err = new Error(`Invalid arguments for ${name}: ${errors.join("; ")}`);
    err.status = 400;
    err.validation = errors;
    throw err;
  }
  return fn(args || {});
}

export function createAgentRouter() {
  const r = Router();

  // Optional CORS for empire dashboard embeds on another origin.
  r.use((req, res, next) => {
    const origin = config.empireCorsOrigin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Agent-Key");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      if (req.method === "OPTIONS") return res.status(204).end();
    }
    next();
  });

  r.use(agentAuth);

  r.get("/tools", (_req, res) => {
    ok(res, {
      version: 1,
      base: "/api/agent",
      invoke: "POST /api/agent/invoke",
      auth: config.agentApiKey ? "bearer_or_x_agent_key" : "loopback_only",
      tools: AGENT_TOOLS,
      commander_prompt: commanderPromptBlock(),
    });
  });

  r.get("/prompt", (_req, res) => {
    res.type("text/plain").send(commanderPromptBlock());
  });

  r.post("/invoke", asyncRoute(async (req, res) => {
    const tool = req.body?.tool || req.body?.name;
    const args = req.body?.arguments ?? req.body?.args ?? {};
    if (!tool) return fail(res, 400, "Body must include tool (or name)");
    try {
      const result = await invokeTool(tool, args);
      ok(res, { ok: true, tool, result });
    } catch (err) {
      fail(res, err.status || 500, err.message);
    }
  }));

  r.get("/health", asyncRoute(async (_req, res) => ok(res, await handlers.content_os_health())));

  r.get("/empire-status", asyncRoute(async (_req, res) => ok(res, await handlers.empire_status())));

  r.get("/feed", asyncRoute(async (req, res) => {
    ok(res, await handlers.list_feed({
      bypass_freshness: req.query.bypass_freshness === "true" || req.query.bypassFreshness === "true",
      statuses: req.query.statuses,
      limit: req.query.limit,
      min_score: req.query.min_score,
    }));
  }));

  r.get("/articles/:id", asyncRoute(async (req, res) => {
    ok(res, await handlers.get_article({ id: req.params.id }));
  }));

  r.post("/articles/:id/approve", asyncRoute(async (req, res) => {
    ok(res, await handlers.approve_article({ id: req.params.id }));
  }));

  r.post("/articles/:id/reject", asyncRoute(async (req, res) => {
    ok(res, await handlers.reject_article({ id: req.params.id, reason: req.body?.reason }));
  }));

  r.post("/articles/:id/status", asyncRoute(async (req, res) => {
    ok(res, await handlers.set_article_status({ id: req.params.id, status: req.body?.status }));
  }));

  r.post("/rank", asyncRoute(async (_req, res) => ok(res, await handlers.rank_articles())));

  r.post("/briefs", asyncRoute(async (req, res) => {
    const result = await handlers.create_brief(req.body || {});
    ok(res, result, 201);
  }));

  r.get("/drafts", asyncRoute(async (_req, res) => ok(res, await handlers.list_drafts())));

  r.get("/drafts/:id", asyncRoute(async (req, res) => {
    ok(res, await handlers.get_draft({ id: req.params.id }));
  }));

  r.put("/drafts/:id", asyncRoute(async (req, res) => {
    ok(res, await handlers.update_draft({ id: req.params.id, ...(req.body || {}) }));
  }));

  r.post("/drafts/:id/caption", asyncRoute(async (req, res) => {
    ok(res, await handlers.generate_caption({ id: req.params.id, platform: req.body?.platform }));
  }));

  r.post("/drafts/:id/refine", asyncRoute(async (req, res) => {
    ok(res, await handlers.refine_caption({ id: req.params.id, instruction: req.body?.instruction }));
  }));

  r.post("/drafts/:id/image", asyncRoute(async (req, res) => {
    const result = await handlers.generate_image({
      id: req.params.id,
      aspect_ratio: req.body?.aspect_ratio || req.body?.aspectRatio,
      prompt: req.body?.prompt,
      research: req.body?.research,
    });
    ok(res, result, 202);
  }));

  r.post("/drafts/:id/schedule", asyncRoute(async (req, res) => {
    const body = req.body || {};
    const result = await handlers.schedule_post({
      id: req.params.id,
      platforms: body.platforms,
      scheduled_for: body.scheduled_for || body.scheduledFor,
      publish_now: body.publish_now ?? body.publishNow,
    });
    ok(res, result, 201);
  }));

  r.get("/accounts", asyncRoute(async (_req, res) => ok(res, await handlers.list_accounts())));
  r.get("/scheduled", asyncRoute(async (_req, res) => ok(res, await handlers.list_scheduled())));
  r.get("/sources", asyncRoute(async (_req, res) => ok(res, await handlers.list_sources())));

  r.post("/sources", asyncRoute(async (req, res) => {
    ok(res, await handlers.create_source(req.body || {}), 201);
  }));

  r.post("/sources/:id/run", asyncRoute(async (req, res) => {
    ok(res, await handlers.run_source({ id: req.params.id }), 201);
  }));

  r.post("/research", asyncRoute(async (req, res) => {
    ok(res, await handlers.research(req.body || {}));
  }));

  r.get("/jobs", asyncRoute(async (_req, res) => ok(res, await handlers.list_jobs())));

  r.get("/jobs/:id", asyncRoute(async (req, res) => {
    ok(res, await handlers.get_job({ id: req.params.id }));
  }));

  return r;
}
