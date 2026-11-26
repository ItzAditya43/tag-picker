import { GripVertical, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "./lib/cn";

/** True when the person asked their system for less motion. Read once; it rarely changes mid-session. */
const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One selected tag. Two controls side by side: the label is the drag handle (mouse, touch, or
 * Space + arrow keys), the × removes the tag. Kept separate so Enter on × never starts a drag.
 */
export function SortableChip({ id, label, marked, onRemove }: {
  id: string;
  label: string;
  /** Marked for removal by the first Backspace. */
  marked: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, transition: reducedMotion ? null : undefined });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group inline-flex items-center rounded-full border border-primary/30 bg-primary-soft text-sm font-medium text-primary",
        marked && "ring-2 ring-danger",
        isDragging && "relative z-10 shadow-lg ring-2 ring-primary",
      )}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex min-h-9 cursor-grab touch-manipulation items-center gap-1 rounded-full py-1 pl-1.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing sm:min-h-0"
      >
        <GripVertical className="h-3.5 w-3.5 text-primary/40 group-hover:text-primary/70" aria-hidden />
        {label}
      </span>
      <button
        type="button"
        data-remove={id}
        onClick={(event) => { event.stopPropagation(); onRemove(); }}
        aria-label={`Remove ${label}`}
        className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-primary/70 hover:bg-primary/10 hover:text-primary"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
