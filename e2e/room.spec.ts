import { expect, test } from "@playwright/test";
import { distinctColours, openApp, runRecord } from "./helpers";

test("opening the app shows the Room running with the fly moving in it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await openApp(page);

  // A blank or failed WebGL canvas would have only one or two colours.
  await expect.poll(() => distinctColours(page, "#scene")).toBeGreaterThan(20);

  const room = (await runRecord(page)).room;
  expect(room).toEqual({ widthMetres: 1, depthMetres: 1, heightMetres: 0.6 });

  const start = await page.evaluate(() => window.flySim.flyScenePosition());
  expect(start.x).toBeGreaterThanOrEqual(0);
  expect(start.x).toBeLessThanOrEqual(room.widthMetres);
  expect(start.y).toBeGreaterThanOrEqual(0);
  expect(start.y).toBeLessThanOrEqual(room.heightMetres);
  expect(start.z).toBeGreaterThanOrEqual(0);
  expect(start.z).toBeLessThanOrEqual(room.depthMetres);

  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => window.flySim.flyScenePosition());
        return Math.hypot(now.x - start.x, now.y - start.y, now.z - start.z);
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
