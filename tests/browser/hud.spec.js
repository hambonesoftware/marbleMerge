import { test, expect } from "@playwright/test";

test("broadcast HUD exposes real game controls on an iPhone",async ({page})=>{
  await page.goto("/");
  await expect(page.locator("#loading")).toHaveClass(/hidden/, {timeout:45000});
  await expect(page.locator(".hb-play--broadcast")).toBeVisible();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator("#play-btn")).toBeVisible();
  await expect(page.locator(".hb-play__readout")).toHaveCount(3);
  await expect(page.locator("#progress-line")).toBeVisible();

  const h=await page.evaluate(()=>({
    inner:window.innerHeight,
    scroll:document.documentElement.scrollHeight,
    canvas:document.querySelector("#viewport canvas")?.getBoundingClientRect().height
  }));
  expect(h.scroll).toBeLessThanOrEqual(h.inner+3);
  expect(h.canvas).toBeGreaterThan(h.inner*.9);

  await page.locator("#play-btn").click();
  await expect(page.locator(".hb-play")).toHaveAttribute("data-phase","paused");
  await expect(page.locator("#play-btn")).toContainText("RESUME");

  await page.locator("#hb-race-options").click();
  await expect(page.locator(".hb-play__tray")).toBeVisible();
  await expect(page.locator(".camera-btn[data-camera='aerial']")).toBeVisible();
  await page.locator(".camera-btn[data-camera='aerial']").click();
  await expect(page.locator(".camera-btn[data-camera='aerial']")).toHaveClass(/active/);
  await expect(page.locator("#color-choices .color-choice")).toHaveCount(8);
  await page.screenshot({path:"test-results/marble-broadcast-mobile.png"});
  await page.locator(".hb-play__tray-close").click();
  await expect(page.locator(".hb-play__tray")).toBeHidden();
  await page.locator("#play-btn").click();
  await expect(page.locator(".hb-play")).toHaveAttribute("data-phase","playing");
});

test("camera shortcut cycles the existing race camera handlers",async ({page})=>{
  await page.goto("/");
  await expect(page.locator("#loading")).toHaveClass(/hidden/,{timeout:45000});
  await expect(page.locator(".camera-btn[data-camera='chase']")).toHaveClass(/active/);
  await page.locator("#hb-race-camera").click();
  await expect(page.locator(".camera-btn[data-camera='onboard']")).toHaveClass(/active/);
});
