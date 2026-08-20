import { expect, test, type Page } from "@playwright/test";

const uniqueUsername = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const registerAndSignIn = async (page: Page) => {
  const username = uniqueUsername();
  await page.goto("/");
  await page.getByRole("button", { name: /need an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  return username;
};

test("shares a board with another user", async ({ page, browser }) => {
  const ownerUsername = await registerAndSignIn(page);

  page.once("dialog", (dialog) => dialog.accept("Owner's shared board"));
  await page.getByRole("button", { name: /new board/i }).click();
  await expect(page.getByText("Owner's shared board", { exact: true })).toBeVisible();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestUsername = await registerAndSignIn(guestPage);

  await page.getByRole("button", { name: /^share$/i }).click();
  await page.getByLabel("Add collaborator username").fill(guestUsername);
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText(guestUsername, { exact: true })).toBeVisible();

  await guestPage.reload();
  const sharedTab = guestPage.getByTestId(/board-tab-/).filter({ hasText: "Owner's shared board" });
  await expect(sharedTab).toBeVisible();
  await expect(sharedTab.getByLabel(/delete/i)).not.toBeVisible();

  await sharedTab.getByText("Owner's shared board").click();
  const guestColumn = guestPage.locator('[data-testid^="column-"]').first();
  await guestColumn.getByRole("button", { name: /add a card/i }).click();
  await guestColumn.getByPlaceholder("Card title").fill("Added by guest");

  const savedResponse = guestPage.waitForResponse(
    (response) => /\/api\/boards\/[^/]+$/.test(response.url()) && response.request().method() === "PUT"
  );
  await guestColumn.getByRole("button", { name: /add card/i }).click();
  await expect(guestColumn.getByText("Added by guest")).toBeVisible();
  await savedResponse;

  // No live sync between sessions, so the owner has to reload to see the
  // guest's edit — this confirms it was actually persisted server-side.
  await page.reload();
  await expect(page.getByText("Added by guest")).toBeVisible();

  expect(ownerUsername).not.toEqual(guestUsername);
  await guestContext.close();
});

test("registers and loads a starter kanban board", async ({ page }) => {
  await registerAndSignIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText("My board")).toBeVisible();
});

test("adds a card to a column", async ({ page }) => {
  await registerAndSignIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("adds a card with a priority and due date", async ({ page }) => {
  await registerAndSignIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("High priority task");
  await firstColumn.getByLabel("Priority").selectOption("high");
  await firstColumn.getByLabel("Due date").fill("2026-09-15");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  const card = firstColumn.getByText("High priority task").locator("xpath=ancestor::article");
  await expect(card.getByText("high", { exact: true })).toBeVisible();
  await expect(card.getByText("Due 2026-09-15")).toBeVisible();
});

test("edits an existing card", async ({ page }) => {
  await registerAndSignIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByLabel("Edit Gather customer signals").click();
  const titleInput = firstColumn.getByLabel("Edit card title");
  await titleInput.fill("Gather signals (edited)");
  await firstColumn.getByLabel("Edit card priority").selectOption("high");
  await firstColumn.getByRole("button", { name: /^save$/i }).click();

  await expect(firstColumn.getByText("Gather customer signals")).not.toBeVisible();
  const editedCard = firstColumn.getByText("Gather signals (edited)").locator("xpath=ancestor::article");
  await expect(editedCard.getByText("high", { exact: true })).toBeVisible();
});

test("changes the account password from the header", async ({ page }) => {
  await registerAndSignIn(page);

  await page.getByRole("button", { name: /^account$/i }).click();
  await page.getByLabel("Current password").fill("password123");
  await page.getByLabel("New password").fill("password456");
  await page.getByRole("button", { name: /update password/i }).click();

  await expect(page.getByText(/password updated/i)).toBeVisible();
});

test("adds and deletes a column", async ({ page }) => {
  await registerAndSignIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  page.once("dialog", (dialog) => dialog.accept("Ideas"));
  await page.getByRole("button", { name: /add column/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(6);

  // The column title lives in an <input value>, which Playwright's hasText
  // filter can't see (it only matches rendered text), so the new column is
  // located by position (appended last) instead.
  const newColumn = page.locator('[data-testid^="column-"]').last();
  await expect(newColumn.getByLabel("Column title")).toHaveValue("Ideas");

  page.once("dialog", (dialog) => dialog.accept());
  await newColumn.getByLabel(/delete ideas column/i).click();

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("filters cards with the search box", async ({ page }) => {
  await registerAndSignIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await expect(firstColumn.getByText("Align roadmap themes")).toBeVisible();
  await expect(firstColumn.getByText("Gather customer signals")).toBeVisible();

  await page.getByLabel("Search cards").fill("Align");

  await expect(firstColumn.getByText("Align roadmap themes")).toBeVisible();
  await expect(firstColumn.getByText("Gather customer signals")).not.toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await registerAndSignIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("creates a second board and switches between boards", async ({ page }) => {
  await registerAndSignIn(page);

  page.once("dialog", (dialog) => dialog.accept("Second board"));
  await page.getByRole("button", { name: /new board/i }).click();

  const secondBoardTab = page.getByTestId(/board-tab-/).filter({ hasText: "Second board" });
  await expect(secondBoardTab).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByText("My board").click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText("Second board")).toBeVisible();
});

test("signs out and returns to the login screen", async ({ page }) => {
  await registerAndSignIn(page);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
