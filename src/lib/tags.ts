// Pure helpers for the tag picker. No React in here.

export type TagOption = { value: string; label: string; keywords?: readonly string[] };

/** "the same tag" = same text after trimming, collapsing spaces and lowercasing. */
export function tagSlug(t: string): string {
  return t.trim().replace(/\s+/g, " ").toLowerCase();
}

/** How many characters one tag costs against the budget. */
export type TagSize = (tag: string) => number;
const ownLength: TagSize = (tag) => tag.length;

/** Characters a list of tags spends. Separators are not counted. */
export function tagCharCount(tags: readonly string[], sizeOf: TagSize = ownLength): number {
  return tags.reduce((total, tag) => total + sizeOf(tag), 0);
}

/**
 * Apply the character budget the way the editor should: refuse NEW tags that
 * do not fit, but never drop a tag that is already selected. Otherwise
 * removing one tag from an over-budget list could silently remove others.
 */
export function fitTagAdditions(
  next: readonly string[],
  held: readonly string[],
  budget: number,
  sizeOf: TagSize = ownLength,
): string[] {
  const heldSlugs = new Set(held.map(tagSlug));
  const isHeld = (tag: string) => heldSlugs.has(tagSlug(tag));
  let used = tagCharCount(next.filter(isHeld), sizeOf);
  return next.filter((tag) => {
    if (isHeld(tag)) return true;
    if (used + sizeOf(tag) > budget) return false;
    used += sizeOf(tag);
    return true;
  });
}

/** A tag's words, normalized and sorted: "setup figma" and "Figma setup" match. */
const tokenKey = (value: string) => tagSlug(value).split(" ").filter(Boolean).sort().join(" ");

/**
 * The spelling typed text should be stored as, or null if it matches no known
 * option (then it is kept as a free-text tag). Exact match first, then the
 * same words in a different order.
 */
export function canonicalTagFor(typed: string, options: readonly TagOption[]): string | null {
  const slug = tagSlug(typed);
  if (!slug) return null;
  const exact = options.find((o) => tagSlug(o.value) === slug || tagSlug(o.label) === slug);
  if (exact) return exact.value;
  const key = tokenKey(typed);
  const reordered = options.find((o) => tokenKey(o.value) === key || tokenKey(o.label) === key);
  return reordered ? reordered.value : null;
}

/** Related tags for one tag, strongest first. `n` = how many people use both. */
export type RelatedTag = { tag: string; n: number };

export type TagRecommendations = {
  /** tagSlug -> the tags most often used alongside it. */
  related: Record<string, RelatedTag[]>;
  /** Most-used tags overall: what an empty box is shown. */
  popular: string[];
};

/**
 * What to recommend, given what is already selected. A tag related to MORE of
 * your picks ranks above one related very strongly to a single pick. Topped up
 * with the most popular tags.
 */
export function recommendTags(
  selected: readonly string[],
  { related, popular }: TagRecommendations,
  limit = 12,
): string[] {
  const held = new Set(selected.map(tagSlug));
  const scored = new Map<string, { tag: string; score: number; breadth: number }>();

  for (const pick of selected) {
    for (const { tag, n } of related[tagSlug(pick)] ?? []) {
      const slug = tagSlug(tag);
      if (held.has(slug)) continue;
      const prev = scored.get(slug);
      if (prev) {
        prev.score += n;
        prev.breadth += 1;
      } else {
        scored.set(slug, { tag, score: n, breadth: 1 });
      }
    }
  }

  const out = [...scored.values()]
    .sort((a, b) => b.breadth - a.breadth || b.score - a.score || a.tag.localeCompare(b.tag))
    .map((entry) => entry.tag);

  const taken = new Set(out.map(tagSlug));
  for (const tag of popular) {
    if (out.length >= limit) break;
    const slug = tagSlug(tag);
    if (held.has(slug) || taken.has(slug)) continue;
    taken.add(slug);
    out.push(tag);
  }
  return out.slice(0, limit);
}

/** Suggestions shown at once while typing. */
export const MAX_SUGGESTIONS = 24;

/**
 * Rank options against a typed query. Every word must appear, in any order.
 * `keywords` are hidden search aliases. Options in `catalog` (the always-visible
 * list) rank slightly higher.
 */
export function matchTagOptions(
  query: string,
  options: readonly TagOption[],
  { catalog, limit = MAX_SUGGESTIONS }: { catalog?: ReadonlySet<string>; limit?: number } = {},
): TagOption[] {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  return options
    .map((option) => ({
      option,
      hay: [option.label, ...(option.keywords ?? [])].join(" ").toLowerCase(),
    }))
    .filter(({ hay }) => tokens.every((token) => hay.includes(token)))
    .map(({ option }) => {
      const label = option.label.toLowerCase();
      let rank = 0;
      if (label.startsWith(q)) rank -= 4;
      else if (label.includes(q)) rank -= 2;
      if (catalog?.has(option.value)) rank -= 1;
      return { option, rank };
    })
    .sort((a, b) =>
      a.rank - b.rank ||
      a.option.label.length - b.option.label.length ||
      a.option.label.localeCompare(b.option.label, "en", { sensitivity: "base", numeric: true }),
    )
    .slice(0, limit)
    .map(({ option }) => option);
}

