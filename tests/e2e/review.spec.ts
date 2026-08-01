import { expect, test } from "@playwright/test";

const demoUrl = "/?demo=1";

test.describe("OpenDiff guided review", () => {
  test("opens the review overview", async ({ page }) => {
    await page.goto(demoUrl);
    await expect(page.getByTestId("guided-review")).toBeVisible();
    await expect(page.locator("h1").filter({ hasText: "Add coordinated token refresh" })).toBeVisible();
    await expect(page.getByText("Unified diff")).toBeVisible();
  });

  test("scrolls the central diff independently", async ({ page }) => {
    await page.goto(demoUrl);
    const diffScroll = page.locator(".diff-scroll");
    const metrics = await diffScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await diffScroll.hover();
    await page.mouse.wheel(0, 700);
    await expect.poll(() => diffScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test("selects a logical section and reveals its explanation", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("section-nav-item-refresh-coordination").click();
    await expect(page.getByTestId("section-nav-item-refresh-coordination")).toHaveClass(/is-active/);
    await expect(page.getByRole("heading", { name: "Introduce shared refresh coordination" })).toBeVisible();
  });

  test("jumps from a reference to the linked code", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("section-nav-item-refresh-coordination").click();
    await page.getByTestId("reference-ref-refresh-coordinator").click();
    await expect(page).toHaveURL(/#file-refresh-coordinator\//);
    await expect(page.locator(".diff-line-row.is-selected")).toHaveCount(1);
  });

  test("opens and closes a file without losing the review state", async ({ page }) => {
    await page.goto(demoUrl);
    const file = page.locator('[data-testid="diff-file-file-refresh-coordinator"]');
    await file.getByRole("button", { name: /Collapse/ }).click();
    await expect(file.getByText("File collapsed")).toBeVisible();
    await file.getByRole("button", { name: "Show diff" }).click();
    await expect(file.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toBeVisible();
  });

  test("changes context lines", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("context-control").click();
    await page.getByRole("menuitemradio", { name: "8 lines" }).click();
    await expect(page.getByTestId("context-control")).toContainText("8");
  });

  test("persists a line deep link across reloads", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("diff-line-file-refresh-coordinator-refresh-1").click();
    await expect(page).toHaveURL(/#file-refresh-coordinator\//);
    const selected = page.locator(".diff-line-row.is-selected");
    await expect(selected).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".diff-line-row.is-selected")).toHaveCount(1);
  });

  test("shows a stale-review warning", async ({ page }) => {
    await page.goto("/?fixture=stale");
    await expect(page.getByTestId("stale-banner")).toBeVisible();
    await expect(page.getByText("The working tree has changed since this review was generated.")).toBeVisible();
  });

  test("keeps an unresolved reference visible and marked", async ({ page }) => {
    await page.goto("/?fixture=invalid");
    await page.getByTestId("section-nav-item-refresh-coordination").click();
    await expect(page.locator(".review-warning-banner")).toBeVisible();
    await expect(page.locator(".reference-item.is-unresolved")).toHaveCount(1);
  });

  test("persists the active section", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("section-nav-item-request-retry").click();
    await page.reload();
    await expect(page.getByTestId("section-nav-item-request-retry")).toHaveClass(/is-active/);
  });

  test("supports guided keyboard navigation", async ({ page }) => {
    await page.goto(demoUrl);
    await page.locator("body").press("j");
    await expect(page.getByTestId("section-nav-item-refresh-coordination")).toHaveClass(/is-active/);
    await page.locator("body").press("j");
    await expect(page.getByTestId("section-nav-item-request-retry")).toHaveClass(/is-active/);
    await page.locator("body").press("Escape");
    await expect(page.getByTestId("overview-nav-item")).toHaveClass(/is-active/);
  });

  test("explains missing review data instead of silently showing a demo", async ({ page }) => {
    await page.goto("/?fixture=missing");
    await expect(page.getByTestId("load-error")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No OpenDiff review was found" })).toBeVisible();
  });

  test("renders rename, deleted, and lockfile metadata", async ({ page }) => {
    await page.goto("/?fixture=rename");
    await expect(page.locator(".file-status-text-renamed")).toHaveCount(1);
    await expect(page.locator(".file-rename-source")).toBeVisible();
    await page.goto("/?fixture=deleted");
    await expect(page.locator(".file-status-text-deleted")).toHaveCount(1);
    await page.goto("/?fixture=lockfile");
    await expect(page.getByText("lockfile", { exact: true })).toBeVisible();
  });

  test("virtualizes a long diff file", async ({ page }) => {
    await page.goto("/?fixture=large");
    await expect(page.locator(".diff-code-virtualized")).toBeVisible();
    const renderedRows = await page.locator(".virtual-diff-row").count();
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(1200);
  });
});
