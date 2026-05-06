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
import type { Option } from "../lib/types";

interface ArrangeOptionsProps {
  options: Option[];
  ranking: string[];
  onChange: (next: string[]) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function ArrangeOptions({
  options,
  ranking,
  onChange,
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
      <p className="px-4 py-4 text-sm text-muted/70">Waiting for options to be added…</p>
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
        <ul className="flex flex-col" aria-label="Drag to rank options">
          {ranking.map((id, index) => {
            const option = optionById.get(id);
            if (!option) return null;
            return (
              <SortableRow
                key={id}
                option={option}
                displayRank={projectedRankById.get(id) ?? index + 1}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ option, displayRank }: { option: Option; displayRank: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative flex items-center gap-2 border-t border-border/20 px-4 py-2.5 first:border-t-0 touch-none select-none cursor-grab active:cursor-grabbing [&>*]:pointer-events-none ${
        isDragging ? "z-20 bg-surface-2 opacity-80 shadow-lg ring-1 ring-accent/40" : "hover:bg-surface-2/50"
      }`}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-accent"
        aria-hidden="true"
      >
        {displayRank}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-5 wrap-break-word">{option.text}</span>
      <span aria-hidden="true" className="drag-handle shrink-0 p-1 text-muted/50">
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4" aria-hidden="true">
          <circle cx="6" cy="4" r="1.25" />
          <circle cx="10" cy="4" r="1.25" />
          <circle cx="6" cy="8" r="1.25" />
          <circle cx="10" cy="8" r="1.25" />
          <circle cx="6" cy="12" r="1.25" />
          <circle cx="10" cy="12" r="1.25" />
        </svg>
      </span>
    </li>
  );
}
