import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { TagPicker } from "./TagPicker";
import { MORE_SKILLS, RECOMMENDATIONS, SKILLS } from "./data";

type Theme = "light" | "dark";

// Light/dark switch.
function ThemeSwitch() {
  // Follow the system setting on first visit, then remember the choice.
  const [theme, setTheme] = useState<Theme>(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("theme"); } catch { /* storage blocked */ }
    const initial: Theme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.classList.toggle("dark", initial === "dark");
    return initial;
  });
  const pick = (next: Theme) => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch { /* storage blocked */ }
  };
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs hover:bg-surface-2 aria-pressed:bg-surface-2 aria-pressed:text-foreground";
  return (
    <div className="inline-flex gap-1 rounded-full border border-border bg-surface p-1 text-muted">
      <button type="button" className={btn} aria-pressed={theme === "light"} onClick={() => pick("light")}><Sun className="h-3.5 w-3.5" />Light</button>
      <button type="button" className={btn} aria-pressed={theme === "dark"} onClick={() => pick("dark")}><Moon className="h-3.5 w-3.5" />Dark</button>
    </div>
  );
}

export default function App() {
  const [skills, setSkills] = useState<string[]>(["Figma", "React"]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tag Picker</h1>
        <ThemeSwitch />
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-1 text-base font-semibold">Edit Skills</h2>
        <p className="mb-4 text-sm text-muted">Pick the skills on your profile. Up to 100 characters in total.</p>
        <TagPicker
          options={SKILLS}
          searchOptions={MORE_SKILLS}
          value={skills}
          onChange={setSkills}
          recommendations={RECOMMENDATIONS}
          maxChars={100}
          allowCustom
        />
      </section>
    </main>
  );
}
