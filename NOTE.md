# Tag picker, round 2

Round 1 ended with a "what I'd do with more time" list. This round builds every item on it. The round 1 note is at the
bottom, unchanged.

Run it with `npm install` and `npm run dev`.
- Unit tests: `npm test`.
- Browser tests: `npx playwright install chromium` once, then `npm run test:e2e`.

## What I built

**1. Tests**
- `src/lib/tags.test.ts`: 50 unit tests (Vitest) for the logic in `lib/tags.ts`. They cover:
  - budget edge cases: exactly at the limit, held tags over the limit, shorter tags after one that didn't fit;
  - word-order matching and ranking;
  - recommendations;
  - the new typo matching, grouping, paste parsing and reordering helpers.
- `e2e/tag-picker.spec.ts`: Playwright tests that drive the real page, on a desktop and a phone (Pixel 7) profile. They
  cover:
  - arrow keys, Enter and Escape;
  - typo correction, and keeping a typo on purpose;
  - grouped results;
  - Backspace twice, then Undo;
  - paste summaries;
  - drag with the mouse and with the keyboard;
  - Sort A–Z;
  - disabled tags at the limit;
  - touch target sizes and no horizontal scroll on a phone;
  - an axe accessibility scan in light mode, dark mode and with the dropdown open.

**2. Drag to reorder**
- Selected tags now keep the order you choose. New tags go at the end, and the form value follows that order.
- You can move a tag with the mouse, by touch, or with the keyboard: focus a tag, press Space, use the arrow keys, then
  press Space again. Escape cancels. Screen readers hear "Picked up Figma, position 1 of 3" and so on.
- I used dnd-kit, a small library built for accessible drag and drop. Keyboard dragging and the announcements are hard
  to get right by hand.
- Each tag has two controls: its label is the drag handle, and the × is a separate button, so pressing Enter on × never
  starts a drag.
- Mouse dragging starts after 5px of movement, so a click is still a click. Touch dragging starts after a 200 ms press,
  so swiping still scrolls the page.
- A "Sort A–Z" link brings back the old alphabetical order in one click, with Undo. It only shows when the list isn't
  already sorted.

**3. Grouped search**
Results are split into "In the list", "More skills" (search-only tags), "Did you mean" and "New tag". Each group is a
labelled `role="group"` inside the listbox, so screen readers announce the group as you arrow into it.

**4. Typo matching**
- "javscript", "typscript" and "figam" now find the right tag under "Did you mean". The matching counts single-letter
  mistakes, including two swapped letters.
- It also works on unfinished words: "javsc" already finds JavaScript.
- When nothing matches exactly, the first "Did you mean" option is highlighted, so Enter adds JavaScript instead of a
  misspelt custom tag. Keeping the typo on purpose is still one ↓ away, through "Create".
- To keep the results free of noise:
  - words under 4 letters allow no typos ("css" never matches "cs");
  - 4 to 7 letters allow one, longer words two;
  - "Did you mean" only appears when there are fewer than 3 exact matches.

**5. Pasting a list**
- Pasting "Figma, React, CSS", one skill per line, or a bulleted or numbered list from a CV adds everything at once.
- One line sums it up, e.g. "Added 5 · 1 didn't fit: Adobe Illustrator · 1 already added", with Undo for the whole
  paste.
- Known tags are stored with their proper spelling ("css" becomes CSS).
- A tag that doesn't fit doesn't block shorter ones after it.
- Typing several tags with commas and pressing Enter works the same way.

**6. Screen reader pass**
- I checked the screen reader side with axe-core (WCAG 2.2 AA rules) in every main state, and read the accessibility
  tree.
- It found one real problem, which was also in round 1: the blue text on light-blue chips was 3.8:1, below the 4.5:1
  AA minimum. I darkened the light-mode blue to `#245fd6` (4.8:1). Dark mode already passed.
- Other fixes from this pass:
  - Options inside the dropdown are no longer separate Tab stops, matching the ARIA combobox pattern.
  - The input now reads out the character count.
  - A message repeated twice ("Added React") is now announced both times.
  - Notices like "Removed X. Undo" stay on screen while the pointer or keyboard focus is on them, instead of
    disappearing after 6 seconds while someone is reaching for Undo.
