import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PARAMETERS, MODEL_VERSION } from "../src/engine";
import { REPORT_PATH, type ValidationReport } from "../src/validation/report";
import { currentTime, interventionCount, openApp } from "./helpers";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/validation-report.json", import.meta.url), "utf8"),
) as ValidationReport;

/** The fixture, as if made by the model as it is now, so it isn't stale. */
const current: ValidationReport = {
  ...fixture,
  modelVersion: MODEL_VERSION,
  parameters: DEFAULT_PARAMETERS,
};

/** Serves a report at the path the view reads it from, or a 404 if there's none. */
async function serveReport(page: Page, report: ValidationReport | null): Promise<void> {
  await page.route(`**/${REPORT_PATH}`, (route) =>
    report === null
      ? route.fulfill({ status: 404, body: "Not found" })
      : route.fulfill({ contentType: "application/json", body: JSON.stringify(report) }),
  );
}

const tip = (page: Page) => page.locator("#validation .chart-tip");

test("the validation control opens a chart per target over the Room, which runs on, and leads back", async ({
  page,
}) => {
  await serveReport(page, current);
  await openApp(page, 42);
  const control = page.locator("#validation-open");
  await expect(control.locator("svg")).toBeVisible();
  await expect(control).toHaveAccessibleName("Validation");
  await expect(control).toHaveAttribute("title", /published data/);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(5);
  // Anything that reloaded the page would lose this.
  await page.evaluate(() => {
    (window as unknown as { marker: number }).marker = 1;
  });

  await control.click();
  const view = page.locator("#validation");
  await expect(view).toBeVisible();

  await expect(page.locator("#validation-model")).toHaveText(MODEL_VERSION);
  await expect(page.locator("#validation-seeds")).toHaveText("1–8");
  await expect(page.locator("#validation-step")).toHaveText("20 ms");
  await expect(page.locator("#validation-made time")).toHaveAttribute(
    "datetime",
    fixture.generatedAt,
  );
  await expect(page.locator("#validation-stale")).toBeHidden();

  // One chart per target, each with its result, and the held-out one marked.
  await expect(view.locator("[data-target-id]")).toHaveCount(fixture.targets.length);
  for (const target of fixture.targets) {
    const chart = view.locator(`[data-target-id="${target.id}"]`);
    await expect(chart.locator("svg.chart")).toBeVisible();
    await expect(chart).toContainText(target.title);
    await expect(chart).toContainText(target.citation);
    await expect(chart.locator(".result")).toHaveAttribute(
      "data-result",
      target.result.pass ? "pass" : "fail",
    );
    await expect(chart).toContainText(target.result.description);
    await expect(chart.locator(".held-out")).toHaveCount(target.heldOut ? 1 : 0);
  }
  await expect(view.locator('[data-target-id="example-sleep-profile"] .held-out')).toBeVisible();

  // Numbers show on hover: a fly's, the pooled value, and the published value with its source.
  const daily = view.locator('[data-target-id="example-daily-sleep"]');
  await daily.locator('[data-mark="fly"][data-seed="5"] .fly').hover();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText("Seed 5");
  await expect(tip(page)).toContainText("610 min");
  await daily.locator('[data-mark="pooled"]').hover();
  await expect(tip(page)).toContainText("Pooled");
  await expect(tip(page)).toContainText("693 min");
  await daily.locator('[data-mark="published"] circle:not(.hit)').hover();
  await expect(tip(page)).toContainText("720 min ± 60 SD");
  await expect(daily.locator(".chart-legend")).toContainText("Published ± SD");
  await expect(tip(page)).toContainText("n 32");
  await expect(tip(page)).toContainText("Figure 1A");
  const profile = view.locator('[data-target-id="example-sleep-profile"]');
  await profile.locator('[data-bin="17"]').hover();
  await expect(tip(page)).toContainText("ZT17");
  await expect(tip(page)).toContainText("min per hour");
  await expect(tip(page)).toContainText("Canton-S males54 ± 3 SEM");
  await expect(tip(page)).toContainText("n 24");
  await expect(tip(page)).toContainText("Pooled55");
  await expect(tip(page)).toContainText("Seed 354");

  // The Room ran on underneath.
  const whileOpen = await currentTime(page);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(whileOpen + 2);

  await page.locator("#validation-back").click();
  await expect(view).toBeHidden();
  await expect(page.locator("#scene")).toBeVisible();
  const afterClosing = await currentTime(page);
  expect(afterClosing).toBeGreaterThan(whileOpen);
  await expect.poll(() => currentTime(page)).toBeGreaterThan(afterClosing + 2);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  expect(await page.evaluate(() => window.flySim.seed)).toBe(42);
  expect(await interventionCount(page)).toBe(0);
});

