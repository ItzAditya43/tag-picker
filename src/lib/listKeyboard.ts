import type { KeyboardCoordinateGetter, UniqueIdentifier } from "@dnd-kit/core";

const EARLIER = new Set(["ArrowLeft", "ArrowUp"]);
const LATER = new Set(["ArrowRight", "ArrowDown"]);

/**
 * Keyboard moves for a wrapped list of tags: ← / ↑ move one place earlier, → / ↓ one place later.
 *
 * dnd-kit's default looks for the nearest item in the arrow's direction on screen. With tags of
 * different widths wrapping over several rows, "nearest to the left" can be a tag on another row,
 * so one ← could jump to the end of the list. Moving by list position is what people expect.
 *
 * Returns where the dragged tag should go: centred on the neighbour, so `closestCenter` picks it.
 */
export const listOrderCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = EARLIER.has(event.code) ? -1 : LATER.has(event.code) ? 1 : 0;
  if (!step) return undefined;
  event.preventDefault(); // arrows move the tag, not the page

  const { active, over, collisionRect, droppableRects } = context;
  if (!active || !collisionRect) return undefined;
  const items: UniqueIdentifier[] = active.data.current?.sortable?.items ?? [];
  const from = items.indexOf(over?.id ?? active.id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= items.length) return undefined; // already first / last

  const target = droppableRects.get(items[to]);
  if (!target) return undefined;
  return {
    x: target.left + target.width / 2 - collisionRect.width / 2,
    y: target.top + target.height / 2 - collisionRect.height / 2,
  };
};
