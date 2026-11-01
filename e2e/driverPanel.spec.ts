import { expect, test } from "@playwright/test";
import { openApp, runRecord } from "./helpers";

test("each available transition's bar and red strip match the current state", async ({ page }) => {
  await openApp(page);

  const seen = new Set<string>();
  const widths = new Set<string>();
  for (let i = 0; i < 40 && (seen.size < 2 || widths.size < 3); i++) {
    // Reads everything in one evaluate, so the display and state are from the same frame.
    const frame = await page.evaluate(() => {
      const state = window.flySim.current()?.transitions[0];
      if (!state) throw new Error("expected an available transition");
      const row = document.querySelector<HTMLElement>(`[data-transition="${state.transition}"]`);
      const widthOf = (driver: string): number =>
        parseFloat(
          row?.querySelector<HTMLElement>(`[data-driver="${driver}"]`)?.style.width ?? "NaN",
        );
      return {
        state,
        available: row?.dataset["available"],
        spontaneousWidth: widthOf("spontaneous"),
        arousalWidth: widthOf("arousal"),
        strip: parseFloat(row?.querySelector<HTMLElement>(".strip")?.style.opacity ?? "NaN"),
      };
    });

    seen.add(frame.state.transition);
    widths.add(frame.arousalWidth.toFixed(3));
    expect(frame.available).toBe("true");
    expect(frame.strip).toBeCloseTo(frame.state.fireProbabilityNextMinute, 6);
    // A full bar is a hazard of 0.3 per second, so each segment's width measures its contribution.
    expect(frame.spontaneousWidth).toBeCloseTo(
      (100 * frame.state.contributions.spontaneous) / 0.3,
      3,
    );
    expect(frame.arousalWidth).toBeCloseTo((100 * frame.state.contributions.arousal) / 0.3, 3);
    await page.waitForTimeout(500);
  }

  expect(seen.size).toBeGreaterThanOrEqual(2);
  expect(widths.size).toBeGreaterThanOrEqual(3);
});

test("flashes match the transitions recorded in the run record", async ({ page }) => {
  await openApp(page);
  await expect
    .poll(() => page.evaluate(() => window.flySim.flashes().length), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);

  const flashes = await page.evaluate(() => window.flySim.flashes());
  const record = await runRecord(page);
  // The record is fetched after the flashes, so it may have gone further.
  expect(
    record.firedTransitions
      .slice(0, flashes.length)
      .map(({ step, transition }) => ({ step, transition })),
  ).toEqual(flashes);
});

test("a firing visibly flashes its row", async ({ page }) => {
  await openApp(page);
  const flashObserved = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const poll = (): void => {
          const peak = Math.max(
            ...[...document.querySelectorAll(".flash")].map((flash) =>
              parseFloat(getComputedStyle(flash).opacity),
            ),
          );
          if (peak > 0.2) resolve(peak);
          else requestAnimationFrame(poll);
        };
        poll();
      }),
  );
  expect(await flashObserved).toBeGreaterThan(0.2);
});

test("numbers appear only on hover", async ({ page }) => {
  await openApp(page);
  const panel = page.locator("#drivers");

  await expect(panel.locator(".transition").first()).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/\d/);

  // Retries because the available transition can change between finding it and hovering it.
  await expect(async () => {
    await panel.locator('[data-available="true"]').first().hover();
    await expect(panel.locator(".tooltip")).toBeVisible();
    expect(await panel.innerText()).toMatch(/\d/);
  }).toPass();

  await page.mouse.move(5, 5);
  await expect(panel.locator(".tooltip")).toBeHidden();
  expect(await panel.innerText()).not.toMatch(/\d/);
});
