import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The app starts with Figma and React selected (10 of 100 characters).
const input = (page: Page) => page.getByRole("combobox", { name: "Add a skill" });
const chips = (page: Page) => page.getByRole("button", { name: /^Remove / });
/** The draggable part of a selected tag (the list under the box has a button with the same name). */
const handle = (page: Page, name: string) => page.locator('[aria-roledescription="sortable"]', { hasText: new RegExp(`^${name}$`) });
const notice = (page: Page) => page.getByTestId("notice");
const chipNames = async (page: Page) =>
  (await chips(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.replace(/^Remove /, ""))));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(chips(page)).toHaveCount(2);
});

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard flows are desktop-only");

  test("arrow keys pick a suggestion", async ({ page }) => {
    await input(page).fill("typesc");
    await input(page).press("ArrowDown");
    await expect(page.getByRole("option", { name: "TypeScript" })).toHaveAttribute("aria-selected", "true");
    await input(page).press("Enter");
    expect(await chipNames(page)).toEqual(["Figma", "React", "TypeScript"]);
    await expect(input(page)).toHaveValue("");
  });

  test("a typo is corrected: 'javscript' + Enter adds JavaScript", async ({ page }) => {
    await input(page).fill("javscript");
    await expect(page.getByRole("group", { name: "Did you mean" })).toBeVisible();
    await expect(page.getByRole("option", { name: "JavaScript" })).toHaveAttribute("aria-selected", "true");
    await input(page).press("Enter");
    expect(await chipNames(page)).toEqual(["Figma", "React", "JavaScript"]);
  });

  test("the typo can still be kept on purpose, via Create", async ({ page }) => {
    await input(page).fill("javscript");
    await input(page).press("ArrowDown");
    await expect(page.getByRole("option", { name: /Create/ })).toHaveAttribute("aria-selected", "true");
    await input(page).press("Enter");
    expect(await chipNames(page)).toContain("javscript");
  });

  test("results are grouped", async ({ page }) => {
    await input(page).fill("figma");
    await expect(page.getByRole("group", { name: "More skills" }).getByRole("option", { name: "Figma setup" })).toBeVisible();
    await input(page).fill("design");
    await expect(page.getByRole("group", { name: "In the list" })).toBeVisible();
    await expect(page.getByRole("group", { name: "More skills" })).toBeVisible();
  });

  test("Backspace twice removes the last tag, and Undo puts it back in place", async ({ page }) => {
    await input(page).click();
    await input(page).press("Backspace");
    await expect(page.getByText("Press Backspace again to remove the last tag.")).toBeVisible();
    await expect(chips(page)).toHaveCount(2);
    await input(page).press("Backspace");
    expect(await chipNames(page)).toEqual(["Figma"]);
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await chipNames(page)).toEqual(["Figma", "React"]);
  });

  test("a tag can be moved with the keyboard", async ({ page }) => {
    await handle(page, "Figma").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect.poll(() => chipNames(page)).toEqual(["React", "Figma"]);
  });

  test("removing a tag with × keeps focus in the picker", async ({ page }) => {
    await page.getByRole("button", { name: "Remove Figma" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Remove React" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(input(page)).toBeFocused();
  });

  test("Sort A–Z keeps focus in the picker", async ({ page }) => {
    await input(page).fill("CSS");
    await input(page).press("Enter");
    await page.getByRole("button", { name: "Sort A–Z" }).focus();
    await page.keyboard.press("Enter");
    await expect(input(page)).toBeFocused();
  });

  test("Escape cancels a keyboard move", async ({ page }) => {
    await handle(page, "Figma").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect.poll(() => chipNames(page)).toEqual(["Figma", "React"]);
    await expect(page.getByText("Moving cancelled. Figma stays at position 1 of 2.")).toBeAttached();
  });

  test("Escape clears the text, then closes", async ({ page }) => {
    await input(page).fill("fig");
    await expect(page.getByRole("listbox")).toBeVisible();
    await input(page).press("Escape");
    await expect(input(page)).toHaveValue("");
    await expect(page.getByRole("listbox")).toBeHidden();
  });
});

