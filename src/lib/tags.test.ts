import { describe, expect, it } from "vitest";
import {
  buildSuggestions, canonicalTagFor, describePlan, editDistance, fitTagAdditions, fuzzyMatchTagOptions,
  matchTagOptions, moveItem, planAdditions, recommendTags, splitTagList, tagCharCount, tagSlug, typoAllowance,
  type TagOption,
} from "./tags";
import { MORE_SKILLS, RECOMMENDATIONS, SKILLS } from "../data";

const ALL: TagOption[] = [...SKILLS, ...MORE_SKILLS];
const labels = (opts: TagOption[]) => opts.map((o) => o.label);

describe("tagSlug", () => {
  it("ignores case and extra spaces", () => {
    expect(tagSlug("  Design   Systems ")).toBe("design systems");
  });
});

describe("character budget", () => {
  it("counts characters, not separators", () => {
    expect(tagCharCount(["CSS", "HTML"])).toBe(7);
  });

  it("refuses a new tag that does not fit", () => {
    expect(fitTagAdditions(["Figma", "TypeScript"], ["Figma"], 10)).toEqual(["Figma"]);
  });

  it("accepts a tag that lands exactly on the limit", () => {
    expect(fitTagAdditions(["Figma", "React"], ["Figma"], 10)).toEqual(["Figma", "React"]);
  });

  it("never drops a tag that is already selected, even over budget", () => {
    // Budget lowered after the fact: the held tags stay, only new ones are refused.
    expect(fitTagAdditions(["Figma", "TypeScript", "CSS"], ["Figma", "TypeScript"], 8)).toEqual(["Figma", "TypeScript"]);
  });

  it("keeps adding shorter tags after one that did not fit", () => {
    expect(fitTagAdditions(["Interaction design", "CSS"], [], 5)).toEqual(["CSS"]);
  });
});

describe("canonicalTagFor", () => {
  it("returns the catalogue spelling", () => {
    expect(canonicalTagFor("typescript", ALL)).toBe("TypeScript");
  });

  it("matches the same words in another order", () => {
    expect(canonicalTagFor("setup figma", ALL)).toBe("Figma setup");
  });

  it("returns null for unknown text", () => {
    expect(canonicalTagFor("Basket weaving", ALL)).toBeNull();
  });
});

describe("matchTagOptions", () => {
  it("needs every typed word, in any order", () => {
    expect(labels(matchTagOptions("design ui", ALL))).toEqual(["UI design"]);
  });

  it("searches hidden keywords", () => {
    expect(labels(matchTagOptions("webgl", ALL))).toEqual(["Three.js"]);
  });

  it("ranks labels that start with the query first", () => {
    const result = labels(matchTagOptions("react", ALL));
    expect(result[0]).toBe("React");
    expect(result).toContain("React Native");
  });

  it("ranks catalogue tags above search-only tags when otherwise equal", () => {
    const catalog = new Set(SKILLS.map((o) => o.value));
    const result = labels(matchTagOptions("figma", ALL, { catalog }));
    expect(result).toEqual(["Figma", "Figma setup"]);
  });

  it("returns nothing for an empty query", () => {
    expect(matchTagOptions("   ", ALL)).toEqual([]);
  });
});

describe("recommendTags", () => {
  it("shows the most popular tags for an empty profile", () => {
    expect(recommendTags([], RECOMMENDATIONS, 3)).toEqual(["Figma", "React", "TypeScript"]);
  });

  it("prefers a tag related to more of your picks", () => {
    // Next.js is related to both React and TypeScript; Node.js only to TypeScript.
    const result = recommendTags(["React", "TypeScript"], RECOMMENDATIONS);
    expect(result.indexOf("Next.js")).toBeLessThan(result.indexOf("Node.js"));
  });

  it("never recommends something already picked", () => {
    expect(recommendTags(["Figma"], RECOMMENDATIONS)).not.toContain("Figma");
  });
});

describe("editDistance", () => {
  it.each([
    ["javascript", "javascript", 0],
    ["javscript", "javascript", 1], // missing letter
    ["javsacript", "javascript", 1], // two letters swapped
    ["figam", "figma", 1],
    ["kitten", "sitting", 3],
  ])("%s -> %s is %i", (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });

  it("stops early once past the maximum", () => {
    expect(editDistance("abcdefgh", "zzzzzzzz", 2)).toBe(3);
  });
});

