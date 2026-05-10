import type {
  CopilotHint,
  CopilotMode,
  CopilotRequest,
  CopilotRouteCommand,
  CopilotResponse
} from "../../src/game/copilot";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_BODY_CHARS = 64_000;
const MAX_SNAPSHOT_CHARS = 52_000;

const VALID_MODES = new Set<CopilotMode>([
  "hint",
  "review",
  "next_step",
  "explain",
  "shortest_path",
  "solve"
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
  "codeGuidance": ["pseudocode or block-assembly guidance using available blocks only; solve mode uses one solution line per item"],
  "suggestedBlocks": ["available block types that would help"]
}`;

const copilotResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "reactor_logic_copilot_response",
    description: "Structured guidance for the Reactor Logic maze game.",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        riskLevel: { type: "string", enum: ["low", "medium", "high"] },
        hints: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              detail: { type: "string" }
            },
            required: ["title", "detail"]
          }
        },
        nextSteps: {
          type: "array",
          items: { type: "string" }
        },
        codeGuidance: {
          type: "array",
          items: { type: "string" }
        },
        suggestedBlocks: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: [
        "summary",
        "riskLevel",
        "hints",
        "nextSteps",
        "codeGuidance",
        "suggestedBlocks"
      ]
    }
  }
};

const systemPrompt = `You are Reactor Logic Copilot, a programming tutor inside a maze game.

The player controls a robot on a grid. The robot must seal every unsealed hotspot with deployFoam before reaching extraction. The maze snapshot uses this legend: # wall, . floor, S start, E extraction, H unsealed hotspot, X sealed hotspot, R robot. The robot can only use the listed available blocks and conditions.

Use the snapshot to reason about route, facing, hazards, foam, current program, and training focus. For shortest_path mode, treat snapshot.shortestPath as the authoritative shortest grid route through every unsealed hotspot and then extraction; explain the route and how to translate it into blocks. For solve mode, return the best solution for the current level using snapshot.shortestPath.advancedPseudoCode as the canonical answer. Put the solution lines, in order, in codeGuidance. The solve answer should prefer advanced blocks: defineProcedure, callProcedure, if on_hotspot, repeat, and while hotspots_left_gt_0 when hotspots remain. For level 1, give step-by-step sequence guidance. For level 2, prefer repeat and if/then reasoning when useful. For level 3 and above, introduce procedure definitions/calls, while loops, and condition checks when they reduce repeated logic.

Keep guidance actionable and game-specific. Do not invent hidden commands, coordinates outside the maze, or unavailable blocks. Do not claim you executed the player's program. Return only strict JSON matching this schema. Do not use Markdown fences. Do not put literal line breaks inside JSON string values; keep every array item to one line.
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
        if (isRecord(item) && typeof item.output_text === "string") {
          return item.output_text;
        }
        if (isRecord(item) && typeof item.content === "string") {
          return item.content;
        }
        if (isRecord(item) && typeof item.refusal === "string") {
          return item.refusal;
        }
        return undefined;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  if (isRecord(content) && typeof content.text === "string") {
    return content.text;
  }

  if (isRecord(content) && typeof content.output_text === "string") {
    return content.output_text;
  }

  if (isRecord(content) && typeof content.content === "string") {
    return content.content;
  }

  if (isRecord(content) && typeof content.refusal === "string") {
    return content.refusal;
  }

  return undefined;
};

