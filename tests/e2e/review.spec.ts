import { expect, test } from "@playwright/test";

const demoUrl = "/?demo=1";

test.describe("OpenDiffs guided review", () => {
  test("opens the Linear-style guided review", async ({ page }) => {
    await page.goto(demoUrl);

    await expect(page.getByTestId("guided-review")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Add coordinated token refresh/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Guide" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("01 / 04")).toBeVisible();
  });

  test("switches between Activity, Diff, and Guide views", async ({ page }) => {
    await page.goto(demoUrl);

    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("button", { name: "Activity", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("activity-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review activity" })).toBeVisible();

    await page.getByRole("button", { name: "Diff", exact: true }).click();
    await expect(page.getByRole("button", { name: "Diff", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("diff-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "All changes" })).toBeVisible();
    await expect(page.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toBeVisible();

    await page.getByRole("button", { name: "Guide", exact: true }).click();
    await expect(page.getByRole("button", { name: "Guide", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("01 / 04")).toBeVisible();
  });

  test("scrolls one continuous guided document", async ({ page }) => {
    await page.goto(demoUrl);
    const guide = page.locator(".lg-guide-scroll");
    const metrics = await guide.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await guide.hover();
    await page.mouse.wheel(0, 800);
    await expect.poll(() => guide.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test("activates a logical section without replacing the page", async ({ page }) => {
    await page.goto(demoUrl);
    const section = page.getByTestId("section-nav-item-request-retry");

    await section.getByRole("heading", { name: "Retry the failed authenticated request" }).click();

    await expect(section).toHaveClass(/is-active/);
    await expect(page.getByTestId("section-nav-item-refresh-coordination")).not.toHaveClass(/is-active/);
  });

  test("jumps from a guide reference to its linked code", async ({ page }) => {
    await page.goto(demoUrl);

    await page.getByTestId("reference-ref-refresh-coordinator").click();

    await expect(page).toHaveURL(/#file-refresh-coordinator\/refresh-1/);
    await expect(page.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toBeVisible();
    await expect(page.locator(".diff-line-row.is-selected")).toHaveCount(1);
  });

  test("collapses and reopens a diff file", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("reference-ref-refresh-coordinator").click();
    const file = page.getByTestId("diff-file-file-refresh-coordinator");

    await file.getByRole("button", { name: "Collapse src/auth/refreshCoordinator.ts" }).click();
    await expect(file.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toHaveCount(0);
    await file.getByRole("button", { name: "Expand src/auth/refreshCoordinator.ts" }).click();

    await expect(file.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toBeVisible();
  });

  test("changes the amount of diff context from display settings", async ({ page }) => {
    await page.goto(demoUrl);

    await page.getByRole("button", { name: "Diff display settings" }).click();
    await page.getByRole("menuitemradio", { name: "8 lines" }).click();

    await expect(page.getByTestId("context-control")).toContainText("8");
    await expect(page.getByRole("menuitemradio", { name: "8 lines" })).toHaveAttribute("aria-checked", "true");
  });

  test("switches to a split diff and toggles line wrapping", async ({ page }) => {
    // Given an expanded file in the guided review
    await page.goto(demoUrl);
    await page.getByTestId("reference-ref-refresh-coordinator").click();

    // When the reviewer changes the display options
    await page.getByRole("button", { name: "Diff display settings" }).click();
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await page.getByRole("switch", { name: "Wrap lines" }).click();

    // Then the file uses the split layout and wrapping is enabled
    await expect(page.locator(".lg-split-code")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Wrap lines" })).toHaveAttribute("aria-checked", "true");
  });

  test("persists reviewed files across reloads", async ({ page }) => {
    // Given an expanded file that has not been reviewed
    await page.goto(demoUrl);
    await page.getByTestId("reference-ref-refresh-coordinator").click();
    const file = page.getByTestId("diff-file-file-refresh-coordinator");

    // When the reviewer marks it as reviewed and reloads
    await file.getByRole("button", { name: "Reviewed" }).click();
    await expect(file.getByRole("button", { name: "Reviewed" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();

    // Then the reviewed state is restored
    await expect(page.getByTestId("diff-file-file-refresh-coordinator").getByRole("button", { name: "Reviewed" })).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps the guided review usable on a narrow viewport", async ({ page }) => {
    // Given a phone-sized viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(demoUrl);

    // When display settings are opened
    await page.getByRole("button", { name: "Diff display settings" }).click();

    // Then content stays within the viewport and split mode is unavailable
    await expect(page.getByRole("button", { name: "Split", exact: true })).toBeDisabled();
    await expect.poll(() => page.locator(".lg-guide-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test("restores a selected line deep link after reload", async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByTestId("reference-ref-refresh-coordinator").click();
    await expect(page.locator(".diff-line-row.is-selected")).toHaveCount(1);

    await page.reload();

    await expect(page.getByTestId("diff-line-file-refresh-coordinator-refresh-1")).toBeVisible();
    await expect(page.locator(".diff-line-row.is-selected")).toHaveCount(1);
  });

  test("shows a stale-review warning", async ({ page }) => {
    await page.goto("/?fixture=stale");

    await expect(page.getByTestId("stale-banner")).toBeVisible();
    await expect(page.getByText("The working tree has changed since this review was generated.")).toBeVisible();
  });

  test("keeps an unresolved reference visible and marked", async ({ page }) => {
    await page.goto("/?fixture=invalid");

    await expect(page.locator(".review-warning-banner")).toBeVisible();
    await expect(page.locator(".reference-item.is-unresolved")).toHaveCount(1);
  });

  test("persists the active section", async ({ page }) => {
    await page.goto(demoUrl);
    const section = page.getByTestId("section-nav-item-request-retry");
    await section.getByRole("heading", { name: "Retry the failed authenticated request" }).click();
    await expect(section).toHaveClass(/is-active/);

    await page.reload();

    await expect(page.getByTestId("section-nav-item-request-retry")).toHaveClass(/is-active/);
  });

  test("supports guided keyboard navigation", async ({ page }) => {
    await page.goto(demoUrl);

    await page.locator("body").press("j");
    await expect(page.getByTestId("section-nav-item-request-retry")).toHaveClass(/is-active/);
    await page.locator("body").press("k");

    await expect(page.getByTestId("section-nav-item-refresh-coordination")).toHaveClass(/is-active/);
  });

  test("explains missing review data instead of silently showing a demo", async ({ page }) => {
    await page.goto("/?fixture=missing");

    await expect(page.getByTestId("load-error")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No OpenDiffs review was found" })).toBeVisible();
  });
});
