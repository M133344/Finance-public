export type Language = "en" | "ru" | "uz" | "ar";
export type Currency = "UZS" | "USD";
export type Kind = "expense" | "income" | "lend" | "borrow";
export const categories = [
  "food",
  "transport",
  "shopping",
  "home",
  "health",
  "leisure",
  "salary",
  "other",
  "debt",
] as const;
export type Category = (typeof categories)[number];
export type Transaction = {
  id: string;
  profileId: string;
  amount: number;
  currency: Currency;
  kind: Kind;
  category: Category;
  description: string;
  date: string;
  person?: string;
  dueDate?: string;
  debtId?: string;
};
export type Profile = { id: string; name: string };
export type Store = {
  version: 1;
  profiles: Profile[];
  activeId: string;
  language: Language;
  transactions: Transaction[];
};
export const initialStore: Store = {
  version: 1,
  profiles: [{ id: "personal", name: "Personal" }],
  activeId: "personal",
  language: "en",
  transactions: [],
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const id = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const sign = (kind: Kind) =>
  kind === "expense" || kind === "lend" ? -1 : 1;
export const money = (
  amount: number,
  currency: Currency,
  language: Language = "en",
) =>
  new Intl.NumberFormat(
    { en: "en-US", ru: "ru-RU", uz: "uz-UZ", ar: "ar" }[language],
    { maximumFractionDigits: 2 },
  ).format(amount) + (currency === "USD" ? " $" : " UZS");
export function parseAmount(text: string): number {
  const normalized = text
    .replace(/[٠-٩]/g, (n) => String("٠١٢٣٤٥٦٧٨٩".indexOf(n)))
    .replace(/[۰-۹]/g, (n) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(n)))
    .replace(/٬/g, "")
    .replace(/٫/g, ".");
  const match = normalized.match(
    /-?\d+(?:[ ,.]\d+)*(?:\s*(?:million|mln|млн|миллион|million|مليون|ming|тысяч[аи]?|ألف|thousand|k)(?=$|\s|[.,]))?/i,
  );
  if (!match) return 0;
  const raw = match[0].toLowerCase();
  const multiplier = /million|mln|млн|миллион|مليون/.test(raw)
    ? 1e6
    : /ming|тысяч|ألف|thousand|k/.test(raw)
      ? 1e3
      : 1;
  let number = raw.replace(/[^\d.,]/g, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(number))
    number = number.replace(/[.,]/g, "");
  else if (number.includes(",") && number.includes("."))
    number =
      number.lastIndexOf(",") > number.lastIndexOf(".")
        ? number.replace(/\./g, "").replace(",", ".")
        : number.replace(/,/g, "");
  else number = number.replace(",", ".");
  return (
    Math.round(
      Number(number) * multiplier * (raw.startsWith("-") ? -1 : 1) * 100,
    ) / 100
  );
}
const rules: [Category, RegExp][] = [
  [
    "food",
    /coffee|café|cafe|lunch|dinner|breakfast|grocery|groceries|restaurant|food|кофе|обед|ужин|продукт|еда|ресторан|ovqat|qahva|tushlik|bozor|قهوة|طعام|غداء|عشاء|بقالة/iu,
  ],
  [
    "transport",
    /taxi|uber|bus|metro|fuel|petrol|такси|бензин|метро|автобус|taksi|benzin|yo.lkira|تاكسي|وقود|مواصلات/iu,
  ],
  [
    "home",
    /rent|utilities|electric|internet|аренд|коммунал|квартир|ijara|kommunal|إيجار|كهرباء|إنترنت/iu,
  ],
  [
    "health",
    /doctor|pharmacy|medicine|hospital|врач|аптек|лекарств|dori|shifokor|طبيب|دواء|صيدلية/iu,
  ],
  [
    "shopping",
    /clothes|shoes|shopping|одежд|обув|покупк|kiyim|poyabzal|ملابس|تسوق|حذاء/iu,
  ],
  [
    "leisure",
    /cinema|movie|travel|holiday|game|кино|отдых|игр|sayohat|o.yin|سينما|سفر|ترفيه/iu,
  ],
  ["salary", /salary|paycheck|зарплат|maosh|oylik|راتب/iu],
];
export function interpret(
  text: string,
  defaultCurrency: Currency,
): Omit<Transaction, "id" | "profileId"> {
  const s = text.toLowerCase();
  const currency: Currency = /usd|\$|dollar|доллар|دولار/.test(s)
    ? "USD"
    : /uzs|so[‘’'ʻ`]?m|сум|сўм|سوم/.test(s)
      ? "UZS"
      : defaultCurrency;
  const kind: Kind =
    /lent|lend|loaned|дал[аи]?\s+в\s+долг|одолжил[аи]?\s+кому|qarz\s+ber|أقرضت|أقرض/.test(
      s,
    )
      ? "lend"
      : /borrow|took\s+a\s+loan|взял[аи]?\s+в\s+долг|занял[аи]?\s+у|qarz\s+ol|اقترضت|استلفت/.test(
            s,
          )
        ? "borrow"
        : /salary|paycheck|income|earned|received|зарплат|доход|получил|maosh|oylik|daromad|راتب|دخل|استلمت/.test(
              s,
            )
          ? "income"
          : "expense";
  return {
    amount: parseAmount(text),
    currency,
    kind,
    category:
      kind === "lend" || kind === "borrow"
        ? "debt"
        : rules.find(([, r]) => r.test(s))?.[0] || "other",
    description: text.trim(),
    date: today(),
    person: "",
    dueDate: "",
  };
}
export const balance = (txs: Transaction[], currency: Currency) =>
  txs
    .filter((t) => t.currency === currency)
    .reduce((sum, t) => sum + sign(t.kind) * Math.round(t.amount * 100), 0) /
  100;
export function outstanding(debt: Transaction, txs: Transaction[]) {
  return Math.max(
    0,
    Math.round(
      (debt.amount -
        txs
          .filter((t) => t.debtId === debt.id)
          .reduce((s, t) => s + t.amount, 0)) *
        100,
    ) / 100,
  );
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function validate(t: Omit<Transaction, "id" | "profileId">): boolean {
  return (
    Number.isFinite(t.amount) &&
    t.amount > 0 &&
    t.amount <= 1e12 &&
    !!t.description.trim() &&
    validDate(t.date) &&
    (!(t.kind === "lend" || t.kind === "borrow") ||
      (!!t.person?.trim() &&
        !!t.dueDate &&
        validDate(t.dueDate) &&
        t.dueDate >= t.date))
  );
}
export function repay(
  debt: Transaction,
  amount: number,
  txs: Transaction[],
): Transaction {
  if (
    !(debt.kind === "lend" || debt.kind === "borrow") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > outstanding(debt, txs)
  )
    throw new Error("Invalid repayment");
  return {
    id: id(),
    profileId: debt.profileId,
    amount,
    currency: debt.currency,
    kind: debt.kind === "lend" ? "income" : "expense",
    category: "debt",
    description: debt.person || debt.description,
    date: today(),
    debtId: debt.id,
  };
}
export function inPeriod(t: Transaction, period: string, now = today()) {
  return (
    period === "all" ||
    (period === "month"
      ? t.date.slice(0, 7) === now.slice(0, 7)
      : t.date === now)
  );
}

export function decodeStore(raw: string): Store {
  const data = JSON.parse(raw) as Store;
  if (
    data.version !== 1 ||
    !["en", "ru", "uz", "ar"].includes(data.language) ||
    !Array.isArray(data.profiles) ||
    !Array.isArray(data.transactions) ||
    !data.profiles.length
  )
    throw new Error("Invalid ledger");
  const ids = new Set<string>();
  for (const p of data.profiles) {
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      ids.has(p.id)
    )
      throw new Error("Invalid profile");
    ids.add(p.id);
  }
  if (!ids.has(data.activeId)) throw new Error("Invalid active profile");
  const txIds = new Set<string>();
  for (const t of data.transactions) {
    if (
      !t ||
      typeof t.id !== "string" ||
      txIds.has(t.id) ||
      !ids.has(t.profileId) ||
      !["UZS", "USD"].includes(t.currency) ||
      !["expense", "income", "lend", "borrow"].includes(t.kind) ||
      !categories.includes(t.category) ||
      typeof t.description !== "string" ||
      !validate(t)
    )
      throw new Error("Invalid transaction");
    txIds.add(t.id);
  }
  return data;
}