const extractNestedText = (value: unknown, depth = 0): string | undefined => {
  if (depth > 5) {
    return undefined;
  }

  const direct = textFromContent(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractNestedText(item, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const priorityKeys = [
    "response",
    "message",
    "content",
    "output_text",
    "text",
    "choices",
    "output",
    "result",
    "completion",
    "answer"
  ];

  for (const key of priorityKeys) {
    if (key in value) {
      const nested = extractNestedText(value[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
};

const describeAiShape = (result: Record<string, unknown>): string => {
  const parts = [`top-level keys: ${Object.keys(result).join(", ") || "none"}`];
  const choices = Array.isArray(result.choices) ? result.choices : undefined;
  const firstChoice = choices?.[0];

  if (isRecord(firstChoice)) {
    parts.push(`choice[0] keys: ${Object.keys(firstChoice).join(", ") || "none"}`);
    if (typeof firstChoice.finish_reason === "string") {
      parts.push(`finish_reason: ${firstChoice.finish_reason}`);
    }

    const message = isRecord(firstChoice.message) ? firstChoice.message : undefined;
    if (message) {
      parts.push(`message keys: ${Object.keys(message).join(", ") || "none"}`);
      parts.push(`content type: ${message.content === null ? "null" : typeof message.content}`);
      parts.push(`refusal type: ${message.refusal === null ? "null" : typeof message.refusal}`);
      if (Array.isArray(message.tool_calls)) {
        parts.push(`tool_calls: ${message.tool_calls.length}`);
      }
    }
  }

  return parts.join("; ");
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

  const nestedText = extractNestedText(result);
  if (nestedText) {
    return nestedText;
  }

  throw new Error(
    `Workers AI response did not include message content. ${describeAiShape(result)}.`
  );
};

const isCopilotPayload = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  ("summary" in value ||
    "hints" in value ||
    "nextSteps" in value ||
    "codeGuidance" in value ||
    "suggestedBlocks" in value);

const extractAiPayload = (result: unknown): unknown => {
  if (typeof result === "string") {
    return JSON.parse(stripJsonFence(result)) as unknown;
  }

  if (!isRecord(result)) {
    throw new Error("Workers AI returned an empty response.");
  }

  if (isRecord(result.response)) {
    if (isCopilotPayload(result.response)) {
      return result.response;
    }
    const text = extractNestedText(result.response);
    if (text) {
      return JSON.parse(stripJsonFence(text)) as unknown;
    }
  }

  const resultObject = isRecord(result.result) ? result.result : undefined;
  if (resultObject && isRecord(resultObject.response)) {
    if (isCopilotPayload(resultObject.response)) {
      return resultObject.response;
    }
    const text = extractNestedText(resultObject.response);
    if (text) {
      return JSON.parse(stripJsonFence(text)) as unknown;
    }
  }

  return JSON.parse(stripJsonFence(extractAiText(result))) as unknown;
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
    nextSteps: stringArray(value.nextSteps, 10),
    codeGuidance: stringArray(value.codeGuidance, 80),
    suggestedBlocks: stringArray(value.suggestedBlocks, 8)
  };
};

const parseAiResponse = (result: unknown): CopilotResponse =>
  normalizeResponse(extractAiPayload(result));

const formatPosition = (position: { x: number; y: number }): string =>
  `(${position.x}, ${position.y})`;

const commandActionLabel: Record<CopilotRouteCommand["action"], string> = {
  moveForward: "Move Forward",
  turnLeft: "Turn Left",
  turnRight: "Turn Right",
  deployFoam: "Deploy Foam"
};

const commandBlockType: Record<CopilotRouteCommand["action"], string> = {
  moveForward: "moveForward",
  turnLeft: "turnLeft",
  turnRight: "turnRight",
  deployFoam: "deployFoam"
};

const splitCodeLines = (code: string | undefined, limit = 80): string[] =>
  code
    ? code.split("\n").slice(0, limit)
    : [];

const formatCommand = (command: CopilotRouteCommand): string => {
  const label = commandActionLabel[command.action];
  const count = command.count && command.count > 1 ? ` x${command.count}` : "";
  const target = command.position
    ? ` at ${formatPosition(command.position)}`
    : "";
  return `${label}${count}${target}`;
};

const buildFallbackResponse = (
  request: CopilotRequest,
  _reason: string
): CopilotResponse => {
  const route = request.snapshot.shortestPath;
  const programIsEmpty = request.snapshot.program.blocks.length === 0;
  const fallbackHint: CopilotHint = {
    title: "AI fallback",
    detail:
      "Live AI guidance is unavailable right now. This answer uses the built-in maze solver."
  };

  if (!route.available) {
    return {
      summary:
        route.reason ??
        "The built-in route solver cannot find a route that seals every hotspot and reaches extraction.",
      riskLevel: "high",
      hints: [
        fallbackHint,
        {
          title: "Check resources",
          detail:
            route.foamSufficient
              ? "Foam is sufficient, so inspect walls and current robot position."
              : `You need ${route.foamRequired} foam charges but only have ${route.foamAvailable}.`
        }
      ],
      nextSteps: [
        "Reset the robot or level if the current position is trapped.",
        "Confirm every hotspot is reachable before running the program.",
        "Use the minimap to compare open floor tiles against the extraction route."
      ],
      codeGuidance: programIsEmpty
        ? ["Start with movement blocks, then deploy foam only while standing on a hotspot."]
        : ["Review the current command list against the minimap route."],
      suggestedBlocks: ["moveForward", "turnLeft", "turnRight", "deployFoam"]
    };
  }

  const hotspotWaypoints = route.waypoints.filter(
    (waypoint) => waypoint.kind === "hotspot"
  );
  const waypointSteps = route.waypoints.slice(0, 6).map((waypoint) => {
    const label =
      waypoint.kind === "hotspot"
        ? `Seal ${waypoint.id ?? "hotspot"}`
        : "Reach extraction";
    return `${label} at ${formatPosition(waypoint.position)} after ${waypoint.pathIndex} tile moves.`;
  });
  const commandSteps = route.commands.slice(0, 8).map(formatCommand);
  const codeGuidance = route.pseudoCode
    ? route.pseudoCode.split("\n").slice(0, 10)
    : commandSteps;
  const suggestedBlocks = [
    ...new Set(route.commands.map((command) => commandBlockType[command.action]))
  ];

  if (request.mode === "solve") {
    const solutionLines = splitCodeLines(route.advancedPseudoCode);
    const solveBlocks = [
      "defineProcedure",
      "callProcedure",
      "if",
      "repeat",
      ...(route.hotspotsToSeal > 0 ? ["while"] : []),
      ...suggestedBlocks
    ];

    return {
      summary:
        `Best solution: follow the ${route.totalTiles}-tile shortest route, seal ${route.hotspotsToSeal} hotspot${route.hotspotsToSeal === 1 ? "" : "s"}, and end on extraction using advanced control blocks.`,
      riskLevel: route.foamSufficient ? "low" : "high",
      hints: [
        fallbackHint,
        {
          title: "Route basis",
          detail:
            "This solution is generated from the built-in shortest-path solver for the current robot position and facing."
        },
        {
          title: "Advanced structure",
          detail:
            route.hotspotsToSeal > 0
              ? "Define a safe seal procedure, define the route procedure, then call it from a while hotspots-left loop."
              : "Define a route procedure and call it once to reach extraction."
        }
      ],
      nextSteps: waypointSteps.length > 0 ? waypointSteps : commandSteps,
      codeGuidance: solutionLines.length > 0 ? solutionLines : codeGuidance,
      suggestedBlocks: [...new Set(solveBlocks)]
    };
  }

  return {
    summary:
      request.mode === "shortest_path"
        ? `Shortest route: ${route.totalTiles} tile moves, ${route.hotspotsToSeal} hotspot${route.hotspotsToSeal === 1 ? "" : "s"} sealed, then extraction.`
        : `I can still guide from the solver: follow a ${route.totalTiles}-move route that intersects ${route.hotspotsToSeal} hotspot${route.hotspotsToSeal === 1 ? "" : "s"} before extraction.`,
    riskLevel: route.foamSufficient ? "low" : "high",
    hints: [
      fallbackHint,
      {
        title: "Route target",
        detail:
          hotspotWaypoints.length > 0
            ? `First hotspot target is ${formatPosition(hotspotWaypoints[0].position)}.`
            : "All hotspots are already sealed; route straight to extraction."
      }
    ],
    nextSteps: waypointSteps.length > 0 ? waypointSteps : commandSteps,
    codeGuidance,
    suggestedBlocks
  };
};

const runCopilotModel = async (
  ai: AiBinding,
  copilotRequest: CopilotRequest
): Promise<unknown> => {
  return ai.run(MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(copilotRequest) }
    ],
    temperature: 0.2,
    max_completion_tokens: copilotRequest.mode === "solve" ? 1800 : 1200,
    reasoning_effort: "low",
    chat_template_kwargs: {
      enable_thinking: false,
      clear_thinking: true
    },
    response_format: copilotResponseFormat
  });
};

export const onRequestPost = async (context: PagesContext): Promise<Response> => {
  let copilotRequest: CopilotRequest | undefined;
  try {
    copilotRequest = await parseRequest(context.request);

    if (!context.env.AI) {
      return jsonResponse(
        buildFallbackResponse(
          copilotRequest,
          "Workers AI binding is not configured"
        )
      );
    }

    const result = await runCopilotModel(context.env.AI, copilotRequest);

    return jsonResponse(parseAiResponse(result));
  } catch (error) {
    if (error instanceof RequestError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    if (copilotRequest) {
      console.warn("Copilot AI unavailable; returning solver fallback", error);
      return jsonResponse(
        buildFallbackResponse(
          copilotRequest,
          error instanceof Error ? error.message : "Copilot request failed"
        )
      );
    }

    console.error("Copilot request failed before fallback was available", error);
    return jsonResponse({ error: "Copilot request failed." }, 500);
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
