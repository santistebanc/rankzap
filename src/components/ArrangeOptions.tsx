import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { Option } from "../lib/types";
import { adaptiveSize } from "../lib/adaptiveSize";
import { Punch } from "./Punch";

interface ArrangeOptionsProps {
  options: Option[];
  ranking: string[];
  onChange: (next: string[]) => void;
  /** When true, ranking is read-only (no drag-and-drop). */
  reorderingDisabled?: boolean;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function ArrangeOptions({
  options,
  ranking,
  onChange,
  reorderingDisabled = false,
  onDragStateChange,
}: ArrangeOptionsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  useEffect(() => {
    const known = new Set(options.map((o) => o.id));
    const cleaned = ranking.filter((id) => known.has(id));
    const missing = options.filter((o) => !ranking.includes(o.id)).map((o) => o.id);
    if (cleaned.length !== ranking.length || missing.length > 0) {
      onChange([...cleaned, ...missing]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const handleDragEnd = (e: DragEndEvent) => {
    onDragStateChange?.(false);
    setActiveId(null);
    setOverId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ranking.indexOf(String(active.id));
    const newIndex = ranking.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(ranking, oldIndex, newIndex));
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    onDragStateChange?.(true);
  };
  const handleDragOver = (e: DragOverEvent) => {
    if (!e.over) return;
    setOverId(String(e.over.id));
  };
  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
    onDragStateChange?.(false);
  };

  const projectedRanking = useMemo(() => {
    if (!activeId || !overId || activeId === overId) return ranking;
    const oldIndex = ranking.indexOf(activeId);
    const newIndex = ranking.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return ranking;
    return arrayMove(ranking, oldIndex, newIndex);
  }, [activeId, overId, ranking]);

  const projectedRankById = useMemo(() => {
    const map = new Map<string, number>();
    projectedRanking.forEach((id, index) => map.set(id, index + 1));
    return map;
  }, [projectedRanking]);

  if (options.length === 0) {
    return (
      <p className="bg-low px-4 py-5 text-base font-semibold text-low-ink">Waiting for options to be added…</p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
        <ul
          className="grid gap-1"
          aria-label={reorderingDisabled ? "Your ranked options" : "Drag to rank options"}
        >
          {ranking.map((id, index) => {
            const option = optionById.get(id);
            if (!option) return null;
            return (
              <SortableRow
                key={id}
                option={option}
                slot={index}
                displayRank={projectedRankById.get(id) ?? index + 1}
                reorderingDisabled={reorderingDisabled}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * The staircase: rows shrink down the list (108 → 84 → 70 → 58px) and the
 * top place is filled black. Height follows the row's slot in the saved
 * ranking, so rows don't resize mid-drag and confuse dnd-kit's measurements;
 * colour and number follow the projected rank, so they update live.
 */
const SLOTS = [
  { height: 108, label: 34 },
  { height: 84, label: 28 },
  { height: 70, label: 25 },
] as const;
const BASE_SLOT = { height: 58, label: 22 };

function placeTone(rank: number): string {
  if (rank === 1) return "bg-hi text-hi-ink";
  if (rank <= 3) return "bg-step text-step-ink";
  return "bg-low text-low-ink";
}

function SortableRow({
  option,
  slot,
  displayRank,
  reorderingDisabled,
}: {
  option: Option;
  slot: number;
  displayRank: number;
  reorderingDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: reorderingDisabled,
  });

  const size = SLOTS[slot] ?? BASE_SLOT;
  const dragTransform = transform
    ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
    : undefined;
  const style: React.CSSProperties = {
    minHeight: size.height,
    ...(reorderingDisabled
      ? {}
      : {
          transform: isDragging ? `${dragTransform ?? ""} scale(1.03)`.trim() : dragTransform,
          transition,
        }),
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(reorderingDisabled ? {} : listeners)}
      className={`relative grid grid-cols-[74px_1fr_auto] items-center outline-offset-[-4px] transition-colors duration-150 ${placeTone(displayRank)} ${
        reorderingDisabled ? "" : "touch-none select-none cursor-grab active:cursor-grabbing"
      } ${isDragging ? "z-20 shadow-[8px_8px_0_#0b0b0b]" : ""}`}
      aria-label={`${option.text}, rank ${displayRank}`}
    >
      <span
        aria-hidden="true"
        className="display text-center leading-none tabular-nums"
        style={{ fontSize: Math.round(size.height * 0.86) }}
      >
        <Punch value={displayRank}>{displayRank}</Punch>
      </span>
      <span
        style={{ fontSize: adaptiveSize(option.text, 17, size.label, 20, 80), fontStretch: "75%" }}
        className="min-w-0 py-2 pr-2 font-extrabold leading-[0.95] uppercase wrap-break-word"
      >
        {option.text}
      </span>
      {reorderingDisabled ? (
        <span aria-hidden="true" className="w-3" />
      ) : (
        <span aria-hidden="true" className="drag-handle pr-3 opacity-50">
          <GripVertical className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
      )}
    </li>
  );
}
