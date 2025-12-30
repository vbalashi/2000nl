import { expect, test } from "@playwright/test";

const listId = "list-nt2";
const entries = [
  {
    id: "word-1",
    headword: "huis",
    part_of_speech: "substantief",
    gender: "het",
    raw: {
      meanings: [
        {
          definition: "Een gebouw waar mensen wonen.",
          example: "Het huis aan de gracht is oud.",
          links: [{ label: "gracht", headword: "gracht" }],
        },
      ],
    },
  },
  {
    id: "word-2",
    headword: "gracht",
    part_of_speech: "substantief",
    gender: "de",
    raw: {
      meanings: [
        {
          definition: "Een waterloop in de stad.",
          example: "De gracht stroomt langs het huis.",
          links: [],
        },
      ],
    },
  },
];

const wordListItems = entries.map((entry, index) => ({
  rank: index + 1,
  word_id: entry.id,
  word_entries: entry,
}));

const userSession = {
  id: "user-1",
  email: "tester@example.com",
};

const authResponse = {
  access_token: "access-test",
  expires_in: 3600,
  refresh_token: "refresh-test",
  token_type: "bearer",
  user: {
    id: userSession.id,
    email: userSession.email,
  },
};

const restHandler = async (route: any) => {
  const request = route.request();
  if (request.method().toUpperCase() === "OPTIONS") {
    await route.fulfill({ status: 204, body: "" });
    return;
  }

  const url = new URL(request.url());
  const pathname = url.pathname;

  if (pathname.endsWith("/word_lists")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ id: listId, slug: "nt2-2000" }]),
    });
    return;
  }

  if (pathname.endsWith("/word_list_items")) {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(wordListItems),
    });
    return;
  }

  if (pathname.endsWith("/user_word_status")) {
    if (request.method().toUpperCase() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    return;
  }

  if (pathname.endsWith("/user_events")) {
    if (request.method().toUpperCase() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    return;
  }

  if (pathname.endsWith("/word_entries")) {
    const headwordParam = url.searchParams.get("headword");
    const target = headwordParam?.startsWith("eq.")
      ? headwordParam.replace("eq.", "")
      : headwordParam;
    const entry = entries.find((item) => item.headword === target);

    await route.fulfill({
      status: entry ? 200 : 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry ? [entry] : []),
    });
    return;
  }

  await route.fulfill({
    status: 404,
    body: JSON.stringify({ error: "Not mocked" }),
  });
};

test("training flow persists review and dictionary lookup", async ({
  page,
}) => {
  await page.route("**/auth/v1/token**", async (route) => {
    if (route.request().method().toUpperCase() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(authResponse),
    });
  });

  await page.route("**/auth/v1/session**", async (route) => {
    if (route.request().method().toUpperCase() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(authResponse),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    if (route.request().method().toUpperCase() === "OPTIONS") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(authResponse.user),
    });
  });

  await page.route("**/rest/v1/**", restHandler);

  await page.goto("/");
  await page.fill('input[type="email"]', userSession.email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');

  await expect(page.locator("h1")).toHaveText(/huis/i);

  await page.getByRole("button", { name: /gracht/i }).click();
  const selectedEntry = page.locator('div:has-text("Geselecteerde entry")');
  await expect(selectedEntry.getByText(/gracht/i)).toBeVisible();

  await page.keyboard.press("Space");
  await expect(page.locator("h1")).toHaveText(/gracht/i);
});