describe("typo matching", () => {
  it("allows no typos in words shorter than 4 letters", () => {
    expect(typoAllowance("css")).toBe(0);
    expect(fuzzyMatchTagOptions("cs", ALL)).toEqual([]);
  });

  it.each([
    ["javscript", "JavaScript"],
    ["typscript", "TypeScript"],
    ["figam", "Figma"],
    ["protoyping", "Prototyping"],
    ["photshop", "Photoshop"],
  ])("finds %s -> %s", (typed, expected) => {
    expect(labels(fuzzyMatchTagOptions(typed, ALL))[0]).toBe(expected);
  });

  it("corrects while the word is still being typed", () => {
    expect(labels(fuzzyMatchTagOptions("javsc", ALL))).toContain("JavaScript");
  });

  it("does not repeat exact matches", () => {
    expect(fuzzyMatchTagOptions("figma", ALL)).toEqual([]);
  });

  it("stays quiet for unrelated words", () => {
    expect(fuzzyMatchTagOptions("basketball", ALL)).toEqual([]);
  });
});

describe("buildSuggestions", () => {
  const base = { catalog: SKILLS, more: MORE_SKILLS, isSelected: () => false, allowCustom: true };

  it("groups catalogue and search-only matches", () => {
    const { groups } = buildSuggestions({ ...base, query: "figma" });
    expect(groups.map((g) => g.id)).toEqual(["list", "more"]);
  });

  it("offers 'Did you mean' and preselects it when nothing matched exactly", () => {
    const { groups, flat, autoActive } = buildSuggestions({ ...base, query: "javscript" });
    expect(groups.map((g) => g.id)).toEqual(["fuzzy", "create"]);
    expect(autoActive).toBe(0);
    expect(flat[0]).toEqual({ kind: "option", option: { value: "JavaScript", label: "JavaScript" } });
  });

  it("does not preselect anything when there is an exact match", () => {
    expect(buildSuggestions({ ...base, query: "react" }).autoActive).toBe(-1);
  });

  it("hides 'Create' while the text is the start of a known tag", () => {
    const { groups } = buildSuggestions({ ...base, query: "typesc" });
    expect(groups.map((g) => g.id)).not.toContain("create");
  });

  it("hides 'Create' when custom tags are off", () => {
    const { groups } = buildSuggestions({ ...base, allowCustom: false, query: "Basket weaving" });
    expect(groups).toEqual([]);
  });

  it("leaves out tags already selected", () => {
    const { flat } = buildSuggestions({ ...base, query: "figma", isSelected: (v) => v === "Figma" });
    expect(flat.map((s) => s.kind === "option" && s.option.label)).toEqual(["Figma setup"]);
  });
});

describe("splitTagList", () => {
  it("splits commas, semicolons, new lines, tabs and pipes", () => {
    expect(splitTagList("React, Vue;Svelte\nCSS\tHTML | Figma")).toEqual(["React", "Vue", "Svelte", "CSS", "HTML", "Figma"]);
  });

  it("strips bullets and numbering from a pasted list", () => {
    expect(splitTagList("• Figma\n- React\n* CSS\n1. HTML\n2) Vue")).toEqual(["Figma", "React", "CSS", "HTML", "Vue"]);
  });

  it("keeps hyphens inside a tag", () => {
    expect(splitTagList("Micro-interactions")).toEqual(["Micro-interactions"]);
  });
});

describe("planAdditions", () => {
  const opts = { allowCustom: true, budget: 30 };

  it("stores catalogue spellings and keeps the order given", () => {
    expect(planAdditions(["typescript", "css"], [], ALL, opts).added).toEqual(["TypeScript", "CSS"]);
  });

  it("reports what did not fit, and still adds shorter tags after it", () => {
    const plan = planAdditions(["Interaction design", "CSS"], ["Figma setup"], ALL, { ...opts, budget: 20 });
    expect(plan).toEqual({ added: ["CSS"], duplicates: [], tooBig: ["Interaction design"], rejected: [] });
  });

  it("reports duplicates, including ones repeated in the same paste", () => {
    const plan = planAdditions(["Figma", "react", "React"], ["Figma"], ALL, opts);
    expect(plan.added).toEqual(["React"]);
    expect(plan.duplicates).toEqual(["Figma", "React"]);
  });

  it("rejects unknown tags when custom tags are off", () => {
    expect(planAdditions(["Basket weaving"], [], ALL, { allowCustom: false }).rejected).toEqual(["Basket weaving"]);
  });

  it("cuts custom tags to the maximum length", () => {
    expect(planAdditions(["x".repeat(50)], [], ALL, { allowCustom: true, maxTagLength: 10 }).added).toEqual(["x".repeat(10)]);
  });
});

describe("describePlan", () => {
  it("summarises a paste in one line", () => {
    expect(describePlan({ added: ["A", "B", "C"], duplicates: ["D"], tooBig: ["Long tag"], rejected: [] }))
      .toBe("Added 3 · 1 didn't fit: Long tag · 1 already added");
  });

  it("names a single added tag", () => {
    expect(describePlan({ added: ["React"], duplicates: [], tooBig: [], rejected: [] })).toBe("Added React");
  });
});

describe("moveItem", () => {
  it("moves an item forward and back", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("ignores out-of-range moves", () => {
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});
