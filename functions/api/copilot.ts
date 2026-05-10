import type {
  CopilotHint,
  CopilotMode,
  CopilotRequest,
  CopilotResponse
} from "../../src/game/copilot";

const MODEL = "@cf/moonshotai/kimi-k2.6";
const MAX_BODY_CHARS = 64_000;
const MAX_SNAPSHOT_CHARS = 52_000;

const VALID_MODES = new Set<CopilotMode>([
  "hint",
  "review",
  "next_step",
  "explain"
]);

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

interface Env {
  AI?: AiBinding;
}

interface PagesContext {
  request: Request;
  env: Env;
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRequest = async (request: Request): Promise<CopilotRequest> => {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_CHARS) {
    throw new RequestError("Copilot context is too large.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new RequestError("Request body must be valid JSON.", 400);
  }

  if (!isRecord(parsed)) {
    throw new RequestError("Request body must be a JSON object.", 400);
  }

  const mode = parsed.mode;
  if (typeof mode !== "string" || !VALID_MODES.has(mode as CopilotMode)) {
    throw new RequestError("Unsupported copilot mode.", 400);
  }

  const snapshot = parsed.snapshot;
  if (!isRecord(snapshot)) {
    throw new RequestError("Missing maze snapshot.", 400);
  }

  const snapshotText = JSON.stringify(snapshot);
  if (snapshotText.length > MAX_SNAPSHOT_CHARS) {
    throw new RequestError("Maze snapshot is too large.", 413);
  }

  const question = typeof parsed.question === "string"
    ? parsed.question.slice(0, 800)
    : undefined;

  return {
    mode: mode as CopilotMode,
    question,
    snapshot: snapshot as unknown as CopilotRequest["snapshot"]
  };
};

const responseSchema = `{
  "summary": "One or two concise sentences.",
  "riskLevel": "low | medium | high",
  "hints": [{ "title": "short label", "detail": "specific hint" }],
  "nextSteps": ["ordered player actions or reasoning steps"],
  "codeGuidance": ["pseudocode or block-assembly guidance using available blocks only"],
  "suggestedBlocks": ["available block types that would help"]
}`;

const systemPrompt = `You are Reactor Logic Copilot, a programming tutor inside a maze game.

The player controls a robot on a grid. The robot must seal every unsealed hotspot with deployFoam before reaching extraction. The maze snapshot uses this legend: # wall, . floor, S start, E extraction, H unsealed hotspot, X sealed hotspot, R robot. The robot can only use the listed available blocks and conditions.

Use the snapshot to reason about route, facing, hazards, foam, current program, and training focus. For level 1, give step-by-step sequence guidance. For level 2, prefer repeat and if/then reasoning when useful. For level 3 and above, introduce procedure definitions/calls, while loops, and condition checks when they reduce repeated logic.

Keep guidance actionable and game-specific. Do not invent hidden commands, coordinates outside the maze, or unavailable blocks. Do not claim you executed the player's program. Return only strict JSON matching this schema:
${responseSchema}`;

const buildUserPrompt = (request: CopilotRequest): string =>
  JSON.stringify(
    {
      mode: request.mode,
      question: request.question,
      snapshot: request.snapshot
    },
    null,
    2
  );

const textFromContent = (content: unknown): string | undefined => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        return undefined;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }

  return undefined;
};

const extractAiText = (result: unknown): string => {
  if (typeof result === "string") {
    return result;
  }

  if (!isRecord(result)) {
    throw new Error("Workers AI returned an empty response.");
  }

  const directResponse = textFromContent(result.response);
  if (directResponse) {
    return directResponse;
  }

  const resultObject = isRecord(result.result) ? result.result : undefined;
  const nestedResponse = resultObject ? textFromContent(resultObject.response) : undefined;
  if (nestedResponse) {
    return nestedResponse;
  }

  const choices = Array.isArray(result.choices)
    ? result.choices
    : resultObject && Array.isArray(resultObject.choices)
      ? resultObject.choices
      : undefined;

  const firstChoice = choices?.find(isRecord);
  if (firstChoice) {
    const message = isRecord(firstChoice.message) ? firstChoice.message : undefined;
    const messageText = message ? textFromContent(message.content) : undefined;
    if (messageText) {
      return messageText;
    }

    const text = textFromContent(firstChoice.text);
    if (text) {
      return text;
    }
  }

  throw new Error("Workers AI response did not include message content.");
};

const stripJsonFence = (text: string): string => {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
};

const stringArray = (value: unknown, limit: number): string[] => {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()].slice(0, limit);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
};

const normalizeHints = (value: unknown): CopilotHint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return { title: "Hint", detail: item.trim() };
      }

      if (!isRecord(item)) {
        return undefined;
      }

      const title = typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Hint";
      const detail = typeof item.detail === "string" && item.detail.trim()
        ? item.detail.trim()
        : undefined;

      return detail ? { title, detail } : undefined;
    })
    .filter((item): item is CopilotHint => Boolean(item))
    .slice(0, 4);
};

const normalizeResponse = (value: unknown): CopilotResponse => {
  if (!isRecord(value)) {
    throw new Error("Copilot response was not a JSON object.");
  }

  const riskLevel =
    value.riskLevel === "high" || value.riskLevel === "medium" || value.riskLevel === "low"
      ? value.riskLevel
      : "medium";

  return {
    summary:
      typeof value.summary === "string" && value.summary.trim()
        ? value.summary.trim()
        : "I found a route/programming issue to check.",
    riskLevel,
    hints: normalizeHints(value.hints),
    nextSteps: stringArray(value.nextSteps, 6),
    codeGuidance: stringArray(value.codeGuidance, 6),
    suggestedBlocks: stringArray(value.suggestedBlocks, 8)
  };
};

const parseAiResponse = (text: string): CopilotResponse => {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  return normalizeResponse(parsed);
};

export const onRequestPost = async (context: PagesContext): Promise<Response> => {
  try {
    if (!context.env.AI) {
      return jsonResponse(
        {
          error:
            "Workers AI binding is not configured. Run with Cloudflare Pages or wrangler pages dev."
        },
        503
      );
    }

    const copilotRequest = await parseRequest(context.request);
    const result = await context.env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(copilotRequest) }
      ],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" }
    });

    return jsonResponse(parseAiResponse(extractAiText(result)));
  } catch (error) {
    if (error instanceof RequestError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    console.error("Copilot request failed", error);
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Copilot request failed."
      },
      502
    );
  }
};

export const onRequestOptions = (): Response =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
