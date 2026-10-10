import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  balance,
  decodeStore,
  categories,
  Category,
  Currency,
  id,
  initialStore,
  inPeriod,
  interpret,
  Kind,
  Language,
  money,
  outstanding,
  parseAmount,
  repay,
  sign,
  Store,
  today,
  Transaction,
  validate,
  validDate,
} from "./src/model";
import { dictionaries, Key, languageNames } from "./src/i18n";
import { startVoice } from "./src/voice";

const STORAGE = "oqim.ledger.v1";
const C = {
  ink: "#223C36",
  green: "#285C4B",
  mint: "#E5EEE5",
  paper: "#F7F8F2",
  muted: "#79877D",
  line: "#E3E7DC",
  white: "#FFFFFF",
  orange: "#B7704B",
  pink: "#F8EDE4",
  lime: "#DCEBA6",
};
const categoryIcons: Record<Category, string> = {
  food: "◒",
  transport: "↑",
  shopping: "◇",
  home: "⌂",
  health: "+",
  leisure: "✧",
  salary: "↓",
  other: "·",
  debt: "⇄",
};
const colors = [
  "#3E715A",
  "#A4BB84",
  "#DAB378",
  "#8BA7B1",
  "#C68C79",
  "#B3A0C0",
  "#7D9C86",
  "#C3C9BD",
  "#D4BD93",
];
type Tab = "overview" | "history" | "debts" | "profile";
type Draft = Omit<Transaction, "id" | "profileId">;
function AppContent() {
  const [store, setStore] = useState<Store>(initialStore),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<Key | null>(null);
  const [tab, setTab] = useState<Tab>("overview"),
    [currency, setCurrency] = useState<Currency>("UZS"),
    [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState(today().slice(0, 7) + "-01"),
    [toDate, setToDate] = useState(today());
  const [entry, setEntry] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [amountText, setAmountText] = useState(""),
    [repayment, setRepayment] = useState<Transaction | null>(null),
    [repayText, setRepayText] = useState("");
  const [search, setSearch] = useState(""),
    [typeFilter, setTypeFilter] = useState("all"),
    [categoryFilter, setCategoryFilter] = useState("all"),
    [newName, setNewName] = useState(""),
    [listening, setListening] = useState(false),
    [voiceNote, setVoiceNote] = useState<Key | null>(null);
  const voiceStop = useRef<null | (() => void)>(null),
    busy = useRef(false);
  const { width } = useWindowDimensions();
  const desktop = width > 900;
  const rtl = store.language === "ar";
  const t = dictionaries[store.language];
  const active = store.profiles.find((p) => p.id === store.activeId)!;
  const txs = store.transactions.filter((x) => x.profileId === store.activeId);
  const rangeValid =
    validDate(fromDate) && validDate(toDate) && fromDate <= toDate;
  const scoped = txs.filter(
    (x) =>
      x.currency === currency &&
      (period === "custom"
        ? rangeValid && x.date >= fromDate && x.date <= toDate
        : inPeriod(x, period)),
  );
  const incoming = scoped
    .filter((x) => x.kind === "income" && x.category !== "debt")
    .reduce((s, x) => s + x.amount, 0);
  const expenses = scoped
    .filter((x) => x.kind === "expense" && x.category !== "debt")
    .reduce((s, x) => s + x.amount, 0);
  const cashIn = scoped
      .filter((x) => sign(x.kind) > 0)
      .reduce((s, x) => s + x.amount, 0),
    cashOut = scoped
      .filter((x) => sign(x.kind) < 0)
      .reduce((s, x) => s + x.amount, 0);
  const spending = categories
    .map((category) => ({
      category,
      value: scoped
        .filter(
          (x) =>
            x.kind === "expense" &&
            x.category === category &&
            category !== "debt",
        )
        .reduce((s, x) => s + x.amount, 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const allDebts = txs.filter((x) => x.kind === "lend" || x.kind === "borrow");
  const fmt = (n: number, c: Currency = currency) =>
    money(n, c, store.language);
  const row = rtl ? { flexDirection: "row-reverse" as const } : {};
  const textAlign = rtl ? { textAlign: "right" as const } : {};
  async function load() {
    setLoadError(false);
    try {
      const data = await AsyncStorage.getItem(STORAGE);
      if (data) {
        setStore(decodeStore(data));
      }
      setReady(true);
    } catch {
      setLoadError(true);
    }
  }
  useEffect(() => {
    void load();
    return () => voiceStop.current?.();
  }, []);
  async function persist(next: Store) {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await AsyncStorage.setItem(STORAGE, JSON.stringify(next));
      setStore(next);
      return true;
    } catch {
      setError("storageError");
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  const button = (
    label: string,
    onPress: () => void,
    secondary = false,
    small = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || saving}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        small && s.smallButton,
        (pressed || disabled || saving) && { opacity: 0.6 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.green }]}>
        {label}
      </Text>
    </Pressable>
  );
  const chips = (
    values: { value: string; label: string }[],
    selected: string,
    onSelect: (v: string) => void,
  ) => (
    <View style={[s.chips, row]}>
      {values.map((v) => (
        <Pressable
          key={v.value}
          accessibilityRole="button"
          accessibilityState={{ selected: v.value === selected }}
          onPress={() => onSelect(v.value)}
          style={[s.chip, v.value === selected && s.chipActive]}
        >
          <Text
            style={[s.chipText, v.value === selected && { color: C.white }]}
          >
            {v.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = "",
    numeric = false,
  ) => (
    <View style={s.field}>
      <Text style={[s.label, textAlign]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, textAlign]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
  const title = (heading: string, aside?: React.ReactNode) => (
    <View style={[s.sectionHeader, row]}>
      <Text style={[s.sectionTitle, textAlign]}>{heading}</Text>
      {aside}
    </View>
  );
  function review() {
    if (!entry.trim()) {
      setError("entryError");
      return;
    }
    voiceStop.current?.();
    const parsed = interpret(entry, currency);
    setDraft(parsed);
    setAmountText(parsed.amount ? String(parsed.amount) : "");
    setError(null);
  }
  async function saveDraft() {
    if (!draft) return;
    const next = {
      ...draft,
      amount: parseAmount(amountText),
      category: (draft.kind === "lend" || draft.kind === "borrow"
        ? "debt"
        : draft.category) as Category,
    };
    if (!validate(next)) {
      setError("invalid");
      return;
    }
    if (
      await persist({
        ...store,
        transactions: [
          ...store.transactions,
          { ...next, id: id(), profileId: store.activeId },
        ],
      })
    ) {
      setDraft(null);
      setEntry("");
      setVoiceNote(null);
    }
  }
  async function recordRepayment() {
    if (!repayment) return;
    try {
      const next = repay(repayment, parseAmount(repayText), txs);
      if (
        await persist({ ...store, transactions: [...store.transactions, next] })
      ) {
        setRepayment(null);
        setRepayText("");
      }
    } catch {
      setError("repaymentError");
    }
  }
  async function dictate() {
    if (listening) {
      voiceStop.current?.();
      return;
    }
    setVoiceNote(null);
    setError(null);
    try {
      setListening(true);
      voiceStop.current = await startVoice(
        { en: "en-US", ru: "ru-RU", uz: "uz-UZ", ar: "ar-SA" }[store.language],
        {
          onText: setEntry,
          onEnd: () => {
            setListening(false);
            voiceStop.current = null;
            setVoiceNote((v) => v || "voiceReview");
          },
          onError: setVoiceNote,
        },
      );
    } catch (e) {
      setListening(false);
      setVoiceNote(
        (e as Error).message === "voiceDenied"
          ? "voiceDenied"
          : "voiceUnavailable",
      );
    }
  }
  const transactionRow = (x: Transaction) => (
    <View key={x.id} style={[s.transaction, row]}>
      <View
        style={[
          s.txIcon,
          { backgroundColor: sign(x.kind) > 0 ? C.mint : C.pink },
        ]}
      >
        <Text
          style={{ fontSize: 23, color: sign(x.kind) > 0 ? C.green : C.orange }}
        >
          {categoryIcons[x.category]}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text numberOfLines={1} style={[s.txTitle, textAlign]}>
          {x.debtId ? t.repayment + " · " : ""}
          {x.description}
        </Text>
        <Text style={[s.caption, textAlign]}>
          {t[x.category]} · {x.date}
        </Text>
      </View>
      <Text style={[s.txAmount, { color: sign(x.kind) > 0 ? C.green : C.ink }]}>
        {sign(x.kind) > 0 ? "+" : "−"}
        {fmt(x.amount, x.currency)}
      </Text>
    </View>
  );
  const empty = (heading = t.empty, hint = t.emptyHint) => (
    <View style={s.empty}>
      <Text style={s.emptySymbol}>✧</Text>
      <Text style={s.sectionTitle}>{heading}</Text>
      <Text style={[s.body, { textAlign: "center", maxWidth: 330 }]}>
        {hint}
      </Text>
    </View>
  );
  if (!ready)
    return (
      <SafeAreaView style={[s.root, s.center]}>
        {loadError ? (
          <>
            <Text style={s.body}>{t.loadError}</Text>
            {button(t.retry, () => void load())}
          </>
        ) : (
          <>
            <ActivityIndicator color={C.green} />
            <Text style={s.body}>{t.loading}</Text>
          </>
        )}
      </SafeAreaView>
    );
  const navigation = (side = false) => (
    <View style={[side ? s.sideNav : s.bottomNav, !side && row]}>
      {(["overview", "history", "debts", "profile"] as Tab[]).map((key, i) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t[key]}
          key={key}
          onPress={() => setTab(key)}
          style={[
            side ? s.sideNavItem : s.navItem,
            side && tab === key && s.sideNavActive,
          ]}
        >
          <Text style={[s.navIcon, { color: tab === key ? C.green : C.muted }]}>
            {["◫", "≡", "⇄", "◯"][i]}
          </Text>
          <Text
            style={[
              s.navLabel,
              { color: tab === key ? C.green : C.muted },
              tab === key && { fontWeight: "700" },
            ]}
          >
            {t[key]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.shell, row]}>
        {desktop && (
          <View style={s.sidebar}>
            <View style={[s.brand, row]}>
              <View style={s.logo}>
                <Text style={s.logoText}>o</Text>
              </View>
              <Text style={s.brandText}>
                oqim<Text style={{ color: C.orange }}>.</Text>
              </Text>
            </View>
            <Text style={[s.brandCaption, textAlign]}>{t.local}</Text>
            {navigation(true)}
            <View style={s.sidebarBottom}>
              <Text style={s.caption}>{t.tagline}</Text>
              <Text style={[s.caption, { marginTop: 12 }]}>UZS + USD</Text>
            </View>
          </View>
        )}
        <View style={s.main}>
          <ScrollView
            contentContainerStyle={[
              s.content,
              desktop && { paddingHorizontal: 42 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[s.topbar, row]}>
              {!desktop ? (
                <View style={[s.brand, row]}>
                  <View style={s.logo}>
                    <Text style={s.logoText}>o</Text>
                  </View>
                  <Text style={s.brandText}>oqim.</Text>
                </View>
              ) : (
                <Text style={s.eyebrow}>{t[tab]}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.profile}
                onPress={() => setTab("profile")}
                style={[s.profilePill, row]}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {active.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={s.label}>{active.name}</Text>
                <Text style={s.caption}>⌄</Text>
              </Pressable>
            </View>
            <View style={s.pageHeading}>
              <Text style={[s.heading, textAlign]}>
                {tab === "overview" ? t.greeting : t[tab]}
              </Text>
              <Text style={[s.body, textAlign]}>
                {tab === "overview"
                  ? t.subtitle
                  : tab === "debts"
                    ? t.debtHint
                    : tab === "profile"
                      ? t.profileHint
                      : t.separate}
              </Text>
            </View>
            {error && !draft && !repayment && (
              <Text accessibilityRole="alert" style={s.error}>
                {t[error]}
              </Text>
            )}
            {tab !== "profile" && (
              <View style={[s.toolbar, row]}>
                {chips(
                  [
                    { value: "UZS", label: "UZS" },
                    { value: "USD", label: "USD" },
                  ],
                  currency,
                  (v) => setCurrency(v as Currency),
                )}
                {tab !== "debts" &&
                  chips(
                    [
                      { value: "today", label: t.today },
                      { value: "month", label: t.month },
                      { value: "all", label: t.all },
                      { value: "custom", label: t.custom },
                    ],
                    period,
                    setPeriod,
                  )}
              </View>
            )}
            {tab !== "profile" && tab !== "debts" && period === "custom" && (
              <>
                <View style={[s.statRow, row]}>
                  <View style={{ flex: 1 }}>
                    {field(t.from, fromDate, setFromDate, t.dateHint)}
                  </View>
                  <View style={{ flex: 1 }}>
                    {field(t.to, toDate, setToDate, t.dateHint)}
                  </View>
                </View>
                {!rangeValid && <Text style={s.error}>{t.invalidRange}</Text>}
              </>
            )}
            {tab === "overview" && (
              <>
                <View
                  style={[s.balanceCard, rtl && { alignItems: "flex-end" }]}
                >
                  <View style={s.balanceDecoration} />
                  <Text style={s.balanceLabel}>
                    {t.available} · {currency}
                  </Text>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={s.balanceValue}
                  >
                    {fmt(balance(txs, currency))}
                  </Text>
                  <View style={[s.balanceFooter, row]}>
                    <Text style={s.balanceHint}>{t.separate}</Text>
                    <Text style={s.balanceMark}>↑</Text>
                  </View>
                </View>
                <View style={[s.statRow, row]}>
                  {[
                    {
                      label: t.income,
                      value: incoming,
                      icon: "↓",
                      positive: true,
                    },
                    {
                      label: t.expense,
                      value: expenses,
                      icon: "↑",
                      positive: false,
                    },
                  ].map((x) => (
                    <View key={x.label} style={s.statCard}>
                      <View style={[s.sectionHeader, row]}>
                        <Text style={s.caption}>{x.label}</Text>
                        <Text
                          style={{
                            color: x.positive ? C.green : C.orange,
                            fontSize: 23,
                          }}
                        >
                          {x.icon}
                        </Text>
                      </View>
                      <Text style={[s.statValue, textAlign]}>
                        {fmt(x.value)}
                      </Text>
                      <Text style={[s.caption, textAlign]}>
                        {
                          t[
                            period === "month"
                              ? "month"
                              : period === "today"
                                ? "today"
                                : period === "custom"
                                  ? "custom"
                                  : "all"
                          ]
                        }
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={s.entryCard}>
                  {title(t.entryTitle, <Text style={s.entrySpark}>✧</Text>)}
                  <TextInput
                    accessibilityLabel={t.description}
                    multiline
                    value={entry}
                    onChangeText={setEntry}
                    placeholder={t.entryHint}
                    placeholderTextColor={C.muted}
                    style={[s.entryInput, textAlign]}
                  />
                  {(voiceNote || listening) && (
                    <Text style={s.caption}>
                      {listening ? t.listening : t[voiceNote!]}
                    </Text>
                  )}
                  <View style={[s.entryActions, row]}>
                    {button(
                      listening ? "■ " + t.stop : "◎ " + t.dictate,
                      () => void dictate(),
                      true,
                    )}
                    {button(t.review + "  →", review, false, false, listening)}
                  </View>
                </View>
                <View style={desktop ? s.twoColumns : undefined}>
                  <View style={[s.card, desktop && { flex: 1 }]}>
                    {title(t.spending)}
                    {spending.length ? (
                      <>
                        {spending.map((x, i) => (
                          <View key={x.category} style={s.chartItem}>
                            <View style={[s.sectionHeader, row]}>
                              <View style={[s.inline, row]}>
                                <View
                                  style={[
                                    s.dot,
                                    {
                                      backgroundColor:
                                        colors[i % colors.length],
                                    },
                                  ]}
                                />
                                <Text style={s.label}>{t[x.category]}</Text>
                              </View>
                              <Text style={s.label}>
                                {Math.round((x.value / expenses) * 100)}%
                              </Text>
                            </View>
                            <View
                              accessibilityLabel={`${t[x.category]} ${fmt(x.value)}`}
                              style={s.barTrack}
                            >
                              <View
                                style={[
                                  s.bar,
                                  {
                                    width: `${(x.value / expenses) * 100}%`,
                                    backgroundColor: colors[i % colors.length],
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        ))}
                      </>
                    ) : (
                      empty(t.spending, t.adviceEmpty)
                    )}
                  </View>
                  <View style={[s.card, desktop && { flex: 1 }]}>
                    {title(t.cashflow)}
                    <View style={[s.graph, row]}>
                      {[
                        { label: t.income, value: cashIn, color: C.green },
                        { label: t.expense, value: cashOut, color: "#C4D4A9" },
                      ].map((x) => (
                        <View key={x.label} style={s.graphColumn}>
                          <Text style={s.graphValue}>{fmt(x.value)}</Text>
                          <View style={s.graphTrack}>
                            <View
                              style={{
                                width: "100%",
                                height: Math.max(
                                  x.value ? 5 : 0,
                                  (x.value / Math.max(cashIn, cashOut, 1)) *
                                    112,
                                ),
                                borderRadius: 8,
                                backgroundColor: x.color,
                              }}
                            />
                          </View>
                          <Text style={s.caption}>{x.label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={[s.netRow, row]}>
                      <Text style={s.label}>{t.net}</Text>
                      <Text style={s.label}>{fmt(cashIn - cashOut)}</Text>
                    </View>
                  </View>
                </View>
                <View style={s.insightCard}>
                  <Text style={s.eyebrow}>✧ {t.conclusion}</Text>
                  <Text style={[s.insightTitle, textAlign]}>
                    {!scoped.length
                      ? t.adviceEmpty
                      : incoming === expenses
                        ? t.balanced
                        : `${incoming > expenses ? t.surplus : t.deficit} ${fmt(Math.abs(incoming - expenses))}`}
                  </Text>
                  {spending[0] && (
                    <Text style={[s.body, textAlign]}>
                      {t.adviceHigh} {t[spending[0].category]}.
                    </Text>
                  )}
                  <Text style={[s.body, textAlign]}>
                    {incoming > expenses
                      ? t.adviceSave
                      : expenses > incoming
                        ? t.adviceDeficit
                        : ""}
                  </Text>
                  <Text style={[s.finePrint, textAlign]}>
                    {t.educational} {t.debtExcluded}
                  </Text>
                </View>
                <View style={s.card}>
                  {title(
                    t.recent,
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTab("history")}
                    >
                      <Text style={s.link}>{t.seeAll} →</Text>
                    </Pressable>,
                  )}
                  {scoped.length
                    ? [...scoped]
                        .sort(
                          (a, b) =>
                            b.date.localeCompare(a.date) ||
                            b.id.localeCompare(a.id),
                        )
                        .slice(0, 5)
                        .map(transactionRow)
                    : empty()}
                </View>
              </>
            )}
            {tab === "history" && (
              <>
                <TextInput
                  accessibilityLabel={t.search}
                  style={s.input}
                  placeholder={t.search}
                  placeholderTextColor={C.muted}
                  value={search}
                  onChangeText={setSearch}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginVertical: 16 }}
                >
                  {chips(
                    [
                      { value: "all", label: t.allTypes },
                      ...(
                        ["expense", "income", "lend", "borrow"] as Kind[]
                      ).map((value) => ({ value, label: t[value] })),
                    ],
                    typeFilter,
                    setTypeFilter,
                  )}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {chips(
                    [
                      { value: "all", label: t.allCategories },
                      ...categories.map((value) => ({
                        value,
                        label: t[value],
                      })),
                    ],
                    categoryFilter,
                    setCategoryFilter,
                  )}
                </ScrollView>
                <View style={[s.card, { marginTop: 20 }]}>
                  {(() => {
                    const filtered = scoped
                      .filter(
                        (x) =>
                          (typeFilter === "all" || x.kind === typeFilter) &&
                          (categoryFilter === "all" ||
                            x.category === categoryFilter) &&
                          (x.description + " " + (x.person || ""))
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .sort(
                        (a, b) =>
                          b.date.localeCompare(a.date) ||
                          b.id.localeCompare(a.id),
                      );
                    return filtered.length ? (
                      <>
                        {title(`${filtered.length} ${t.transactions}`)}
                        {filtered.map(transactionRow)}
                      </>
                    ) : (
                      empty(t.noResults, t.emptyHint)
                    );
                  })()}
                </View>
              </>
            )}
            {tab === "debts" && (
              <>
                <View style={[s.statRow, row]}>
                  {(["lend", "borrow"] as Kind[]).map((kind) => (
                    <View key={kind} style={s.statCard}>
                      <Text style={[s.caption, textAlign]}>
                        {kind === "lend" ? t.owedToYou : t.youOwe}
                      </Text>
                      <Text style={[s.statValue, textAlign]}>
                        {fmt(
                          allDebts
                            .filter(
                              (x) => x.kind === kind && x.currency === currency,
                            )
                            .reduce((s, x) => s + outstanding(x, txs), 0),
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
                {allDebts.filter((x) => x.currency === currency).length ? (
                  allDebts
                    .filter((x) => x.currency === currency)
                    .sort((a, b) =>
                      (a.dueDate || "").localeCompare(b.dueDate || ""),
                    )
                    .map((debt) => {
                      const left = outstanding(debt, txs),
                        overdue = left > 0 && debt.dueDate! < today();
                      return (
                        <View key={debt.id} style={s.card}>
                          {title(
                            debt.person || debt.description,
                            <Text
                              style={[
                                s.badge,
                                overdue && {
                                  backgroundColor: C.pink,
                                  color: C.orange,
                                },
                              ]}
                            >
                              {left === 0
                                ? t.settled
                                : overdue
                                  ? t.overdue
                                  : t[debt.kind]}
                            </Text>,
                          )}
                          <Text style={[s.body, textAlign]}>
                            {debt.description}
                          </Text>
                          <Text style={[s.statValue, textAlign]}>
                            {fmt(left)}
                          </Text>
                          <Text style={[s.caption, textAlign]}>
                            {t.remaining} · {t.due} {debt.dueDate}
                          </Text>
                          {left > 0 && (
                            <View style={{ marginTop: 18 }}>
                              {button(
                                t.repay,
                                () => {
                                  setRepayment(debt);
                                  setRepayText(String(left));
                                  setError(null);
                                },
                                true,
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                ) : (
                  <View style={s.card}>{empty(t.noDebts, t.noDebtsHint)}</View>
                )}
                {button("+ " + t.add, () => setTab("overview"))}
              </>
            )}
            {tab === "profile" && (
              <>
                <View style={s.card}>
                  {title(t.profiles)}
                  {store.profiles.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      disabled={saving || listening}
                      onPress={() => {
                        setEntry("");
                        setVoiceNote(null);
                        void persist({ ...store, activeId: p.id });
                      }}
                      style={[s.profileRow, row]}
                    >
                      <View style={[s.inline, row]}>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>
                            {p.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text style={s.txTitle}>{p.name}</Text>
                      </View>
                      {p.id === store.activeId && (
                        <Text style={s.badge}>{t.active}</Text>
                      )}
                    </Pressable>
                  ))}
                  {field(t.newProfile, newName, setNewName)}
                  {button(
                    t.create,
                    () => {
                      if (!newName.trim()) {
                        setError("nameRequired");
                        return;
                      }
                      const p = { id: id(), name: newName.trim() };
                      void persist({
                        ...store,
                        profiles: [...store.profiles, p],
                        activeId: p.id,
                      }).then((ok) => {
                        if (ok) {
                          setNewName("");
                          setEntry("");
                        }
                      });
                    },
                    false,
                    false,
                    listening,
                  )}
                </View>
                <View style={s.card}>
                  {title(t.language)}
                  {chips(
                    Object.entries(languageNames).map(([value, label]) => ({
                      value,
                      label,
                    })),
                    store.language,
                    (v) => {
                      if (!listening)
                        void persist({ ...store, language: v as Language });
                    },
                  )}
                </View>
                <View style={s.insightCard}>
                  {title(t.privacy)}
                  <Text style={[s.body, textAlign]}>{t.privacyText}</Text>
                </View>
              </>
            )}
            <View style={s.footer}>
              <Text style={s.caption}>oqim. · {t.tagline}</Text>
            </View>
          </ScrollView>
          {!desktop && navigation()}
        </View>
      </View>
      <Modal
        visible={!!draft || !!repayment}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!saving) {
            setDraft(null);
            setRepayment(null);
            setError(null);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.modalBackdrop}
        >
          <View style={s.modal}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.modalContent}
            >
              <Text style={[s.heading, { fontSize: 28 }, textAlign]}>
                {draft ? t.confirmTitle : t.repayment}
              </Text>
              <Text style={[s.body, textAlign]}>
                {draft ? t.confirmHint : t.repaymentHint}
              </Text>
              {error && (
                <Text accessibilityRole="alert" style={s.error}>
                  {t[error]}
                </Text>
              )}
              {draft && (
                <>
                  {field(t.amount, amountText, setAmountText, "0", true)}
                  <Text style={[s.label, textAlign]}>{t.currency}</Text>
                  {chips(
                    [
                      { value: "UZS", label: "UZS" },
                      { value: "USD", label: "USD" },
                    ],
                    draft.currency,
                    (v) => setDraft({ ...draft, currency: v as Currency }),
                  )}
                  <Text style={[s.label, { marginTop: 18 }, textAlign]}>
                    {t.type}
                  </Text>
                  {chips(
                    (["expense", "income", "lend", "borrow"] as Kind[]).map(
                      (value) => ({ value, label: t[value] }),
                    ),
                    draft.kind,
                    (v) =>
                      setDraft({
                        ...draft,
                        kind: v as Kind,
                        category:
                          v === "lend" || v === "borrow"
                            ? "debt"
                            : draft.category === "debt"
                              ? "other"
                              : draft.category,
                      }),
                  )}
                  {field(t.description, draft.description, (v) =>
                    setDraft({ ...draft, description: v }),
                  )}
                  {draft.kind !== "lend" && draft.kind !== "borrow" && (
                    <>
                      <Text style={[s.label, textAlign]}>{t.category}</Text>
                      {chips(
                        categories
                          .filter((c) => c !== "debt")
                          .map((value) => ({ value, label: t[value] })),
                        draft.category,
                        (v) => setDraft({ ...draft, category: v as Category }),
                      )}
                    </>
                  )}
                  {field(
                    t.date,
                    draft.date,
                    (v) => setDraft({ ...draft, date: v }),
                    t.dateHint,
                  )}
                  {(draft.kind === "lend" || draft.kind === "borrow") && (
                    <>
                      {field(t.person, draft.person || "", (v) =>
                        setDraft({ ...draft, person: v }),
                      )}
                      {field(
                        t.dueDate,
                        draft.dueDate || "",
                        (v) => setDraft({ ...draft, dueDate: v }),
                        t.dateHint,
                      )}
                    </>
                  )}
                  {button(saving ? t.saving : t.save, () => void saveDraft())}
                </>
              )}
              {repayment && (
                <>
                  <Text style={[s.statValue, textAlign]}>
                    {repayment.person} ·{" "}
                    {fmt(outstanding(repayment, txs), repayment.currency)}
                  </Text>
                  {field(t.amount, repayText, setRepayText, "0", true)}
                  {button(
                    saving ? t.saving : t.save,
                    () => void recordRepayment(),
                  )}
                </>
              )}
              {button(
                t.cancel,
                () => {
                  voiceStop.current?.();
                  setDraft(null);
                  setRepayment(null);
                  setError(null);
                },
                true,
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 20,
  },
  shell: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 235,
    backgroundColor: "#EFF2E8",
    borderRightWidth: 1,
    borderColor: C.line,
    padding: 28,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: C.lime,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "500",
    marginTop: -6,
  },
  brandText: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1.8,
    color: C.ink,
  },
  brandCaption: { fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 18 },
  sideNav: { gap: 10, marginTop: 60 },
  sideNavItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 15,
    borderRadius: 12,
  },
  sideNavActive: { backgroundColor: "#E0E8D5" },
  sidebarBottom: { marginTop: "auto" },
  main: { flex: 1 },
  content: { padding: 22, maxWidth: 1160, width: "100%", alignSelf: "center" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: C.green,
    letterSpacing: 1,
  },
  profilePill: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    backgroundColor: "#E9E4D9",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.green, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600", color: C.ink },
  pageHeading: { gap: 10, marginBottom: 26 },
  heading: {
    fontSize: 34,
    fontWeight: "600",
    letterSpacing: -1.2,
    lineHeight: 41,
    color: C.ink,
  },
  body: { fontSize: 14, lineHeight: 22, color: C.muted },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 22,
  },
  chips: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#EBEEE6",
  },
  chipActive: { backgroundColor: C.green },
  chipText: { fontSize: 12, fontWeight: "600", color: C.muted },
  balanceCard: {
    backgroundColor: C.green,
    padding: 28,
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 16,
  },
  balanceDecoration: {
    position: "absolute",
    width: 270,
    height: 270,
    borderRadius: 140,
    borderWidth: 42,
    borderColor: "#356651",
    right: -80,
    top: -110,
    transform: [{ rotate: "30deg" }],
  },
  balanceLabel: { fontSize: 13, color: "#D1DECE", fontWeight: "500" },
  balanceValue: {
    fontSize: 42,
    fontWeight: "500",
    letterSpacing: -1.5,
    color: C.white,
    marginVertical: 22,
  },
  balanceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  balanceHint: { fontSize: 11, color: "#C9DACA" },
  balanceMark: { fontSize: 24, color: C.lime },
  statRow: { flexDirection: "row", gap: 14, marginBottom: 22 },
  statCard: {
    flex: 1,
    padding: 20,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 17,
    backgroundColor: C.white,
    gap: 10,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: C.ink,
    marginVertical: 5,
  },
  entryCard: {
    borderWidth: 1,
    borderColor: "#CDDABC",
    backgroundColor: "#F1F5E8",
    padding: 22,
    borderRadius: 18,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.3,
  },
  entrySpark: { fontSize: 28, color: C.green },
  entryInput: {
    fontSize: 16,
    lineHeight: 25,
    color: C.ink,
    minHeight: 92,
    textAlignVertical: "top",
    paddingVertical: 12,
  },
  entryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 11,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  secondary: {
    backgroundColor: "#E7EDDF",
    borderWidth: 1,
    borderColor: "#D6DFCC",
  },
  smallButton: { paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { color: C.white, fontWeight: "600", fontSize: 13 },
  twoColumns: { flexDirection: "row", gap: 20 },
  card: {
    backgroundColor: C.white,
    padding: 23,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 22,
  },
  chartItem: { marginTop: 20 },
  inline: { flexDirection: "row", alignItems: "center", gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  barTrack: {
    height: 7,
    borderRadius: 5,
    backgroundColor: "#F0F2EB",
    marginTop: 4,
    overflow: "hidden",
  },
  bar: { height: 7, borderRadius: 5 },
  graph: {
    height: 192,
    flexDirection: "row",
    gap: 28,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingTop: 20,
  },
  graphColumn: { width: "35%", alignItems: "center", gap: 8 },
  graphTrack: { height: 112, width: "70%", justifyContent: "flex-end" },
  graphValue: { fontSize: 11, color: C.ink, fontWeight: "600" },
  netRow: {
    borderTopWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 18,
    marginTop: 22,
  },
  insightCard: {
    padding: 24,
    borderRadius: 18,
    backgroundColor: "#ECEFDF",
    gap: 12,
    marginBottom: 24,
  },
  insightTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "500",
    color: C.ink,
    letterSpacing: -0.3,
  },
  finePrint: { fontSize: 11, lineHeight: 17, color: C.muted },
  caption: { fontSize: 12, lineHeight: 18, color: C.muted },
  link: { fontSize: 12, color: C.green, fontWeight: "600" },
  transaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderColor: "#F0F2EB",
  },
  txIcon: {
    height: 42,
    width: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: { fontSize: 14, fontWeight: "600", color: C.ink },
  txAmount: { fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 26, gap: 10 },
  emptySymbol: { fontSize: 36, color: "#A5B892" },
  footer: { paddingVertical: 24, alignItems: "center" },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: 10,
    paddingBottom: 10,
  },
  navItem: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 3 },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 11 },
  input: {
    backgroundColor: "#F3F5EE",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 11,
    padding: 14,
    fontSize: 16,
    color: C.ink,
    minHeight: 48,
  },
  field: { gap: 9, marginVertical: 16 },
  error: {
    backgroundColor: "#F9E9E1",
    color: "#954527",
    padding: 14,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20,39,31,.35)",
    justifyContent: "center",
    padding: Platform.OS === "web" ? 20 : 12,
  },
  modal: {
    backgroundColor: C.paper,
    borderRadius: 24,
    maxHeight: "92%",
    maxWidth: 580,
    width: "100%",
    alignSelf: "center",
  },
  modalContent: { padding: 26, gap: 12 },
  badge: {
    fontSize: 11,
    color: C.green,
    backgroundColor: C.mint,
    borderRadius: 8,
    padding: 8,
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
});