test("the view lists the model's relationships by label, with the source of an Established one", async ({
  page,
}) => {
  await serveReport(page, current);
  await page.goto("/?view=validation");
  const section = page.locator("#validation-relationships");
  await expect(section).toBeVisible();
  const group = (status: string) => section.locator(`.relationship-group[data-status="${status}"]`);
  await expect(group("established").locator("h3")).toContainText("Established");
  await expect(group("established").locator("li")).toHaveCount(1);
  await expect(group("provisional").locator("li")).toHaveCount(2);
  await expect(group("hypothesis").locator("li")).toHaveCount(2);
  await expect(group("hypothesis")).toContainText("arousalTimeConstantSeconds");
  await expect(group("hypothesis")).toContainText("Arousal: Immobility → walking");

  await group("established")
    .locator('[data-relationship="immobility-to-sleeping circadian"]')
    .hover();
  await expect(tip(page)).toContainText("Circadian Clock: Immobility → sleeping");
  await expect(tip(page)).toContainText("siesta");
  // The source is the target it cites.
  const profile = fixture.targets.find((each) => each.id === "example-sleep-profile");
  await expect(tip(page)).toContainText(profile?.citation ?? "missing");
});

test("the view charts where each assay's Scored Sleep disagrees with true sleep, across the day", async ({
  page,
}) => {
  await serveReport(page, current);
  await page.goto("/?view=validation");
  const section = page.locator("#validation-disagreement");
  await expect(section).toContainText("Scoring Disagreement");
  await expect(page.locator("#disagreement-note")).toContainText(
    "a measure of the 5-minute rule, not a Validation Target",
    { ignoreCase: true },
  );
  const assay = section.locator('[data-disagreement-id="example-daily-sleep"]');
  await expect(assay).toContainText("Example 2020: beam monitor, 60 s bins");
  await expect(
    assay.locator('.disagreement-figure[data-direction="awakeScoredAsSleep"]'),
  ).toContainText("20% of Scored Sleep");
  await expect(
    assay.locator('.disagreement-figure[data-direction="sleepNotScored"]'),
  ).toContainText("10% of true sleep");

  // As time, with each hour's numbers on hover.
  const minutes = assay.locator('[data-scale-chart="minutes"]');
  await expect(minutes.locator("svg.chart")).toBeVisible();
  await expect(minutes.locator(".pooled-line")).toHaveCount(2);
  await minutes.locator('[data-bin="6"]').hover();
  await expect(tip(page)).toContainText("ZT6–7");
  await expect(tip(page)).toContainText("min per hour");
  await expect(tip(page)).toContainText("Awake, scored as sleep67.5");
  await expect(tip(page)).toContainText("flies 45–90");

  // And as bouts.
  await assay.getByRole("button", { name: "Bouts" }).click();
  await expect(minutes).toBeHidden();
  const bouts = assay.locator('[data-scale-chart="bouts"]');
  await expect(bouts.locator("svg.chart")).toBeVisible();
  await bouts.locator('[data-bin="14"]').hover();
  await expect(tip(page)).toContainText("bouts per hour");
  await expect(tip(page)).toContainText("Asleep, not scored7.5");
});

test("a report from another model version, or other parameters, is marked stale", async ({
  page,
}) => {
  await serveReport(page, { ...current, modelVersion: "0.0.1" });
  await page.goto("/?view=validation");
  await expect(page.locator("#validation-stale")).toBeVisible();
  await expect(page.locator("#validation-stale")).toContainText("Stale");
  await expect(page.locator("#validation-stale")).toContainText("0.0.1");
  await expect(page.locator("#validation-model")).toHaveText("0.0.1");
  // Stale reports still show their charts.
  await expect(page.locator("[data-target-id]")).toHaveCount(fixture.targets.length);

  await page.unrouteAll();
  await serveReport(page, {
    ...current,
    parameters: { ...DEFAULT_PARAMETERS, initialArousal: DEFAULT_PARAMETERS.initialArousal + 0.1 },
  });
  await page.reload();
  await expect(page.locator("#validation-stale")).toContainText("initialArousal");
});

test("with no report, the view says which command makes one and draws no chart", async ({
  page,
}) => {
  await serveReport(page, null);
  await openApp(page);
  await page.locator("#validation-open").click();
  const message = page.locator("#validation-message");
  await expect(message).toContainText("npm run validate");
  await expect(message).toContainText("repo root");
  await expect(page.locator("#validation svg.chart")).toHaveCount(0);
  await expect(page.locator("#validation [data-target-id]")).toHaveCount(0);
  await expect(page.locator("#validation-stale")).toBeHidden();
});

test("the address can open the app straight onto the view, keeping its other settings", async ({
  page,
}) => {
  await serveReport(page, current);
  await page.goto("/?seed=7&speed=10&view=validation");
  await expect(page.locator("#validation")).toBeVisible();
  await expect(page.locator("[data-target-id]")).toHaveCount(fixture.targets.length);
  // The Room started underneath, with the address's settings.
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.flySim.seed)).toBe(7);
  await expect(page.locator("#speed-readout")).toHaveText("10×");

  await page.keyboard.press("Escape");
  await expect(page.locator("#validation")).toBeHidden();
  // Reloading now shows the Room, with the same settings.
  expect(new URL(page.url()).searchParams.has("view")).toBe(false);
  expect(new URL(page.url()).searchParams.get("seed")).toBe("7");

  // Another view, which this version doesn't have, leaves the settings working.
  await page.goto("/?seed=9&view=nonsense");
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator("#validation")).toBeHidden();
  expect(await page.evaluate(() => window.flySim.seed)).toBe(9);
});
