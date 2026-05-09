import React, { DragEvent, useEffect, useMemo, useState } from "react";
import {
  Copy,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Wand2
} from "lucide-react";
import {
  blockDefinitions,
  cloneBlock,
  collectProcedureNames,
  CONDITION_OPTIONS,
  COUNTER_OPERATORS,
  createBlock
} from "../game/blocks";
import { ChildSlot, CounterOperator, ProgramBlock } from "../game/types";

type SlotKey = ChildSlot | "root";

interface DropTarget {
  parentId: string | null;
  slot: SlotKey;
  index: number;
}

type BlockLocation = DropTarget;

export interface PaletteAddRequest {
  id: number;
  block: ProgramBlock;
}

interface ProgramEditorProps {
  program: ProgramBlock[];
  activeBlockId?: string;
  onProgramChange: (program: ProgramBlock[]) => void;
  onLoadPracticeRoute: () => void;
  onClearProgram: () => void;
  paletteAddRequest?: PaletteAddRequest | null;
  onPaletteAddHandled?: (id: number) => void;
}

const parsePayload = (event: DragEvent) => {
  const raw = event.dataTransfer.getData("application/reactor-block");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as
      | { source: "palette"; type: string }
      | { source: "program"; blockId: string };
  } catch {
    return null;
  }
};

const insertAt = (
  items: ProgramBlock[],
  index: number,
  block: ProgramBlock
): ProgramBlock[] => [
  ...items.slice(0, Math.max(0, index)),
  block,
  ...items.slice(Math.max(0, index))
];

const findLocation = (
  blocks: ProgramBlock[],
  blockId: string,
  parentId: string | null = null,
  slot: SlotKey = "root"
): BlockLocation | null => {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.id === blockId) {
      return { parentId, slot, index };
    }
    for (const childSlot of Object.keys(block.children ?? {}) as ChildSlot[]) {
      const found = findLocation(
        block.children?.[childSlot] ?? [],
        blockId,
        block.id,
        childSlot
      );
      if (found) return found;
    }
  }
  return null;
};

const blockContains = (block: ProgramBlock, blockId: string): boolean =>
  Object.values(block.children ?? {}).some((children) =>
    (children ?? []).some((child) => child.id === blockId || blockContains(child, blockId))
  );

const findBlock = (blocks: ProgramBlock[], blockId: string): ProgramBlock | null => {
  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }
    for (const children of Object.values(block.children ?? {})) {
      const found = findBlock(children ?? [], blockId);
      if (found) return found;
    }
  }
  return null;
};

const removeBlock = (
  blocks: ProgramBlock[],
  blockId: string
): { blocks: ProgramBlock[]; removed?: ProgramBlock } => {
  let removed: ProgramBlock | undefined;
  const next = blocks
    .map((block) => {
      if (block.id === blockId) {
        removed = block;
        return null;
      }
      const children = block.children
        ? Object.fromEntries(
            Object.entries(block.children).map(([slot, childBlocks]) => {
              const result = removeBlock(childBlocks ?? [], blockId);
              if (result.removed) {
                removed = result.removed;
              }
              return [slot, result.blocks];
            })
          )
        : undefined;
      return {
        ...block,
        children
      };
    })
    .filter(Boolean) as ProgramBlock[];

  return { blocks: next, removed };
};

const insertBlock = (
  blocks: ProgramBlock[],
  target: DropTarget,
  block: ProgramBlock
): ProgramBlock[] => {
  if (target.parentId === null) {
    return insertAt(blocks, target.index, block);
  }

  return blocks.map((item) => {
    if (item.id === target.parentId) {
      const children = { ...(item.children ?? {}) };
      const list = children[target.slot as ChildSlot] ?? [];
      children[target.slot as ChildSlot] = insertAt(list, target.index, block);
      return { ...item, children };
    }

    if (!item.children) {
      return item;
    }

    return {
      ...item,
      children: Object.fromEntries(
        Object.entries(item.children).map(([slot, childBlocks]) => [
          slot,
          insertBlock(childBlocks ?? [], target, block)
        ])
      )
    };
  });
};

const updateBlock = (
  blocks: ProgramBlock[],
  blockId: string,
  updater: (block: ProgramBlock) => ProgramBlock
): ProgramBlock[] =>
  blocks.map((block) => {
    if (block.id === blockId) {
      return updater(block);
    }
    if (!block.children) {
      return block;
    }
    return {
      ...block,
      children: Object.fromEntries(
        Object.entries(block.children).map(([slot, childBlocks]) => [
          slot,
          updateBlock(childBlocks ?? [], blockId, updater)
        ])
      )
    };
  });

