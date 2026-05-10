import React, { useState } from "react";
import { Bot, Loader2, Sparkles, X } from "lucide-react";
import type {
  CopilotMode,
  CopilotResponse
} from "../game/copilot";

interface AiCopilotProps {
  disabled?: boolean;
  onClose?: () => void;
  onAsk: (mode: CopilotMode, question?: string) => Promise<CopilotResponse>;
}

const modeOptions: Array<{ value: CopilotMode; label: string }> = [
  { value: "hint", label: "Hint" },
  { value: "review", label: "Review" },
  { value: "shortest_path", label: "Shortest route" },
  { value: "solve", label: "Solve" },
  { value: "next_step", label: "Next step" },
  { value: "explain", label: "Explain" }
];

export default function AiCopilot({ disabled, onAsk, onClose }: AiCopilotProps) {
  const [mode, setMode] = useState<CopilotMode>("hint");
  const [responseMode, setResponseMode] = useState<CopilotMode>("hint");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const askCopilot = async () => {
    setLoading(true);
    setError(null);
    const requestMode = mode;
    try {
      const nextResponse = await onAsk(requestMode, question.trim() || undefined);
      setResponseMode(requestMode);
      setResponse(nextResponse);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Copilot request failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ai-copilot" aria-label="AI Copilot">
      <div className="panel-heading copilot-heading">
        <span>
          <Bot size={15} />
          AI Copilot
        </span>
        <div className="copilot-heading-actions">
          <small>Gemma 4 26B</small>
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
            onChange={(event) => setMode(event.target.value as CopilotMode)}
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
        onChange={(event) => setQuestion(event.target.value)}
      />
      {error ? <p className="copilot-error">{error}</p> : null}
      {response ? (
        <div className={`copilot-answer risk-${response.riskLevel}`}>
          <p>{response.summary}</p>
          {response.hints.length > 0 ? (
            <ul className="copilot-hints">
              {response.hints.map((hint) => (
                <li key={`${hint.title}-${hint.detail}`}>
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
                {response.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {response.codeGuidance.length > 0 ? (
            responseMode === "solve" ? (
              <div className="copilot-code">
                <strong>Solution</strong>
                <pre>{response.codeGuidance.join("\n")}</pre>
              </div>
            ) : (
              <div className="copilot-list">
                <strong>Code</strong>
                <ul>
                  {response.codeGuidance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )
          ) : null}
          {response.suggestedBlocks.length > 0 ? (
            <div className="copilot-blocks">
              {response.suggestedBlocks.map((block) => (
                <span key={block}>{block}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
