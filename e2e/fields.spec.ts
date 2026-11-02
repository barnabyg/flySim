import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

/** Counts pixels of each field's overlay colour in the main view. */
async function overlayPixels(page: Page): Promise<{ odour: number }> {
  const png = await page.locator("#scene").screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let odour = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      // Olive green: green well above blue and above red, which the grey Room never is.
      if (g > r + 8 && g > b + 30) odour += 1;
    }
    return { odour };
  }, png.toString("base64"));
}

test("a toggle shows and hides the Odour Field in the main view", async ({ page }) => {
  await openApp(page);
  await page.locator("#pause").click();
  const toggle = page.locator("#fields");
  await expect(toggle).toHaveAccessibleName("Show the fields");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const hidden = await overlayPixels(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAccessibleName("Hide the fields");
  await expect
    .poll(async () => (await overlayPixels(page)).odour)
    .toBeGreaterThan(hidden.odour + 2000);
  expect(await page.evaluate(() => window.flySim.fields())).toEqual({ visible: true });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await overlayPixels(page)).odour).toBeLessThan(hidden.odour + 200);
  expect(await page.evaluate(() => window.flySim.fields())).toEqual({ visible: false });
});