test("pasting a list adds everything that fits and says what didn't", async ({ page }) => {
  await input(page).click();
  await input(page).evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, "• TypeScript\n• css\n• Figma\n• Interaction design\n• Information architecture\n• Adobe Illustrator\n• HTML");
  // 10 used + TypeScript 10 + CSS 3 + Interaction design 18 + Information architecture 24 + Adobe Illustrator 17
  // + HTML 4 = 86, so all six new ones fit; Figma is already there.
  await expect(notice(page)).toContainText("Added 6 · 1 already added");
  expect(await chipNames(page)).toEqual([
    "Figma", "React", "TypeScript", "CSS", "Interaction design", "Information architecture", "Adobe Illustrator", "HTML",
  ]);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await chipNames(page)).toEqual(["Figma", "React"]);
});

test("a pasted list that overflows the limit names what didn't fit", async ({ page }) => {
  await input(page).click();
  await input(page).evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, "Information architecture, Interaction design, Usability testing, Mobile app design, Adobe Illustrator, CSS");
  // 10 + 24 + 18 + 17 + 17 = 86; Adobe Illustrator (17) would make 103; CSS (3) still fits -> 89.
  await expect(notice(page)).toContainText("Added 5 · 1 didn't fit: Adobe Illustrator");
  expect(await chipNames(page)).toContain("CSS");
});

test("Sort A–Z restores alphabetical order, with Undo", async ({ page }) => {
  await input(page).fill("CSS");
  await input(page).press("Enter");
  expect(await chipNames(page)).toEqual(["Figma", "React", "CSS"]);
  await page.getByRole("button", { name: "Sort A–Z" }).click();
  expect(await chipNames(page)).toEqual(["CSS", "Figma", "React"]);
  await expect(page.getByRole("button", { name: "Sort A–Z" })).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await chipNames(page)).toEqual(["Figma", "React", "CSS"]);
});

test("a tag can be dragged with the mouse", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag is desktop-only");
  const from = (await handle(page, "Figma").boundingBox())!;
  const to = (await handle(page, "React").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width - 4, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => chipNames(page)).toEqual(["React", "Figma"]);
});

test("tags that would not fit are disabled, with a reason", async ({ page }) => {
  // Fill to 99 characters with custom tags, then everything longer than 1 character is too long.
  await input(page).fill("x".repeat(30));
  await input(page).press("Enter");
  await input(page).fill("y".repeat(30));
  await input(page).press("Enter");
  await input(page).fill("z".repeat(29));
  await input(page).press("Enter");
  await expect(page.getByText("1 characters left")).toBeVisible();
  const css = page.getByRole("button", { name: "CSS", exact: true }).last();
  await expect(css).toHaveAttribute("aria-disabled", "true");
  await expect(css).toHaveAttribute("title", "Too long for the characters left");
});

test("touch targets are big enough on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  // Tags and pills: 36px tall. The × is 24px, the WCAG 2.2 minimum (2.5.8), and sits away from the label.
  for (const el of [handle(page, "Figma"), page.getByRole("button", { name: "CSS", exact: true }).last()]) {
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  }
  const x = (await page.getByRole("button", { name: "Remove Figma" }).boundingBox())!;
  expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(24);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("accessibility scan (axe)", () => {
  const scan = async (page: Page) => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  };

  test("light mode", async ({ page }) => {
    await page.getByRole("button", { name: "Light" }).click();
    await scan(page);
  });

  test("dark mode", async ({ page }) => {
    await page.getByRole("button", { name: "Dark" }).click();
    await scan(page);
  });

  test("with suggestions open", async ({ page }) => {
    await input(page).fill("design");
    await expect(page.getByRole("listbox")).toBeVisible();
    await scan(page);
  });

  test("with a typo suggestion and a notice showing", async ({ page }) => {
    await input(page).click();
    await input(page).press("Backspace");
    await input(page).press("Backspace");
    await input(page).fill("javscript");
    await scan(page);
  });
});
