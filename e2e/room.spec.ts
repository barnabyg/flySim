import { expect, test } from "@playwright/test";
import { distinctColours, openApp, runRecord } from "./helpers";

test("opening the app shows the Room running with the fly moving on its floor", async ({
  page,
}) => {
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
  expect(start.y).toBe(0);

  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => window.flySim.flyScenePosition());
        return Math.hypot(now.x - start.x, now.z - start.z);
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
