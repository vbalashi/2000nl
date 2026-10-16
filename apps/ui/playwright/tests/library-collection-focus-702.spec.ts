import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("collection membership refresh keeps focus in the actual Library picker", async ({ page }) => {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer",
  });

  let holdNextMembershipRead = false;
  let releaseMembershipRead!: () => void;
  let signalMembershipReadStarted!: () => void;
  const membershipReadStarted = new Promise<void>((resolve) => {
    signalMembershipReadStarted = resolve;
  });
  const membershipReadGate = new Promise<void>((resolve) => {
    releaseMembershipRead = resolve;
  });

  await page.route("**/rest/v1/rpc/**", async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON() as Record<string, unknown>;

    if (url.pathname.endsWith("/rpc/get_available_word_lists")) {
      if (body.p_list_type === "user") {
        await route.fulfill({
          json: [{
            id: "book-1",
            name: "Book 1",
            language_code: "nl",
            user_word_list_items: [{ count: 0 }],
          }],
        });
        return;
      }
      await route.fallback();
      return;
    }

    if (url.pathname.endsWith("/rpc/get_user_list_memberships_for_entries")) {
      if (holdNextMembershipRead) {
        holdNextMembershipRead = false;
        signalMembershipReadStarted();
        await membershipReadGate;
        const entryIds = Array.isArray(body.p_entry_ids)
          ? body.p_entry_ids.filter((id): id is string => typeof id === "string")
          : [];
        await route.fulfill({
          json: entryIds.map((entryId) => ({
            entry_id: entryId,
            lists: [{ id: "book-1", kind: "user", name: "Book 1", editable: true }],
          })),
        });
        return;
      }

      const entryIds = Array.isArray(body.p_entry_ids)
        ? body.p_entry_ids.filter((id): id is string => typeof id === "string")
        : [];
      await route.fulfill({
        json: entryIds.map((entryId) => ({ entry_id: entryId, lists: [] })),
      });
      return;
    }

    if (url.pathname.endsWith("/rpc/add_entry_to_user_list")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fallback();
  });

  // The harness navigates before route overrides are installed; reload so the
  // actual app requests the seeded test collection from these local fixtures.
  await page.reload();
  await page.getByRole("button", { name: /Start training|Training starten|Начать тренировку/i }).click();
  await page.getByRole("button", { name: /Show answer|Antwoord tonen|Показать ответ/i }).click();

  const detailsOpener = page.getByRole("button", {
    name: /Word details|Woorddetails|Сведения о слове/i,
  });
  await detailsOpener.click();
  const details = page.getByRole("dialog", {
    name: /Word details|Woorddetails|Сведения о слове/i,
  });
  await expect(details).toBeVisible();
  const openCollections = details.getByRole("button", {
    name: /^(Collections|Collecties|Коллекции)/,
  });
  await openCollections.click();

  const picker = page.getByRole("dialog", {
    name: /^(Collections|Collecties|Коллекции)/,
  });
  await expect(picker).toBeVisible();
  const checkbox = picker.getByRole("checkbox", { name: "Book 1" });
  await expect(checkbox).toBeEnabled();
  await checkbox.focus();

  holdNextMembershipRead = true;
  await checkbox.click();
  const collectionRegion = picker.locator('[data-dialog-part="body"]');
  await expect(checkbox).toBeDisabled();
  await expect(collectionRegion).toBeFocused();

  await membershipReadStarted;
  releaseMembershipRead();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeFocused();
});
