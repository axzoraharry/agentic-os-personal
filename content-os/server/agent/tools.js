/**
 * Agent tool catalog for Mr. Happy Commander / Happy Agents / MCP wrappers.
 * Each tool maps to an invoke name + optional REST path.
 */

export const AGENT_TOOLS = [
  {
    name: "content_os_health",
    description: "Health check: services (firecrawl, openrouter, zernio, gmail), queue size, platforms.",
    method: "GET",
    path: "/api/agent/health",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "empire_status",
    description:
      "Empire dashboard snapshot: feed counts, top ranked items, drafts, scheduled outbox, sources, services. Prefer this for HUD heartbeats.",
    method: "GET",
    path: "/api/agent/empire-status",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_feed",
    description:
      "List ranked articles in the content feed. Default applies freshness window; set bypass_freshness true to see all. Statuses: new, shortlisted, used, dismissed.",
    method: "GET",
    path: "/api/agent/feed",
    parameters: {
      type: "object",
      properties: {
        bypass_freshness: { type: "boolean", description: "Ignore freshness filter" },
        statuses: {
          type: "string",
          description: "Comma-separated statuses, e.g. new,shortlisted",
        },
        limit: { type: "integer", minimum: 1, maximum: 300, default: 50 },
        min_score: { type: "number", description: "Only return priority_score >= this value" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_article",
    description: "Get one article by id with full fields.",
    method: "GET",
    path: "/api/agent/articles/:id",
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Article id" } },
      additionalProperties: false,
    },
  },
  {
    name: "approve_article",
    description: "Approve / shortlist an article for posting (status=shortlisted).",
    method: "POST",
    path: "/api/agent/articles/:id/approve",
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "reject_article",
    description: "Dismiss an article (status=dismissed).",
    method: "POST",
    path: "/api/agent/articles/:id/reject",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        reason: { type: "string", description: "Optional note (logged in response only)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "set_article_status",
    description: "Set article status explicitly: new | shortlisted | used | dismissed.",
    method: "POST",
    path: "/api/agent/articles/:id/status",
    parameters: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["new", "shortlisted", "used", "dismissed"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "rank_articles",
    description: "Run AI ranking on pending unranked articles. Requires OpenRouter.",
    method: "POST",
    path: "/api/agent/rank",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_brief",
    description:
      "Create a Studio draft (content brief). Prefer article_id to seed from a feed item; optionally auto-generate caption.",
    method: "POST",
    path: "/api/agent/briefs",
    parameters: {
      type: "object",
      properties: {
        article_id: { type: "string", description: "Seed from this article" },
        title: { type: "string" },
        caption: { type: "string" },
        generate_caption: {
          type: "boolean",
          default: true,
          description: "When article_id set, generate caption via AI",
        },
        platform: {
          type: "string",
          description: "Caption platform hint: general | instagram | linkedin | twitter",
          default: "general",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_drafts",
    description: "List Studio drafts.",
    method: "GET",
    path: "/api/agent/drafts",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_draft",
    description: "Get draft with versions and images.",
    method: "GET",
    path: "/api/agent/drafts/:id",
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "update_draft",
    description: "Update draft title, caption, or status fields.",
    method: "PUT",
    path: "/api/agent/drafts/:id",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        caption: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "generate_caption",
    description: "AI-generate caption for a draft that has a source article.",
    method: "POST",
    path: "/api/agent/drafts/:id/caption",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        platform: { type: "string", default: "general" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "refine_caption",
    description: "Agentic caption edit: pass natural-language instruction (shorten, CTA, etc.).",
    method: "POST",
    path: "/api/agent/drafts/:id/refine",
    parameters: {
      type: "object",
      required: ["id", "instruction"],
      properties: {
        id: { type: "string" },
        instruction: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "generate_image",
    description:
      "Trigger Studio image generation (async). Poll get_draft until image_status is ready|failed. Default aspect 4:3.",
    method: "POST",
    path: "/api/agent/drafts/:id/image",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        aspect_ratio: {
          type: "string",
          enum: ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"],
          default: "4:3",
        },
        prompt: { type: "string", description: "Optional custom image prompt" },
        research: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_accounts",
    description: "List connected social accounts (Zernio). Need accountId for schedule_post.",
    method: "GET",
    path: "/api/agent/accounts",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "schedule_post",
    description:
      "Schedule or publish a draft via Zernio. platforms: [{ platform, accountId }] where platform is instagram|linkedin|twitter.",
    method: "POST",
    path: "/api/agent/drafts/:id/schedule",
    parameters: {
      type: "object",
      required: ["id", "platforms"],
      properties: {
        id: { type: "string", description: "Draft id" },
        platforms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              platform: { type: "string" },
              accountId: { type: "string" },
            },
            required: ["platform", "accountId"],
          },
        },
        scheduled_for: { type: "string", description: "ISO datetime; omit with publish_now" },
        publish_now: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_scheduled",
    description: "List scheduled / published posts.",
    method: "GET",
    path: "/api/agent/scheduled",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_sources",
    description: "List scrape / research sources and schedules.",
    method: "GET",
    path: "/api/agent/sources",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_source",
    description: "Add a source (URL or search phrase) with interval.",
    method: "POST",
    path: "/api/agent/sources",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        name: { type: "string" },
        url: { type: "string" },
        type: { type: "string", default: "auto" },
        interval_value: { type: "number" },
        interval_unit: { type: "string", enum: ["hours", "days", "months"] },
        topic_tags: { type: "array", items: { type: "string" } },
        enabled: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run_source",
    description: "Enqueue an immediate scrape job for a source.",
    method: "POST",
    path: "/api/agent/sources/:id/run",
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "research",
    description: "Ad-hoc research query (Perplexity via OpenRouter path); inserts + ranks results.",
    method: "POST",
    path: "/api/agent/research",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        depth: { type: "string", enum: ["sonar", "sonar-pro"], default: "sonar" },
        topic_tags: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_jobs",
    description: "Recent scrape/rank jobs.",
    method: "GET",
    path: "/api/agent/jobs",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_job",
    description: "Get one scrape/rank job by id, including per-source run details.",
    method: "GET",
    path: "/api/agent/jobs/:id",
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Job id" } },
      additionalProperties: false,
    },
  },
];

export function toolByName(name) {
  return AGENT_TOOLS.find((t) => t.name === name) || null;
}

/** Short system-prompt block for Commander. */
export function commanderPromptBlock() {
  const names = AGENT_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return `You control Content-OS (Growth / Distribution layer) via the Agent API.

Base URL: {PUBLIC_BASE_URL}/api/agent
Auth: Authorization: Bearer {AGENT_API_KEY}  (or X-Agent-Key)
Single entry: POST /api/agent/invoke  body: { "tool": "<name>", "arguments": { ... } }
Tool catalog: GET /api/agent/tools

Typical content loop:
1. list_feed (min_score optional) → pick items
2. approve_article or reject_article
3. create_brief { article_id, generate_caption: true }
4. refine_caption / generate_image (poll get_draft)
5. list_accounts → schedule_post { platforms, scheduled_for | publish_now }

Tools:
${names}
`;
}
