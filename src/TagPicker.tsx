import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDownAZ, Check, Plus, Search, Undo2 } from "lucide-react";
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "./lib/cn";
import { SortableChip } from "./SortableChip";
import { listOrderCoordinates } from "./lib/listKeyboard";
import {
  buildSuggestions, describePlan, moveItem, planAdditions, recommendTags, splitTagList, tagCharCount, tagSlug,
  type Suggestion, type TagOption, type TagRecommendations,
} from "./lib/tags";

type Option = string | TagOption;

function optionShape(option: Option): TagOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

/** Bold the parts of `label` that match what was typed, so people see why it matched. */
function highlight(label: string, query: string): ReactNode {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return label;
  const parts = label.split(new RegExp(`(${tokens.join("|")})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-sm bg-transparent font-semibold text-foreground">{part}</mark> : part,
  );
}

/** How long a notice ("Removed X. Undo") stays up, unless the pointer or focus is on it. */
const NOTICE_MS = 6000;

/** A message under the box. `undoTo` is the list to go back to, if the action can be undone. */
type Notice = { text: string; tone: "info" | "error"; undoTo?: string[] };

export function TagPicker({
  options,
  searchOptions = [],
  name,
  value,
  defaultValue = [],
  onChange,
  allowCustom = false,
  maxTagLength = 30,
  maxChars,
  recommendations,
  inputPlaceholder = "Search or type a skill, comma for several…",
  className,
}: {
  /** Tags always shown in the list under the box. */
  options: readonly Option[];
  /** Extra tags that only appear while typing (too many to show all the time). */
  searchOptions?: readonly Option[];
  /** Form field name. The value is submitted as one comma-separated string, in the order shown. */
  name?: string;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  /** Let people add tags that are not in the lists. */
  allowCustom?: boolean;
  maxTagLength?: number;
  /** Total characters across all selected tags. Omit for no limit. */
  maxChars?: number;
  /** Data for the "Others also tag" row. Omit for no row. */
  recommendations?: TagRecommendations;
  inputPlaceholder?: string;
  className?: string;
}) {
  const opts = options.map(optionShape);
  // Search covers both lists, without repeats.
  const more: TagOption[] = (() => {
    const seen = new Set(opts.map((option) => tagSlug(option.value)));
    return searchOptions.map(optionShape).filter((option) => {
      const slug = tagSlug(option.value);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
  })();
  const searchable = [...opts, ...more];

  const [internal, setInternal] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  // Keyboard highlight in the suggestions. null = the default (see buildSuggestions' autoActive).
  const [active, setActive] = useState<number | null>(null);
  // Backspace on an empty box first marks the last tag; a second press removes it.
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // True while the pointer or keyboard focus is on the notice: it must not vanish under someone reading or using it.
  const [noticeHeld, setNoticeHeld] = useState(false);
  // Read out by screen readers. The flip makes a repeated message ("Added React" twice) be read again.
  const [announce, setAnnounce] = useState({ text: "", flip: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Where keyboard focus should go after the next render, when the focused button is about to disappear.
  const [focusAfter, setFocusAfter] = useState<{ removeAt: number } | "input" | null>(null);
  const listboxId = useId();
  const statusId = useId();
  const selected = value ?? internal;

  useEffect(() => {
    if (!notice || noticeHeld) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeHeld]);

  // Removing a tag with × (or sorting) deletes the button that had focus. Without this, focus falls back to
  // the top of the page and a keyboard user has to tab all the way back.
  useEffect(() => {
    if (!focusAfter) return;
    const removeButtons = boxRef.current?.querySelectorAll<HTMLButtonElement>("[data-remove]") ?? [];
    const next = focusAfter === "input" ? null : removeButtons[Math.min(focusAfter.removeAt, removeButtons.length - 1)];
    (next ?? inputRef.current)?.focus();
    setFocusAfter(null);
  }, [focusAfter]);

  const say = (text: string) => setAnnounce((a) => ({ text, flip: !a.flip }));
  const labelFor = (tag: string) => searchable.find((option) => option.value === tag)?.label ?? tag;
  const sizeOf = (tag: string) => labelFor(tag).length;
  const has = (tag: string) => selected.some((item) => tagSlug(item) === tagSlug(tag));

  /** Save a new list, in the order given. Adding goes through `addItems`, which applies the limit. */
  const commit = (tags: string[]) => {
    const seen = new Set<string>();
    const unique = tags.filter((tag) => {
      const slug = tagSlug(tag);
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    if (value === undefined) setInternal(unique);
    onChange?.(unique);
  };

  /** Add one or more tags at the end, and say what happened to each. */
  const addItems = (items: string[]) => {
    if (!items.length) return;
    const plan = planAdditions(items, selected, searchable, {
      allowCustom, maxTagLength, budget: maxChars ?? Infinity, sizeOf,
    });
    if (plan.added.length) commit([...selected, ...plan.added]);
    const refused = plan.tooBig.length + plan.rejected.length;

    if (items.length === 1) {
      // One tag: the chip appearing says enough on screen; only refusals need words.
      if (plan.added.length) { setNotice(null); say(`Added ${labelFor(plan.added[0])}`); }
      else if (plan.tooBig.length) {
        const text = `“${labelFor(plan.tooBig[0])}” doesn't fit. Remove a tag to make room.`;
        setNotice({ text, tone: "error" }); say(text);
      } else if (plan.rejected.length) {
        const text = `“${plan.rejected[0]}” isn't in the list.`;
        setNotice({ text, tone: "error" }); say(text);
      } else say(`${labelFor(plan.duplicates[0])} is already added`);
      return;
    }
    // Several at once (pasted, or typed with commas): one summary line instead of one message per tag.
    const text = describePlan(plan, labelFor);
    setNotice({ text, tone: refused ? "error" : "info", undoTo: plan.added.length > 1 ? selected : undefined });
    say(text);
  };

  const remove = (tag: string) => {
    const before = selected;
    commit(selected.filter((item) => tagSlug(item) !== tagSlug(tag)));
    setNotice({ text: `Removed “${labelFor(tag)}”.`, tone: "info", undoTo: before });
    say(`Removed ${labelFor(tag)}. Undo is available`);
    setArmed(false);
  };
  const toggle = (tag: string) => has(tag) ? remove(tag) : addItems([tag]);

  const addDraft = (raw: string) => {
    setDraft("");
    setActive(null);
    addItems(splitTagList(raw));
  };

  // Only the last comma-separated part drives the suggestions.
  const lastPart = (draft.split(",").at(-1) ?? "").trim();
  const q = lastPart.toLowerCase();
  const { groups, flat, autoActive } = buildSuggestions({
    query: lastPart, catalog: opts, more, isSelected: has, allowCustom, maxTagLength,
  });
  const activeIndex = active ?? autoActive;

  const charCount = tagCharCount(selected, sizeOf);
  const atLimit = maxChars !== undefined && charCount >= maxChars;
  // Never recommend a tag that would not fit.
  const room = maxChars === undefined ? Infinity : maxChars - charCount;
  const fits = (label: string) => label.length <= room;
  const recommended = recommendations
    ? recommendTags(selected, recommendations).filter((tag) => fits(labelFor(tag)))
    : [];

  const open = focused && Boolean(q);
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Drag to reorder: mouse after 5px of movement (so clicks still click), touch after a short press
  // (so the page still scrolls), keyboard with Space then arrow keys (one place per press, see listKeyboard.ts).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: listOrderCoordinates }),
  );
  const position = (id: unknown) => `position ${selected.indexOf(String(id)) + 1} of ${selected.length}`;
  // dnd-kit also reports "over" for the tag's own spot right after pick-up, and again when nothing moved.
  // Speaking those would cut off "Picked up…" mid-sentence, so only a real change of position is announced.
  const lastOver = useRef<unknown>(null);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastOver.current = active.id;
      return `Picked up ${labelFor(String(active.id))}, ${position(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastOver.current) return undefined;
      lastOver.current = over.id;
      return `${labelFor(String(active.id))} is over ${position(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => over
      ? `${labelFor(String(active.id))} dropped at ${position(over.id)}.`
      : `${labelFor(String(active.id))} dropped.`,
    onDragCancel: ({ active }) => `Moving cancelled. ${labelFor(String(active.id))} stays at ${position(active.id)}.`,
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commit(moveItem(selected, selected.indexOf(String(active.id)), selected.indexOf(String(over.id))));
  };

  const sortedAZ = [...selected].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b), "en", { sensitivity: "base", numeric: true }));
  const isSorted = sortedAZ.every((tag, i) => tag === selected[i]);
  const sortAZ = () => {
    const before = selected;
    commit(sortedAZ);
    setFocusAfter("input");
    setNotice({ text: "Sorted A–Z.", tone: "info", undoTo: before });
    say("Sorted A to Z. Undo is available");
  };

  // One pill for the list and the search results, so they look the same.
  const pill = (
    key: string,
    content: ReactNode,
    { on, onClick, tabIndex, role, id, isActive, disabled, title }: {
      on: boolean;
      onClick: () => void;
      tabIndex?: number;
      role?: "option";
      id?: string;
      isActive?: boolean;
      disabled?: boolean;
      title?: string;
    },
  ) => (
    <button
      key={key}
      id={id}
      type="button"
      tabIndex={tabIndex}
      role={role}
      title={title}
      aria-selected={role === "option" ? Boolean(isActive) : undefined}
      aria-pressed={role === "option" ? undefined : on}
      aria-disabled={disabled || undefined}
      onMouseDown={role === "option" ? (event) => event.preventDefault() : undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        // min-h-9 / sm:min-h-0: comfortable touch target on phones, compact with a mouse.
        "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors sm:min-h-0",
        on
          ? "border-primary/40 bg-primary-soft font-medium text-primary"
          : "border-border bg-surface text-muted hover:bg-surface-2",
        isActive && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
        disabled && "cursor-not-allowed opacity-45 hover:bg-surface",
      )}
    >
      {content}
      {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5 text-muted-2" aria-hidden />}
    </button>
  );

  const choose = (item: Suggestion) => {
    const entries = draft.split(",");
    entries[entries.length - 1] = item.kind === "option" ? item.option.label : item.label;
    addDraft(entries.join(","));
    inputRef.current?.focus();
  };

  const percent = maxChars ? Math.min(100, (charCount / maxChars) * 100) : 0;
  let flatIndex = -1;

  return (
    <div className={className}>
      {name && <input type="hidden" name={name} value={selected.join(",")} />}
      <div aria-live="polite" className="sr-only">{announce.text}{announce.flip ? " " : ""}</div>

      <div
        ref={boxRef}
        className="flex cursor-text flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 transition-shadow focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15"
        onClick={() => inputRef.current?.focus()}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: "To move this tag, press Space, use the arrow keys, then press Space again to drop it. Escape cancels.",
            },
          }}
        >
          <SortableContext items={selected} strategy={rectSortingStrategy}>
            {selected.map((tag, i) => (
              <SortableChip
                key={tag}
                id={tag}
                label={labelFor(tag)}
                marked={armed && i === selected.length - 1}
                onRemove={() => { remove(tag); setFocusAfter({ removeAt: i }); }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setActive(null); setArmed(false); }}
          onFocus={() => setFocused(true)}
          onPaste={(event) => {
            // A pasted list ("Figma, React, CSS" or one skill per line) is added in one go, with a summary.
            const items = splitTagList(event.clipboardData.getData("text"));
            if (items.length < 2) return;
            event.preventDefault();
            addItems(items);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && open && flat.length) {
              event.preventDefault();
              setActive((activeIndex + 1) % flat.length);
            } else if (event.key === "ArrowUp" && open && flat.length) {
              event.preventDefault();
              setActive(activeIndex <= 0 ? flat.length - 1 : activeIndex - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (open && activeIndex >= 0 && flat[activeIndex]) choose(flat[activeIndex]);
              else addDraft(draft);
            } else if (event.key === "Escape") {
              if (draft) { event.preventDefault(); setDraft(""); setActive(null); }
              else setFocused(false);
            } else if (event.key === "Backspace" && !draft && selected.length) {
              if (armed) remove(selected.at(-1)!);
              else { setArmed(true); say(`Press Backspace again to remove ${labelFor(selected.at(-1)!)}`); }
            } else if (armed) {
              setArmed(false);
            }
          }}
          onBlur={() => { setFocused(false); setArmed(false); addDraft(draft); }}
          placeholder={selected.length ? "Add more…" : inputPlaceholder}
          aria-label="Add a skill"
          aria-describedby={maxChars !== undefined ? statusId : undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          enterKeyHint="done"
          autoComplete="off"
          className="min-w-[12ch] flex-1 border-0 bg-transparent p-0 text-base text-foreground outline-none placeholder:text-muted-2 sm:text-sm"
        />
      </div>

      {/* Character limit: a bar you can read at a glance, plus the exact count. */}
      {maxChars !== undefined && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className={cn("h-full rounded-full transition-all", atLimit ? "bg-danger" : percent > 80 ? "bg-warning" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span
              className={cn("text-muted-2", notice?.tone === "error" && "text-danger")}
              onMouseEnter={() => setNoticeHeld(true)}
              onMouseLeave={() => setNoticeHeld(false)}
              onFocus={() => setNoticeHeld(true)}
              onBlur={() => setNoticeHeld(false)}
            >
              {notice ? (
                <span data-testid="notice" className="inline-flex flex-wrap items-center gap-x-2">
                  {notice.text}
                  {notice.undoTo && (
                    <button
                      type="button"
                      onClick={() => {
                        commit(notice.undoTo!);
                        setNotice(null);
                        setNoticeHeld(false);
                        say("Undone");
                        inputRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Undo2 className="h-3 w-3" aria-hidden />Undo
                    </button>
                  )}
                </span>
              ) : armed ? "Press Backspace again to remove the last tag."
                : `${Math.max(0, maxChars - charCount)} ${maxChars - charCount === 1 ? "character" : "characters"} left`}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-3">
              {selected.length > 1 && !isSorted && (
                <button type="button" onClick={sortAZ} className="inline-flex items-center gap-1 text-muted hover:text-foreground hover:underline">
                  <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden />Sort A–Z
                </button>
              )}
              <span id={statusId} className={cn("tabular-nums", atLimit ? "text-danger" : "text-muted-2")}>
                <span className="sr-only">Characters used: </span>{charCount} / {maxChars}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* One box under the input. Search results cover it in place while typing. */}
      <div className="relative mt-3">
        <div aria-hidden={open} className={cn(
          "max-h-64 overflow-y-auto rounded-lg border border-border bg-surface p-2",
          open && "invisible pointer-events-none",
        )}>
          {recommended.length > 0 && (
            <>
              <p className="mb-2 px-1 text-xs font-medium text-muted-2">
                {selected.length ? "Others also tag" : "Most used"}
              </p>
              <div className="flex flex-wrap gap-2">
                {recommended.map((tag) => pill(`rec-${tag}`, <span>{labelFor(tag)}</span>, {
                  on: false,
                  onClick: () => toggle(tag),
                  tabIndex: open ? -1 : 0,
                }))}
              </div>
              <p className="mb-2 mt-3 px-1 text-xs font-medium text-muted-2">All skills</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {opts.map((option) => {
              const on = has(option.value);
              const tooLong = !on && !fits(option.label);
              return pill(option.value, <span>{option.label}</span>, {
                on,
                onClick: () => toggle(option.value),
                tabIndex: open ? -1 : 0,
                disabled: tooLong,
                title: tooLong ? "Too long for the characters left" : undefined,
              });
            })}
          </div>
        </div>

        {open && (
          <div id={listboxId} role="listbox" aria-label="Suggestions" className="absolute inset-0 z-30 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-lg">
            {groups.map((group) => (
              <div key={group.id} role="group" aria-labelledby={`${listboxId}-${group.id}`} className="mb-3 last:mb-0">
                <p id={`${listboxId}-${group.id}`} className="mb-1.5 px-1 text-xs font-medium text-muted-2">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => {
                    const i = ++flatIndex;
                    const label = item.kind === "option" ? item.option.label : item.label;
                    const tooLong = !fits(label);
                    return pill(
                      item.kind === "option" ? item.option.value : `create-${label}`,
                      item.kind === "create"
                        ? <span>Create “<span className="font-medium text-foreground">{label}</span>”</span>
                        : group.id === "fuzzy" ? <span>{label}</span>
                        : <span>{highlight(label, q)}</span>,
                      {
                        on: false,
                        role: "option",
                        id: optionId(i),
                        tabIndex: -1,
                        isActive: i === activeIndex,
                        disabled: tooLong,
                        title: tooLong ? "Too long for the characters left" : undefined,
                        onClick: () => choose(item),
                      },
                    );
                  })}
                </div>
              </div>
            ))}
            {flat.length === 0 && (
              <p className="px-1 py-1 text-sm text-muted-2">No matches.</p>
            )}
            {flat.length > 0 && (
              <p className="mt-3 hidden px-1 text-xs text-muted-2 sm:block">↑ ↓ to move · Enter to add · Esc to clear</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