// ---------------------------------------------------------------------------
// Typo-tolerant matching
// ---------------------------------------------------------------------------

/**
 * Edit distance between two strings, counting a swap of two neighbouring
 * letters as one edit ("javsacript" is one edit from "javascript"). Gives up
 * and returns `max + 1` as soon as the answer must be bigger than `max`, so a
 * long catalogue stays cheap to search.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prevPrev[j - 2] + 1);
      row.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How many typos a typed word may have. Short words get none: with 3 letters,
 * one edit turns "css" into "cs", "vue" into "vu"... far too much noise.
 */
export function typoAllowance(word: string): number {
  if (word.length < 4) return 0;
  return word.length < 8 ? 1 : 2;
}

/**
 * Distance from a typed word to a tag word, treating the typed word as possibly
 * unfinished: "javscr" is compared with the start of "javascript", so the
 * correction shows up while you are still typing.
 */
function wordDistance(typed: string, word: string, max: number): number {
  if (word.includes(typed)) return 0;
  let best = max + 1;
  for (const len of [typed.length - 1, typed.length, typed.length + 1]) {
    if (len < 1) continue;
    best = Math.min(best, editDistance(typed, word.slice(0, len), max));
    if (best === 0) break;
  }
  return best;
}

/** Suggestions shown under "Did you mean". */
export const MAX_FUZZY = 3;

/**
 * Options that match the query once small typos are allowed. Every typed word
 * must be close to some word of the label or its keywords. Options that already
 * match exactly are left to `matchTagOptions`, so nothing is listed twice.
 * Best first: fewest typos, then catalogue tags, then shorter labels.
 */
export function fuzzyMatchTagOptions(
  query: string,
  options: readonly TagOption[],
  { catalog, exclude, limit = MAX_FUZZY }: { catalog?: ReadonlySet<string>; exclude?: ReadonlySet<string>; limit?: number } = {},
): TagOption[] {
  const tokens = tagSlug(query).split(" ").filter(Boolean);
  if (!tokens.length || tokens.every((t) => typoAllowance(t) === 0)) return [];

  const scored: Array<{ option: TagOption; typos: number }> = [];
  for (const option of options) {
    if (exclude?.has(option.value)) continue;
    const words = [option.label, ...(option.keywords ?? [])].join(" ").toLowerCase().split(/[\s\-./]+/).filter(Boolean);
    let typos = 0;
    for (const token of tokens) {
      const allow = typoAllowance(token);
      const best = Math.min(...words.map((w) => wordDistance(token, w, allow)));
      if (best > allow) { typos = -1; break; }
      typos += best;
    }
    if (typos > 0) scored.push({ option, typos }); // typos === 0 is an exact match, shown elsewhere
  }
  return scored
    .sort((a, b) =>
      a.typos - b.typos ||
      Number(catalog?.has(b.option.value) ?? 0) - Number(catalog?.has(a.option.value) ?? 0) ||
      a.option.label.length - b.option.label.length ||
      a.option.label.localeCompare(b.option.label))
    .slice(0, limit)
    .map((s) => s.option);
}

// ---------------------------------------------------------------------------
// Grouped suggestions
// ---------------------------------------------------------------------------

/** One row in the suggestion list: a known tag, or "create this new tag". */
export type Suggestion =
  | { kind: "option"; option: TagOption }
  | { kind: "create"; label: string };

export type SuggestionGroupId = "list" | "more" | "fuzzy" | "create";
export type SuggestionGroup = { id: SuggestionGroupId; label: string; items: Suggestion[] };

export const GROUP_LABELS: Record<SuggestionGroupId, string> = {
  list: "In the list",
  more: "More skills",
  fuzzy: "Did you mean",
  create: "New tag",
};

/**
 * Everything the dropdown shows for one query, in groups:
 *   In the list  – catalogue tags that match
 *   More skills  – search-only tags that match
 *   Did you mean – close spellings, only when exact matches are few
 *   New tag      – "Create '…'", when custom tags are allowed and the text is new
 *
 * `autoActive` is the row Enter should take without arrowing: the first
 * "Did you mean" row when nothing matched exactly (so "javscript" + Enter adds
 * JavaScript, not a misspelt custom tag). Otherwise -1: Enter adds what was typed.
 */
