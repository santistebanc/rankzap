import { useEffect, useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
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
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ranking.indexOf(String(active.id));
    const newIndex = ranking.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(ranking, oldIndex, newIndex));
  };

  const handleDragStart = () => onDragStateChange?.(true);
  const handleDragCancel = () => onDragStateChange?.(false);

  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        Waiting for options to be added…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-label="Drag to rank options">
          {ranking.map((id, index) => {
            const option = optionById.get(id);
            if (!option) return null;
            return <SortableRow key={id} option={option} index={index} />;
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ option, index }: { option: Option; index: number }) {
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
      className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 select-none ${
        isDragging ? "opacity-60 shadow-lg ring-2 ring-accent" : ""
      }`}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="flex-1 min-w-0 break-words">{option.text}</span>
      <button
        type="button"
        aria-label={`Drag handle for ${option.text}, currently rank ${index + 1}`}
        className="drag-handle shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-4" aria-hidden="true">
          <circle cx="6" cy="4" r="1.25" />
          <circle cx="10" cy="4" r="1.25" />
          <circle cx="6" cy="8" r="1.25" />
          <circle cx="10" cy="8" r="1.25" />
          <circle cx="6" cy="12" r="1.25" />
          <circle cx="10" cy="12" r="1.25" />
        </svg>
      </button>
    </li>
  );
}
