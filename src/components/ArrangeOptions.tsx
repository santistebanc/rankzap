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
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Option } from "../lib/types";
import { adaptiveSize } from "../lib/adaptiveSize";
import { RankCircle } from "./RankCircle";

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
      <p className="px-4 py-3 text-sm text-muted/70">Waiting for options to be added…</p>
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
          className="flex flex-col"
          aria-label={reorderingDisabled ? "Your ranked options" : "Drag to rank options"}
        >
          {ranking.map((id, index) => {
            const option = optionById.get(id);
            if (!option) return null;
            return (
              <SortableRow
                key={id}
                option={option}
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

function SortableRow({
  option,
  displayRank,
  reorderingDisabled,
}: {
  option: Option;
  displayRank: number;
  reorderingDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: reorderingDisabled,
  });

  const dragTransform = CSS.Transform.toString(transform);
  const style: React.CSSProperties = reorderingDisabled
    ? {}
    : {
        transform: isDragging
          ? `${dragTransform ?? ""} rotate(-1.5deg)`.trim()
          : dragTransform ?? undefined,
        transition,
      };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(reorderingDisabled ? {} : listeners)}
      className={`group relative flex items-center gap-2 overflow-hidden border-b border-dashed border-border/50 px-4 py-3 last:border-b-0 ${
        reorderingDisabled
          ? ""
          : "touch-none select-none cursor-grab active:cursor-grabbing"
      } ${isDragging ? "z-20 rounded-lg ring-2 ring-inset ring-accent bg-surface shadow-lg" : "hover:bg-surface-2/40"}`}
      aria-label={`${option.text}, rank ${displayRank}`}
    >
      <div
        className={`relative flex w-full min-w-0 items-center gap-2 ${reorderingDisabled ? "" : "*:pointer-events-none"}`}
      >
        <RankCircle n={displayRank} size={28} />
        <span style={{ fontSize: adaptiveSize(option.text, 14, 18, 20, 80) }} className="min-w-0 flex-1 leading-5 wrap-break-word">{option.text}</span>
        {reorderingDisabled ? (
          <span aria-hidden="true" className="size-6 shrink-0 p-1" />
        ) : (
          <span aria-hidden="true" className="drag-handle shrink-0 p-1 text-muted/50">
            <GripVertical className="size-4" strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>
    </li>
  );
}
