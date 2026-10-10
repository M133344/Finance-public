import test from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  interpret,
  parseAmount,
  outstanding,
  repay,
  validate,
  validDate,
  Transaction,
  inPeriod,
} from "./model";
const loan: Transaction = {
  id: "loan",
  profileId: "personal",
  amount: 100,
  currency: "USD",
  kind: "lend",
  category: "debt",
  description: "Lent to Ali",
  person: "Ali",
  date: "2026-10-10",
  dueDate: "2026-11-10",
};
test("recognizes amounts without combining currencies", () => {
  assert.equal(parseAmount("Lunch 45,000 UZS"), 45000);
  assert.equal(parseAmount("12.50 USD"), 12.5);
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount("٤٥٬٠٠٠ سوم"), 45000);
  assert.equal(parseAmount("1.5 million"), 1500000);
  assert.equal(parseAmount("25 ming"), 25000);
});
test("suggests expense and income categories across four languages", () => {
  for (const text of [
    "Coffee 5 USD",
    "Кофе 5 USD",
    "Qahva 5 USD",
    "قهوة 5 دولار",
  ]) {
    const t = interpret(text, "UZS");
    assert.equal(t.category, "food");
    assert.equal(t.currency, "USD");
  }
  for (const text of [
    "Salary 800 USD",
    "Зарплата 800 USD",
    "Maosh 800 USD",
    "راتب 800 دولار",
  ])
    assert.equal(interpret(text, "UZS").kind, "income");
});
test("detects the direction of loans", () => {
  for (const text of [
    "Lent $50 to Ali",
    "Дал в долг 50 USD Али",
    "Aliga 50 USD qarz berdim",
    "أقرضت علي 50 دولار",
  ])
    assert.equal(interpret(text, "UZS").kind, "lend");
  for (const text of [
    "Borrowed $50 from Ali",
    "Взял в долг 50 USD у Али",
    "50 USD qarz oldim",
    "اقترضت 50 دولار",
  ])
    assert.equal(interpret(text, "UZS").kind, "borrow");
});
test("loans require a person and valid return date", () => {
  assert.equal(validate(loan), true);
  assert.equal(validate({ ...loan, person: "" }), false);
  assert.equal(validate({ ...loan, dueDate: "2026-10-09" }), false);
  assert.equal(validate({ ...loan, amount: 0 }), false);
  assert.equal(validate({ ...loan, amount: NaN }), false);
  assert.equal(validDate("2026-02-30"), false);
});
test("partial repayments update cash and outstanding principal exactly once", () => {
  const first = repay(loan, 30, [loan]);
  const txs = [loan, first];
  assert.equal(balance(txs, "USD"), -70);
  assert.equal(outstanding(loan, txs), 70);
  const second = repay(loan, 70, txs);
  assert.equal(balance([...txs, second], "USD"), 0);
  assert.equal(outstanding(loan, [...txs, second]), 0);
  assert.throws(() => repay(loan, 71, txs));
  assert.throws(() => repay(loan, 0, txs));
  assert.equal(balance(txs, "UZS"), 0);
});
test("borrowing and repaying money has the inverse cash effect", () => {
  const borrowed: Transaction = { ...loan, kind: "borrow" };
  const payment = repay(borrowed, 40, [borrowed]);
  assert.equal(payment.kind, "expense");
  assert.equal(balance([borrowed, payment], "USD"), 60);
  assert.equal(outstanding(borrowed, [borrowed, payment]), 60);
});
test("period filters select the intended dates", () => {
  assert.equal(inPeriod(loan, "month", "2026-10-31"), true);
  assert.equal(inPeriod(loan, "month", "2026-11-01"), false);
  assert.equal(inPeriod(loan, "today", "2026-10-11"), false);
  assert.equal(inPeriod(loan, "all", "2026-11-01"), true);
});
test("negative amounts stay negative for validation and fractional sums stay exact", () => {
  assert.equal(parseAmount("-5"), -5);
  assert.equal(parseAmount("٢ ألف سوم"), 2000);
  assert.equal(
    balance(
      [
        { ...loan, amount: 0.1 },
        { ...loan, id: "two", amount: 0.2 },
      ],
      "USD",
    ),
    -0.3,
  );
});
