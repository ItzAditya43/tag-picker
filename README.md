# Tag Picker

A skills tag picker for a profile form: search with typo tolerance, grouped results, paste a whole list, drag (or
keyboard) to reorder, a character budget, Undo, light and dark themes. Built for a design exercise; round 2 of the
review.

**Live demo: https://itzaditya43.github.io/tag-picker/**

![Demo: typo correction, grouped results, pasting a list, drag and keyboard reordering, Undo, Sort A–Z](docs/demo.gif)

## Run it

```
npm install
npm run dev
```

## Tests

```
npm test                                   # 50 unit tests (Vitest)
npx playwright install chromium            # once
npm run test:e2e                           # 21 browser tests on desktop and phone, with axe accessibility scans
```

## Read next

- [NOTE.md](NOTE.md): what was built in round 2, how to review it in 5 minutes, decisions and trade-offs.
- [TASK.md](TASK.md): the original exercise.

Code: the logic is in [`src/lib/tags.ts`](src/lib/tags.ts) (no React, fully unit-tested); the UI is in
[`src/TagPicker.tsx`](src/TagPicker.tsx) and [`src/SortableChip.tsx`](src/SortableChip.tsx).
