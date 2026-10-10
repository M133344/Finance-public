import { test, expect, Page } from "@playwright/test";
async function enter(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill(text);
  await page
    .getByRole("button", { name: "Review transaction →", exact: true })
    .click();
  await expect(page.getByText("Does everything look right?")).toBeVisible();
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Confirm & save", exact: true })
    .click();
  await expect(page.getByText("Does everything look right?")).not.toBeVisible();
}
async function ledger(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("oqim.ledger.v1") || "{}"),
  );
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your money, in perspective.")).toBeVisible();
});
test("confirms categorization, saves cash flow and persists after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page, "Salary 100000 UZS");
  await save(page);
  await enter(page, "Coffee 45000 UZS");
  await expect(
    page.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("45000");
  await save(page);
  await expect(
    page.getByText("55,000 UZS", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("55,000 UZS", { exact: true }).first(),
  ).toBeVisible();
  const data = await ledger(page);
  expect(data.transactions).toHaveLength(2);
  expect(data.transactions[1].category).toBe("food");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search descriptions or people" })
    .fill("Coffee");
  await expect(
    page.getByText("Coffee 45000 UZS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Salary 100000 UZS", { exact: true }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("requires debt details and updates cash after a partial repayment", async ({
  page,
}) => {
  await enter(page, "Lent $100 to Ali");
  await page
    .getByRole("button", { name: "Confirm & save", exact: true })
    .click();
  await expect(
    page.getByText("Enter a positive amount, description and valid date.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Person", exact: true }).fill("Ali");
  await page
    .getByRole("textbox", { name: "Return date", exact: true })
    .fill("2030-12-31");
  await save(page);
  await page
    .getByRole("button", { name: "Debts & loans", exact: true })
    .click();
  await page.getByRole("button", { name: "USD", exact: true }).click();
  await page
    .getByRole("button", { name: "Record repayment", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Amount", exact: true }).fill("30");
  await page
    .getByRole("button", { name: "Confirm & save", exact: true })
    .click();
  await expect(page.getByText("70 $", { exact: true }).first()).toBeVisible();
  const data = await ledger(page);
  expect(data.transactions).toHaveLength(2);
  expect(data.transactions[1].kind).toBe("income");
  expect(data.transactions[1].debtId).toBe(data.transactions[0].id);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText("-70 $", { exact: true }).first()).toBeVisible();
});
test("keeps profiles separate and localizes the Arabic interface", async ({
  page,
}) => {
  await enter(page, "Coffee 10 USD");
  await save(page);
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page
    .getByRole("textbox", { name: "New profile name", exact: true })
    .fill("Family");
  await page
    .getByRole("button", { name: "Create profile", exact: true })
    .click();
  await expect(page.getByText("Family", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("Coffee 10 USD", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  await expect(page.getByText("لغة التطبيق", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("أموالك، بصورة أوضح.", { exact: true }),
  ).toBeVisible();
  expect((await ledger(page)).language).toBe("ar");
});
test("filters a custom period and never saves a cancelled draft", async ({
  page,
}) => {
  await enter(page, "Lunch 20000 UZS");
  await page
    .getByRole("textbox", { name: "Date", exact: true })
    .fill("2025-01-15");
  await save(page);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Custom dates", exact: true }).click();
  await page
    .getByRole("textbox", { name: "From", exact: true })
    .fill("2025-01-01");
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("2025-01-31");
  await expect(
    page.getByText("Lunch 20000 UZS", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "From", exact: true })
    .fill("2025-02-01");
  await expect(
    page.getByText("Choose valid dates with the end on or after the start."),
  ).toBeVisible();
  await expect(
    page.getByText("Lunch 20000 UZS", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await enter(page, "Taxi 10000 UZS");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await ledger(page)).transactions).toHaveLength(1);
});
test("keeps an unsaved draft visible if device storage fails", async ({
  page,
}) => {
  await enter(page, "Coffee 10 USD");
  await save(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage full");
    };
  });
  await enter(page, "Taxi 5 USD");
  await page
    .getByRole("button", { name: "Confirm & save", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your changes could not be saved. Please try again; do not close the app.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Does everything look right?")).toBeVisible();
  expect((await ledger(page)).transactions).toHaveLength(1);
});
test("dictation produces a draft and waits for explicit confirmation", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).SpeechRecognition = class {
      onresult: any;
      onend: any;
      start() {
        setTimeout(() => {
          this.onresult({ results: [[{ transcript: "Coffee 12 USD" }]] });
          this.onend();
        }, 50);
      }
      stop() {
        this.onend();
      }
    };
  });
  await page.getByRole("button", { name: "◎ Dictate", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Coffee 12 USD");
  expect((await ledger(page)).transactions).toBeUndefined();
  await page
    .getByRole("button", { name: "Review transaction →", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("12");
  await save(page);
  expect((await ledger(page)).transactions).toHaveLength(1);
});