- What I have **not** done: test with VoiceOver and NVDA themselves. I work on Linux, so I don't have them. Automated
  checks catch a lot, but not everything, so this is still the first thing I'd do next.

## Decisions and trade-offs

- **Order is now the user's.** The trade-off: lists are no longer tidy by default. I added Sort A–Z so nobody loses
  that option.
- **Undo restores the exact previous list.** Before, Undo re-added the tag at its alphabetical spot. With reordering,
  that would lose the position, so Undo now returns the whole list as it was.
- **One new runtime dependency (dnd-kit, about 15 KB gzipped).** Writing accessible drag and drop by hand would be more
  code and more risk.
- **Typo matching is my own small function, not a fuzzy-search library.** The catalogue is small, the rules fit in one
  function, and they're easy to test and tune.
- **Typo matching never changes what you typed by itself.** It only suggests. Enter takes the suggestion when it's
  highlighted, and you can always see what will be added.

## What I'd still do

- Test with VoiceOver and NVDA on real devices.
- Keep a recent-skills list, and show recommendations based on the person's role.
- Load search results from a server once the catalogue grows. The grouping and ranking functions are already pure, so
  they'd move over as they are.

---

# Round 1 note (as sent)

The starting picker already had good bones: tag matching, the character budget and recommendations all
lived in `lib/tags.ts`. So I left that logic alone and worked on how it feels to use, mostly with a
keyboard, on a phone and with a screen reader.

## What I changed, and why

**1. Arrow keys work in the suggestions.**
Before, Enter could only add the exact text you had typed. To pick "TypeScript" after typing "typesc",
you had to grab the mouse. Now ↑/↓ moves through the suggestions and Enter adds the highlighted one.
`aria-activedescendant` points at the highlighted option, so screen readers follow along. A small hint
(↑ ↓ · Enter · Esc) shows on desktop.

**2. Matches are bolded.**
Search also checks hidden keywords and words in any order. Bolding the matched part shows *why*
something came up, so a surprising result doesn't look like a bug.

**3. Custom tags show up as a visible "Create '…'" option.**
Custom tags used to exist only as an Enter shortcut behind the "No matches" text. Now there is a
visible option to pick. It is hidden while the text is clearly the start of an existing tag
("typesc" → TypeScript), so it doesn't compete with the real match.

**4. Removing a tag is safer.**
- Backspace on an empty box used to delete the last tag at once. When you're deleting a typo and hit
  one key too many, that loses a tag. Now the first Backspace marks the last tag (red ring plus a
  hint) and the second removes it. This is the common pattern in Gmail and Slack.
- Every removal shows "Removed 'X'. Undo" for 5 seconds.

**5. The character limit is easier to read.**
- A thin bar under the box fills up and turns amber past 80% and red at the limit. A plain-language
  "N characters left" sits next to the exact count.
- Tags that would no longer fit are greyed out, with a tooltip saying why. Before, you only found out
  after clicking, when it was refused.

**6. It works on phones and with screen readers.**
- Pills are at least 36px tall on touch screens (compact again on desktop). The × buttons are 24px
  instead of a 12px icon.
- Tapping anywhere in the box focuses the input. The mobile keyboard shows a "done" key.
- The input has a real label.
- A polite live region announces additions, removals and refusals, which were silent for screen
  reader users.
- Pills in the list use `aria-pressed`, so their on/off state is announced.

**7. Smaller fixes.**
- The theme follows the system setting on first visit and remembers your choice.
- Custom (searchable-only) tags now show their proper label in chips.
- There is a focus ring around the whole box.

## What I'd do with more time (round 1 list, all built in round 2)

- **Tests.** Unit tests for `lib/tags.ts` (budget edge cases, word-order matching, ranking), plus
  Playwright tests for the keyboard flows.
- **Drag to reorder tags.**
- **Grouping in search** ("In your list" / "More skills" / "Create").
- **Fuzzy matching for typos** ("javscript").
- **Pasting a long list.** Show a summary ("Added 6, 2 didn't fit").
- **A proper screen reader pass** with VoiceOver and NVDA.
