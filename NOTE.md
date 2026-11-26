# Tag picker — what I changed

The starting picker already had good bones: tag matching, the character budget and recommendations all
lived in `lib/tags.ts`. So I left that logic alone and worked on how it feels to use, mostly with a
keyboard, on a phone and with a screen reader. Run it with `npm install` and `npm run dev`.

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

## What I'd do with more time

- **Tests.** Unit tests for `lib/tags.ts` (budget edge cases, word-order matching, ranking), plus
  Playwright tests for the keyboard flows. I checked those flows by hand and with a quick script, not
  a committed suite.
- **Drag to reorder tags.** Profiles often want "main skill first". That means dropping the
  alphabetical order, which is a product decision, so I didn't change it on my own.
- **Grouping in search** ("In your list" / "More skills" / "Create") once the catalogue grows.
- **Fuzzy matching for typos** ("javscript"). The current every-word matching is predictable, and
  fuzzy matching needs tuning so it doesn't surface noise.
- **Pasting a long list.** Show a summary ("Added 6, 2 didn't fit") instead of one refusal message.
- **A proper screen reader pass** with VoiceOver and NVDA. I followed the ARIA combobox pattern but
  haven't tested it on real assistive tech.