const moveWithinList = (
  blocks: ProgramBlock[],
  blockId: string,
  delta: number
): ProgramBlock[] => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) {
      return blocks;
    }
    const copy = [...blocks];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  }

  return blocks.map((block) => ({
    ...block,
    children: block.children
      ? Object.fromEntries(
          Object.entries(block.children).map(([slot, childBlocks]) => [
            slot,
            moveWithinList(childBlocks ?? [], blockId, delta)
          ])
        )
      : undefined
  }));
};

function DropSlot({
  target,
  selected,
  onDropBlock,
  onSelect
}: {
  target: DropTarget;
  selected: boolean;
  onDropBlock: (target: DropTarget, event: DragEvent) => void;
  onSelect: (target: DropTarget) => void;
}) {
  return (
    <div
      className={`drop-slot ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      title="Set click-to-add insertion point"
      onClick={() => onSelect(target)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(target);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => onDropBlock(target, event)}
    >
      <span>Drop here</span>
    </div>
  );
}

function ParamEditor({
  block,
  procedureNames,
  onUpdate
}: {
  block: ProgramBlock;
  procedureNames: string[];
  onUpdate: (params: ProgramBlock["params"]) => void;
}) {
  const update = (key: string, value: string | number) =>
    onUpdate({ ...block.params, [key]: value });
  const condition = String(block.params.condition ?? "wall_ahead");

  if (block.type === "repeat") {
    return (
      <label className="param-row">
        Count
        <input
          type="number"
          min={0}
          max={99}
          value={Number(block.params.count ?? 1)}
          onChange={(event) => update("count", Number(event.target.value))}
        />
      </label>
    );
  }

  if (block.type === "if" || block.type === "ifElse" || block.type === "while") {
    return (
      <div className="param-row multi">
        <label>
          Condition
          <select
            value={condition}
            onChange={(event) => update("condition", event.target.value)}
          >
            {CONDITION_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {condition === "radiation_level_gt" ? (
          <label>
            Value
            <input
              type="number"
              value={Number(block.params.threshold ?? 80)}
              onChange={(event) => update("threshold", Number(event.target.value))}
            />
          </label>
        ) : null}
        {condition === "counter_compare" ? (
          <>
            <label>
              Op
              <select
                value={String(block.params.operator ?? "<")}
                onChange={(event) => update("operator", event.target.value)}
              >
                {COUNTER_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                value={Number(block.params.counterValue ?? 3)}
                onChange={(event) =>
                  update("counterValue", Number(event.target.value))
                }
              />
            </label>
          </>
        ) : null}
      </div>
    );
  }

  if (block.type === "ifCounter") {
    return (
      <div className="param-row multi">
        <label>
          Op
          <select
            value={String(block.params.operator ?? "<")}
            onChange={(event) => update("operator", event.target.value)}
          >
            {COUNTER_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value
          <input
            type="number"
            value={Number(block.params.counterValue ?? 3)}
            onChange={(event) => update("counterValue", Number(event.target.value))}
          />
        </label>
      </div>
    );
  }

  if (block.type === "setCounter" || block.type === "increaseCounter") {
    const key = block.type === "setCounter" ? "value" : "amount";
    return (
      <label className="param-row">
        Number
        <input
          type="number"
          value={Number(block.params[key] ?? 0)}
          onChange={(event) => update(key, Number(event.target.value))}
        />
      </label>
    );
  }

  if (block.type === "defineProcedure" || block.type === "callProcedure") {
    return (
      <label className="param-row">
        Name
        <input
          list="procedure-names"
          value={String(block.params.name ?? "routine_a")}
          onChange={(event) => update("name", event.target.value)}
        />
        <datalist id="procedure-names">
          {procedureNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
    );
  }

  return null;
}

export default function ProgramEditor({
  program,
  activeBlockId,
  onProgramChange,
  onLoadPracticeRoute,
  onClearProgram,
  paletteAddRequest,
  onPaletteAddHandled
}: ProgramEditorProps) {
  const procedureNames = useMemo(() => collectProcedureNames(program), [program]);
  const [selectedTarget, setSelectedTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    if (!paletteAddRequest) {
      return;
    }

    const target =
      selectedTarget?.parentId && !findBlock(program, selectedTarget.parentId)
        ? { parentId: null, slot: "root" as const, index: program.length }
        : selectedTarget ?? { parentId: null, slot: "root" as const, index: program.length };

    onProgramChange(insertBlock(program, target, paletteAddRequest.block));
    if (selectedTarget) {
      setSelectedTarget({ ...target, index: target.index + 1 });
    }
    onPaletteAddHandled?.(paletteAddRequest.id);
  }, [onPaletteAddHandled, onProgramChange, paletteAddRequest, program, selectedTarget]);

  const handleDrop = (target: DropTarget, event: DragEvent) => {
    event.preventDefault();
    const payload = parsePayload(event);
    if (!payload) {
      return;
    }

    if (payload.source === "palette") {
      onProgramChange(insertBlock(program, target, createBlock(payload.type)));
      return;
    }

    const dragged = findBlock(program, payload.blockId);
    if (!dragged) {
      return;
    }

    if (target.parentId === payload.blockId || blockContains(dragged, target.parentId ?? "")) {
      return;
    }

    const origin = findLocation(program, payload.blockId);
    const removed = removeBlock(program, payload.blockId);
    if (!removed.removed) {
      return;
    }

    const adjustedTarget = { ...target };
    if (
      origin &&
      origin.parentId === target.parentId &&
      origin.slot === target.slot &&
      origin.index < target.index
    ) {
      adjustedTarget.index -= 1;
    }

    onProgramChange(insertBlock(removed.blocks, adjustedTarget, removed.removed));
  };

  const remove = (blockId: string) => {
    onProgramChange(removeBlock(program, blockId).blocks);
  };

  const duplicate = (blockId: string) => {
    const source = findBlock(program, blockId);
    const location = findLocation(program, blockId);
    if (!source || !location) {
      return;
    }
    onProgramChange(
      insertBlock(program, { ...location, index: location.index + 1 }, cloneBlock(source))
    );
  };

  const renderList = (
    blocks: ProgramBlock[],
    parentId: string | null,
    slot: SlotKey
  ): React.ReactNode => (
    <div className={`program-list ${slot !== "root" ? "nested" : ""}`}>
      {blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          <DropSlot
            target={{ parentId, slot, index }}
            selected={
              selectedTarget?.parentId === parentId &&
              selectedTarget.slot === slot &&
              selectedTarget.index === index
            }
            onDropBlock={handleDrop}
            onSelect={setSelectedTarget}
          />
          {renderBlock(block)}
        </React.Fragment>
      ))}
      <DropSlot
        target={{ parentId, slot, index: blocks.length }}
        selected={
          selectedTarget?.parentId === parentId &&
          selectedTarget.slot === slot &&
          selectedTarget.index === blocks.length
        }
        onDropBlock={handleDrop}
        onSelect={setSelectedTarget}
      />
    </div>
  );

  const renderBlock = (block: ProgramBlock): React.ReactNode => {
    const definition = blockDefinitions[block.type];
    const isActive = block.id === activeBlockId;

    return (
      <article
        className={`program-block ${definition?.category ?? "unknown"} ${
          isActive ? "active" : ""
        }`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/reactor-block",
            JSON.stringify({ source: "program", blockId: block.id })
          );
        }}
      >
        <div className="block-main">
          <GripVertical size={16} className="drag-grip" aria-hidden />
          <span className="block-icon">{definition?.icon ?? "?"}</span>
          <div className="block-title">
            <strong>{definition?.label ?? block.type}</strong>
            <small>{definition?.description}</small>
          </div>
          <div className="block-actions">
            <button
              type="button"
              title="Move up"
              onClick={() => onProgramChange(moveWithinList(program, block.id, -1))}
            >
              <ChevronUp size={15} />
            </button>
            <button
              type="button"
              title="Move down"
              onClick={() => onProgramChange(moveWithinList(program, block.id, 1))}
            >
              <ChevronDown size={15} />
            </button>
            <button type="button" title="Duplicate block" onClick={() => duplicate(block.id)}>
              <Copy size={15} />
            </button>
            <button type="button" title="Remove block" onClick={() => remove(block.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <ParamEditor
          block={block}
          procedureNames={procedureNames}
          onUpdate={(params) =>
            onProgramChange(
              updateBlock(program, block.id, (item) => ({
                ...item,
                params
              }))
            )
          }
        />
        {definition?.childSlots?.map((childSlot) => (
          <div key={childSlot} className="child-zone">
            <div className="child-zone-title">
              {childSlot === "elseBody"
                ? "Else"
                : childSlot === "procedureBody"
                  ? "Procedure body"
                  : "Then / body"}
            </div>
            {renderList(block.children?.[childSlot] ?? [], block.id, childSlot)}
          </div>
        ))}
      </article>
    );
  };

  return (
    <section className="program-editor">
      <div className="panel-heading">
        <span>Command List</span>
        <div className="editor-actions">
          <button type="button" onClick={onLoadPracticeRoute}>
            <Wand2 size={14} />
            Practice route
          </button>
          <button type="button" onClick={onClearProgram}>
            Clear
          </button>
        </div>
      </div>
      {renderList(program, null, "root")}
    </section>
  );
}
