import React, {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";

export type CliAction = "forward" | "left" | "right" | "foam";

export interface CliCommand {
  action: CliAction;
  repeat: number;
}

type TerminalLineKind = "boot" | "input" | "output" | "error";

interface CommandTerminalProps {
  onExecuteCommand: (commands: CliCommand[]) => string[];
}

interface TerminalLine {
  id: number;
  kind: TerminalLineKind;
  text: string;
}

const BOOT_LINES = [
  "REACTOR LOGIC CLI READY",
  "+----------+----------------------+----------------+",
  "| Command  | Example              | Result         |",
  "+----------+----------------------+----------------+",
  "| move     | forward              | move 1 tile    |",
  "| turn     | left / right         | rotate robot   |",
  "| foam     | foam                 | seal hotspot   |",
  "| loop     | loop forward 4       | repeat command |",
  "| batch    | forward; right; foam | run sequence   |",
  "+----------+----------------------+----------------+"
];

const HELP_LINES = [
  "+-------------------------+--------------------------------+",
  "| Syntax                  | Meaning                        |",
  "+-------------------------+--------------------------------+",
  "| forward                 | move one tile                  |",
  "| left / right            | turn the robot                 |",
  "| foam                    | deploy stabilizing foam        |",
  "| loop forward 4          | repeat forward four times      |",
  "| forward; right; foam    | run commands in order          |",
  "+-------------------------+--------------------------------+"
];

const MAX_LOOP_COUNT = 99;
const MAX_BATCH_COMMANDS = 24;
const COMMAND_USAGE = "use: forward, left, right, foam, loop forward 4";

type ParsedCommand =
  | { ok: true; command: CliCommand }
  | { ok: false; error: string };

type ParsedCommandBatch =
  | { ok: true; commands: CliCommand[] }
  | { ok: false; error: string };

const parseAction = (value: string): CliAction | null => {
  if (value === "forward") return "forward";
  if (value === "left") return "left";
  if (value === "right") return "right";
  if (value === "foam") return "foam";
  return null;
};

const parseCommandSegment = (value: string): ParsedCommand => {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const action = parseAction(parts[0]);
    return action
      ? { ok: true, command: { action, repeat: 1 } }
      : { ok: false, error: `unknown command. ${COMMAND_USAGE}` };
  }

  if (parts[0] !== "loop") {
    return { ok: false, error: `unknown command. ${COMMAND_USAGE}` };
  }

  if (parts.length !== 3) {
    return {
      ok: false,
      error: "loop format: loop <forward|left|right|foam> <count>"
    };
  }

  const action = parseAction(parts[1]);
  if (!action) {
    return {
      ok: false,
      error: "loop command must be one of: forward, left, right, foam"
    };
  }

  const repeat = Number(parts[2]);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_LOOP_COUNT) {
    return {
      ok: false,
      error: `loop count must be a whole number from 1 to ${MAX_LOOP_COUNT}`
    };
  }

  return { ok: true, command: { action, repeat } };
};

const parseCommands = (value: string): ParsedCommandBatch => {
  const segments = value
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { ok: false, error: `empty command. ${COMMAND_USAGE}` };
  }

  if (segments.length > MAX_BATCH_COMMANDS) {
    return {
      ok: false,
      error: `enter ${MAX_BATCH_COMMANDS} or fewer commands at a time`
    };
  }

  const commands: CliCommand[] = [];
  for (const [index, segment] of segments.entries()) {
    const parsed = parseCommandSegment(segment);
    if (!parsed.ok) {
      return {
        ok: false,
        error:
          segments.length > 1
            ? `command ${index + 1}: ${parsed.error}`
            : parsed.error
      };
    }
    commands.push(parsed.command);
  }

  return { ok: true, commands };
};

export default function CommandTerminal({
  onExecuteCommand
}: CommandTerminalProps) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>(() =>
    BOOT_LINES.map((text, index) => ({ id: index + 1, kind: "boot", text }))
  );
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const lineIdRef = useRef(BOOT_LINES.length + 1);
  const commandHistoryRef = useRef<string[]>([]);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight
    });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const appendLines = (kind: TerminalLineKind, nextLines: string[]) => {
    setLines((current) => [
      ...current,
      ...nextLines.map((text) => ({
        id: lineIdRef.current++,
        kind,
        text
      }))
    ]);
  };

  const executeInput = (rawCommand: string) => {
    const commandText = rawCommand.trim();
    if (!commandText) return;

    appendLines("input", [`> ${commandText}`]);
    commandHistoryRef.current = [
      commandText,
      ...commandHistoryRef.current.filter((item) => item !== commandText)
    ].slice(0, 12);
    setHistoryIndex(null);

    const lower = commandText.toLowerCase();
    if (lower === "help" || lower === "?") {
      appendLines("output", HELP_LINES);
      return;
    }

    if (lower === "cls" || lower === "clear") {
      setLines(
        BOOT_LINES.map((text) => ({
          id: lineIdRef.current++,
          kind: "boot",
          text
        }))
      );
      return;
    }

    const parsed = parseCommands(commandText);
    if (!parsed.ok) {
      appendLines("error", [parsed.error]);
      return;
    }

    appendLines("output", onExecuteCommand(parsed.commands));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    executeInput(input);
    setInput("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    const history = commandHistoryRef.current;
    if (history.length === 0) return;

    event.preventDefault();
    if (event.key === "ArrowUp") {
      const nextIndex =
        historyIndex === null ? 0 : Math.min(history.length - 1, historyIndex + 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
      return;
    }

    if (historyIndex === null || historyIndex <= 0) {
      setHistoryIndex(null);
      setInput("");
      return;
    }

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setInput(history[nextIndex]);
  };

  return (
    <div className="command-terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-output" ref={outputRef} aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className={`terminal-line ${line.kind}`}>
            {line.text}
          </div>
        ))}
      </div>
      <form className="terminal-input-row" onSubmit={handleSubmit}>
        <span className="terminal-prompt">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Command line input"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </form>
    </div>
  );
}
