import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Search, Undo2, X } from "lucide-react";
import { cn } from "./lib/cn";
import {
  canonicalTagFor, fitTagAdditions, matchTagOptions, recommendTags, tagCharCount, tagSlug,
  type TagOption, type TagRecommendations,
} from "./lib/tags";

type Option = string | TagOption;

/** One row in the suggestion list: a known tag, or "create this new tag". */
type Suggestion =
  | { kind: "option"; option: TagOption }
  | { kind: "create"; label: string };

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

const UNDO_MS = 5000;

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
  /** Form field name. The value is submitted as one comma-separated string. */
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
  const searchable: TagOption[] = (() => {
    const seen = new Set(opts.map((option) => tagSlug(option.value)));
    const extra = searchOptions.map(optionShape).filter((option) => {
      const slug = tagSlug(option.value);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    return [...opts, ...extra];
  })();
  const catalogValues = new Set(opts.map((option) => option.value));
  const [internal, setInternal] = useState(defaultValue);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  // True when the last addition did not fit the character limit.
  const [refused, setRefused] = useState(false);
  // Keyboard highlight inside the suggestion list (-1 = none).
  const [active, setActive] = useState(-1);
  // Backspace on an empty box first marks the last tag; a second press removes it.
  const [armed, setArmed] = useState(false);
  // The tag removed last, so one slip can be undone.
  const [undo, setUndo] = useState<string | null>(null);
  // Read out by screen readers.
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = value ?? internal;

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const labelFor = (tag: string) => searchable.find((option) => option.value === tag)?.label ?? tag;
  const sizeOf = (tag: string) => labelFor(tag).length;
  const alphabetize = (tags: string[]) => [...tags].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b), "en", { sensitivity: "base", numeric: true }),
  );
  const commit = (tags: string[]) => {
    const seen = new Set<string>();
    const unique = tags.filter((tag) => {
      const slug = tagSlug(tag);
      if (!slug || seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    const fitted = maxChars === undefined ? unique : fitTagAdditions(unique, selected, maxChars, sizeOf);
    setRefused(fitted.length < unique.length);
    const ordered = alphabetize(fitted);
    const added = ordered.filter((tag) => !selected.some((s) => tagSlug(s) === tagSlug(tag)));
    if (added.length) setAnnounce(`Added ${added.map(labelFor).join(", ")}`);
    else if (fitted.length < unique.length) setAnnounce("That tag does not fit the character limit");
    if (value === undefined) setInternal(ordered);
    onChange?.(ordered);
  };
  const has = (tag: string) => selected.some((item) => tagSlug(item) === tagSlug(tag));
  const remove = (tag: string) => {
    commit(selected.filter((item) => tagSlug(item) !== tagSlug(tag)));
    setUndo(tag);
    setAnnounce(`Removed ${labelFor(tag)}. Undo is available`);
    setArmed(false);
  };
  const toggle = (tag: string) => has(tag) ? remove(tag) : commit([...selected, tag]);

  const addDraft = (raw: string) => {
    const additions = raw
      .split(",")
      .map((item) => item.trim().replace(/\s+/g, " ").slice(0, maxTagLength).trim())
      .filter(Boolean);
    setDraft("");
    setActive(-1);
    if (!additions.length) return;

    const next = [...selected];
    for (const addition of additions) {
      // "setup figma" typed and "Figma setup" picked must become the same tag.
      const canonical = canonicalTagFor(addition, searchable);
      if (canonical) next.push(canonical);
      else if (allowCustom) next.push(addition);
    }
    commit(next);
  };

  // Only the last comma-separated part drives the suggestions.
  const lastPart = (draft.split(",").at(-1) ?? "").trim();
  const q = lastPart.toLowerCase();
  const matches = matchTagOptions(
    q,
    searchable.filter((option) => !has(option.value)),
    { catalog: catalogValues },
  );
  const orderedSelected = alphabetize(selected);
  const charCount = tagCharCount(orderedSelected, sizeOf);
  const atLimit = maxChars !== undefined && charCount >= maxChars;
  // Never recommend a tag that would not fit.
  const room = maxChars === undefined ? Infinity : maxChars - charCount;
  const fits = (label: string) => label.length <= room;
  const recommended = recommendations
    ? recommendTags(orderedSelected, recommendations).filter((tag) => fits(labelFor(tag)))
    : [];

  // Offer "Create" when the typed text is new, so custom tags are visible instead of a hidden Enter trick.
  // Hidden while the text is clearly the start of an existing tag ("typesc" → TypeScript).
  const typedIsKnown = !q || canonicalTagFor(lastPart, searchable) !== null
    || matches.some((option) => option.label.toLowerCase().startsWith(q));
  const suggestions: Suggestion[] = [
    ...matches.map((option): Suggestion => ({ kind: "option", option })),
    ...(allowCustom && !typedIsKnown && !has(lastPart)
      ? [{ kind: "create", label: lastPart.slice(0, maxTagLength) } as Suggestion]
      : []),
  ];
  const open = focused && Boolean(q);
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

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

  return (
    <div className={className}>
      {name && <input type="hidden" name={name} value={orderedSelected.join(",")} />}
      <div aria-live="polite" className="sr-only">{announce}</div>

      <div
        className="flex cursor-text flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 transition-shadow focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15"
        onClick={() => inputRef.current?.focus()}
      >
        {orderedSelected.map((tag, i) => {
          const marked = armed && i === orderedSelected.length - 1;
          return (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft py-1 pl-2.5 pr-1 text-sm font-medium text-primary",
                marked && "ring-2 ring-danger",
              )}
            >
              {labelFor(tag)}
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); remove(tag); }}
                aria-label={`Remove ${labelFor(tag)}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-primary/70 hover:bg-primary/10 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setRefused(false); setActive(-1); setArmed(false); }}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && open && suggestions.length) {
              event.preventDefault();
              setActive((i) => (i + 1) % suggestions.length);
            } else if (event.key === "ArrowUp" && open && suggestions.length) {
              event.preventDefault();
              setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (open && active >= 0 && suggestions[active]) choose(suggestions[active]);
              else addDraft(draft);
            } else if (event.key === "Escape") {
              if (draft) { event.preventDefault(); setDraft(""); setActive(-1); }
              else setFocused(false);
            } else if (event.key === "Backspace" && !draft && orderedSelected.length) {
              if (armed) remove(orderedSelected.at(-1)!);
              else { setArmed(true); setAnnounce(`Press Backspace again to remove ${labelFor(orderedSelected.at(-1)!)}`); }
            } else if (armed) {
              setArmed(false);
            }
          }}
          onBlur={() => { setFocused(false); setArmed(false); addDraft(draft); }}
          placeholder={orderedSelected.length ? "Add more…" : inputPlaceholder}
          aria-label="Add a skill"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
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
          <div className="mt-1.5 flex min-h-5 items-center justify-between gap-3 text-xs">
            <span className={cn("text-muted-2", refused && "text-danger")}>
              {undo ? (
                <span className="inline-flex items-center gap-2">
                  Removed “{labelFor(undo)}”.
                  <button
                    type="button"
                    onClick={() => { commit([...selected, undo]); setUndo(null); }}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Undo2 className="h-3 w-3" aria-hidden />Undo
                  </button>
                </span>
              ) : refused ? "That tag does not fit. Remove one to make room."
                : armed ? "Press Backspace again to remove the last tag."
                : `${Math.max(0, maxChars - charCount)} characters left`}
            </span>
            <span className={cn("shrink-0 tabular-nums", atLimit ? "text-danger" : "text-muted-2")}>
              {charCount} / {maxChars}
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
                {orderedSelected.length ? "Others also tag" : "Most used"}
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
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item, i) => {
                const label = item.kind === "option" ? item.option.label : item.label;
                const tooLong = !fits(label);
                return pill(
                  item.kind === "option" ? item.option.value : `create-${label}`,
                  item.kind === "option"
                    ? <span>{highlight(label, q)}</span>
                    : <span>Create “<span className="font-medium text-foreground">{label}</span>”</span>,
                  {
                    on: false,
                    role: "option",
                    id: optionId(i),
                    isActive: i === active,
                    disabled: tooLong,
                    title: tooLong ? "Too long for the characters left" : undefined,
                    onClick: () => choose(item),
                  },
                );
              })}
            </div>
            {suggestions.length === 0 && (
              <p className="px-1 py-1 text-sm text-muted-2">No matches.</p>
            )}
            {suggestions.length > 0 && (
              <p className="mt-3 hidden px-1 text-xs text-muted-2 sm:block">↑ ↓ to move · Enter to add · Esc to clear</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
