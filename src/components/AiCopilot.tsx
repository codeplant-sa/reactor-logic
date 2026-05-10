import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  GripVertical,
  Loader2,
  Pin,
  PinOff,
  Sparkles,
  X
} from "lucide-react";
import type {
  CopilotMode,
  CopilotResponse
} from "../game/copilot";

interface AiCopilotProps {
  disabled?: boolean;
  pinned?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onPinnedChange?: (pinned: boolean) => void;
  onClose?: () => void;
  onAsk: (mode: CopilotMode, question?: string) => Promise<CopilotResponse>;
}

interface CopilotTurn {
  id: string;
  mode: CopilotMode;
  question: string;
  status: "loading" | "complete" | "error";
  response?: CopilotResponse;
  error?: string;
}

const modeOptions: Array<{ value: CopilotMode; label: string }> = [
  { value: "hint", label: "Hint" },
  { value: "review", label: "Review" },
  { value: "shortest_path", label: "Shortest route" },
  { value: "solve", label: "Solve" },
  { value: "next_step", label: "Next step" },
  { value: "explain", label: "Explain" }
];

const COPILOT_MODE_STORAGE_KEY = "reactor-logic.copilot-mode";
const COPILOT_QUESTION_STORAGE_KEY = "reactor-logic.copilot-question";

const isCopilotMode = (value: unknown): value is CopilotMode =>
  modeOptions.some((option) => option.value === value);

const readStoredCopilotMode = (): CopilotMode => {
  try {
    const stored = window.localStorage.getItem(COPILOT_MODE_STORAGE_KEY);
    return isCopilotMode(stored) ? stored : "hint";
  } catch {
    return "hint";
  }
};

const writeStoredCopilotMode = (mode: CopilotMode) => {
  try {
    window.localStorage.setItem(COPILOT_MODE_STORAGE_KEY, mode);
  } catch {
    // Local storage can be unavailable in private browsing or locked-down embeds.
  }
};

const readStoredCopilotQuestion = (): string => {
  try {
    return window.localStorage.getItem(COPILOT_QUESTION_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

const writeStoredCopilotQuestion = (question: string) => {
  try {
    window.localStorage.setItem(COPILOT_QUESTION_STORAGE_KEY, question);
  } catch {
    // Local storage can be unavailable in private browsing or locked-down embeds.
  }
};

const getModeLabel = (mode: CopilotMode): string =>
  modeOptions.find((option) => option.value === mode)?.label ?? mode;

function CopilotResponseBody({
  mode,
  response
}: {
  mode: CopilotMode;
  response: CopilotResponse;
}) {
  return (
    <div className={`copilot-answer risk-${response.riskLevel}`}>
      <p>{response.summary}</p>
      {response.hints.length > 0 ? (
        <ul className="copilot-hints">
          {response.hints.map((hint, index) => (
            <li key={`${hint.title}-${index}`}>
              <strong>{hint.title}</strong>
              <span>{hint.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {response.nextSteps.length > 0 ? (
        <div className="copilot-list">
          <strong>Next</strong>
          <ol>
            {response.nextSteps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {response.codeGuidance.length > 0 ? (
        mode === "solve" ? (
          <div className="copilot-code">
            <strong>Solution</strong>
            <pre>{response.codeGuidance.join("\n")}</pre>
          </div>
        ) : (
          <div className="copilot-list">
            <strong>Code</strong>
            <ul>
              {response.codeGuidance.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      {response.suggestedBlocks.length > 0 ? (
        <div className="copilot-blocks">
          {response.suggestedBlocks.map((block, index) => (
            <span key={`${block}-${index}`}>{block}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AiCopilot({
  disabled,
  pinned = false,
  dragHandleProps,
  onAsk,
  onClose,
  onPinnedChange
}: AiCopilotProps) {
  const [mode, setMode] = useState<CopilotMode>(readStoredCopilotMode);
  const [question, setQuestion] = useState(readStoredCopilotQuestion);
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const {
    className: dragHandleClassName,
    title: dragHandleTitle,
    ...restDragHandleProps
  } = dragHandleProps ?? {};
  const dragTitle =
    dragHandleTitle ??
    (pinned ? "Unpin to move AI Copilot" : "Drag AI Copilot");
  const dragClassName = [
    "copilot-drag-handle",
    pinned ? "pinned" : "",
    dragHandleClassName
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [turns]);

  const updateMode = (nextMode: CopilotMode) => {
    setMode(nextMode);
    writeStoredCopilotMode(nextMode);
  };

  const updateQuestion = (nextQuestion: string) => {
    setQuestion(nextQuestion);
    writeStoredCopilotQuestion(nextQuestion);
  };

  const askCopilot = async () => {
    if (loading) return;

    setLoading(true);
    const requestMode = mode;
    const requestQuestion = question.trim();
    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTurns((previous) => [
      ...previous,
      {
        id: turnId,
        mode: requestMode,
        question: requestQuestion,
        status: "loading"
      }
    ]);

    try {
      const nextResponse = await onAsk(requestMode, requestQuestion || undefined);
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === turnId
            ? { ...turn, status: "complete", response: nextResponse }
            : turn
        )
      );
    } catch (caught) {
      const error =
        caught instanceof Error ? caught.message : "Copilot request failed.";
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === turnId ? { ...turn, status: "error", error } : turn
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ai-copilot" aria-label="AI Copilot">
      <div className="panel-heading copilot-heading">
        <div
          {...restDragHandleProps}
          className={dragClassName}
          title={dragTitle}
        >
          <GripVertical size={15} aria-hidden />
          <span>
            <Bot size={15} />
            AI Copilot
          </span>
        </div>
        <div className="copilot-heading-actions">
          <small>Gemma 4 26B</small>
          {onPinnedChange ? (
            <button
              type="button"
              className={pinned ? "active" : ""}
              title={pinned ? "Unpin AI Copilot" : "Pin AI Copilot"}
              aria-pressed={pinned}
              onClick={() => onPinnedChange(!pinned)}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          ) : null}
          {onClose ? (
            <button type="button" title="Close AI Copilot" onClick={onClose}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="copilot-controls">
        <label>
          Mode
          <select
            value={mode}
            disabled={disabled || loading}
            onChange={(event) => updateMode(event.target.value as CopilotMode)}
          >
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="copilot-ask"
          disabled={disabled || loading}
          onClick={askCopilot}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          Ask
        </button>
      </div>
      <textarea
        value={question}
        disabled={disabled || loading}
        maxLength={800}
        placeholder="Optional question"
        onChange={(event) => updateQuestion(event.target.value)}
      />
      <div className="copilot-thread" ref={threadRef} aria-live="polite">
        {turns.length === 0 ? (
          <div className="copilot-empty">No turns yet.</div>
        ) : (
          turns.map((turn) => (
            <article className="copilot-turn" key={turn.id}>
              <div className="copilot-user-message">
                <span>{getModeLabel(turn.mode)}</span>
                <p>{turn.question || `${getModeLabel(turn.mode)} request`}</p>
              </div>
              <div
                className={`copilot-assistant-message ${
                  turn.response ? `risk-${turn.response.riskLevel}` : ""
                }`}
              >
                {turn.status === "loading" ? (
                  <p className="copilot-loading">
                    <Loader2 size={14} className="spin" />
                    Thinking
                  </p>
                ) : null}
                {turn.status === "error" && turn.error ? (
                  <p className="copilot-error">{turn.error}</p>
                ) : null}
                {turn.status === "complete" && turn.response ? (
                  <CopilotResponseBody mode={turn.mode} response={turn.response} />
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
