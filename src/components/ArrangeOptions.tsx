import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
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
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  // Reconcile ranking with current option set: keep known ids in current order,
  // append new options to the bottom, drop missing ones.
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
      <div className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        Waiting for options to be added…
      </div>
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
        <ul className="flex flex-col gap-3" aria-label="Drag to rank options">
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

function SortableRow({
  option,
  displayRank,
}: {
  option: Option;
  displayRank: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative flex cursor-grab touch-none select-none items-center gap-3 border border-border bg-surface px-3 py-2.5 active:cursor-grabbing [&>*]:pointer-events-none ${
        isDragging ? "z-20 opacity-70 shadow-lg ring-2 ring-accent" : ""
      }`}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tabular-nums text-accent"
        aria-hidden="true"
      >
        {displayRank}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium leading-5 wrap-break-word">
        {option.text}
      </span>
      <span
        aria-hidden="true"
        className="drag-handle min-h-9 min-w-9 shrink-0 p-1.5 text-muted"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="mx-auto size-5" aria-hidden="true">
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