export function buildSuggestions({
  query, catalog, more, isSelected, allowCustom, maxTagLength = 30,
}: {
  query: string;
  catalog: readonly TagOption[];
  more: readonly TagOption[];
  isSelected: (value: string) => boolean;
  allowCustom: boolean;
  maxTagLength?: number;
}): { groups: SuggestionGroup[]; flat: Suggestion[]; autoActive: number } {
  const typed = query.trim().replace(/\s+/g, " ");
  const q = typed.toLowerCase();
  if (!q) return { groups: [], flat: [], autoActive: -1 };

  const all = [...catalog, ...more].filter((o) => !isSelected(o.value));
  const catalogValues = new Set(catalog.map((o) => o.value));
  const exact = matchTagOptions(q, all, { catalog: catalogValues });
  const fuzzy = exact.length >= MAX_FUZZY
    ? []
    : fuzzyMatchTagOptions(q, all, { catalog: catalogValues, exclude: new Set(exact.map((o) => o.value)) });

  const known = canonicalTagFor(typed, [...catalog, ...more]) !== null
    || exact.some((o) => o.label.toLowerCase().startsWith(q));
  const showCreate = allowCustom && !known && !isSelected(typed);

  const asItems = (opts: TagOption[]): Suggestion[] => opts.map((option) => ({ kind: "option", option }));
  const groups: SuggestionGroup[] = ([
    { id: "list", items: asItems(exact.filter((o) => catalogValues.has(o.value))) },
    { id: "more", items: asItems(exact.filter((o) => !catalogValues.has(o.value))) },
    { id: "fuzzy", items: asItems(fuzzy) },
    { id: "create", items: showCreate ? [{ kind: "create", label: typed.slice(0, maxTagLength).trim() }] : [] },
  ] as Array<Omit<SuggestionGroup, "label">>)
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, label: GROUP_LABELS[g.id] }));

  const flat = groups.flatMap((g) => g.items);
  const autoActive = exact.length === 0 && fuzzy.length > 0 ? 0 : -1;
  return { groups, flat, autoActive };
}

// ---------------------------------------------------------------------------
// Adding several tags at once (typed with commas, or pasted)
// ---------------------------------------------------------------------------

/**
 * Split pasted or typed text into tag candidates. Handles the shapes people
 * paste from CVs and docs: commas, semicolons, new lines, tabs, pipes and
 * bullet points.
 */
export function splitTagList(raw: string): string[] {
  return raw
    .split(/[,;\n\r\t|]+/)
    .map((part) => part.replace(/^\s*(?:[-*•·▪◦]|\d+[.)])\s+/, "").trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** What happened to each item of a multi-tag add. */
export type AdditionPlan = {
  /** Stored spellings to add, in the order given. */
  added: string[];
  /** Already selected, or listed twice. */
  duplicates: string[];
  /** Did not fit in the characters left. */
  tooBig: string[];
  /** Unknown, and custom tags are off. */
  rejected: string[];
};

/**
 * Decide, item by item, what a multi-tag add does. Known tags are stored with
 * their catalogue spelling ("typescript" -> "TypeScript"). Items are added in
 * order while they fit: one long tag that does not fit does not block shorter
 * ones after it.
 */
export function planAdditions(
  items: readonly string[],
  selected: readonly string[],
  options: readonly TagOption[],
  { allowCustom, maxTagLength = 30, budget = Infinity, sizeOf = ownLength }: {
    allowCustom: boolean; maxTagLength?: number; budget?: number; sizeOf?: TagSize;
  },
): AdditionPlan {
  const plan: AdditionPlan = { added: [], duplicates: [], tooBig: [], rejected: [] };
  const taken = new Set(selected.map(tagSlug));
  let used = tagCharCount(selected, sizeOf);
  for (const raw of items) {
    const item = raw.trim().replace(/\s+/g, " ").slice(0, maxTagLength).trim();
    if (!item) continue;
    const tag = canonicalTagFor(item, options) ?? (allowCustom ? item : null);
    if (tag === null) { plan.rejected.push(item); continue; }
    if (taken.has(tagSlug(tag))) { plan.duplicates.push(tag); continue; }
    if (used + sizeOf(tag) > budget) { plan.tooBig.push(tag); continue; }
    taken.add(tagSlug(tag));
    used += sizeOf(tag);
    plan.added.push(tag);
  }
  return plan;
}

/** One line for people (and screen readers) about a multi-tag add. */
export function describePlan(plan: AdditionPlan, labelOf: (tag: string) => string = (t) => t): string {
  const list = (tags: string[]) => tags.map(labelOf).join(", ");
  const parts: string[] = [];
  if (plan.added.length) parts.push(`Added ${plan.added.length === 1 ? labelOf(plan.added[0]) : plan.added.length}`);
  if (plan.tooBig.length) parts.push(`${plan.tooBig.length} didn't fit: ${list(plan.tooBig)}`);
  if (plan.duplicates.length) parts.push(`${plan.duplicates.length} already added`);
  if (plan.rejected.length) parts.push(`${plan.rejected.length} not in the list: ${list(plan.rejected)}`);
  return parts.join(" · ") || "Nothing to add";
}

/** Move one item to a new index. Used for drag-to-reorder. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
