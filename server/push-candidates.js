const dayMilliseconds = 86_400_000;

export const notificationDefaults = Object.freeze({
  credit_card: { remindDaysBefore: 7, deliveryMode: "repeat", repeatHours: 12 },
  installment: { remindDaysBefore: 7, deliveryMode: "repeat", repeatHours: 12 },
  loan: { remindDaysBefore: 7, deliveryMode: "repeat", repeatHours: 12 },
  reminder: { remindDaysBefore: 3, deliveryMode: "repeat", repeatHours: 12 },
  deposit: { remindDaysBefore: 14, deliveryMode: "single", repeatHours: 24 },
  insurance: { remindDaysBefore: 14, deliveryMode: "repeat", repeatHours: 12 }
});

export function taipeiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function daysBetween(fromDate, toDate) {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / dayMilliseconds);
}

export function monthlyDueDate(referenceDate, day) {
  const reference = parseDate(referenceDate);
  const requestedDay = Math.max(1, Math.min(31, Number(day) || 1));
  if (!reference) return null;
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year, month, Math.min(requestedDay, lastDay))));
}

export function preferenceFor(preferences, userId, ledgerId, type, reminderDaysBefore) {
  const saved = preferences.get(`${userId}:${ledgerId}:${type}`);
  const defaults = notificationDefaults[type] || notificationDefaults.reminder;
  return {
    isEnabled: saved?.is_enabled ?? true,
    remindDaysBefore: clampInteger(saved?.remind_days_before ?? reminderDaysBefore ?? defaults.remindDaysBefore, 0, 90),
    deliveryMode: saved?.delivery_mode === "single" ? "single" : defaults.deliveryMode,
    repeatHours: clampInteger(saved?.repeat_hours ?? defaults.repeatHours, 1, 168)
  };
}

export function buildDueEvents({ tables, today }) {
  const events = [];
  for (const row of tables.creditCards || []) {
    if (!row.is_active) continue;
    if (Number(row.unbilled_amount_cents) > 0) events.push(createEvent(row, "credit_card", "statement", monthlyDueDate(today, row.statement_day), "cards"));
    if (Number(row.current_statement_amount_cents) > 0) events.push(createEvent(row, "credit_card", "payment", monthlyDueDate(today, row.payment_due_day), "cards"));
  }
  for (const row of tables.installments || []) {
    if (row.status === "active" && Number(row.remaining_amount_cents) > 0 && row.next_due_date) {
      events.push(createEvent(row, "installment", "payment", row.next_due_date, "cards"));
    }
  }
  for (const row of tables.loans || []) {
    if (row.status === "active" && Number(row.remaining_principal_cents) > 0) {
      events.push(createEvent(row, "loan", "payment", monthlyDueDate(today, row.monthly_payment_day), "loans"));
    }
  }
  for (const row of tables.reminders || []) {
    if (row.status === "done" || (row.start_date && daysBetween(row.start_date, today) < 0) || (row.end_date && daysBetween(today, row.end_date) < 0)) continue;
    events.push(createEvent(row, "reminder", "payment", monthlyDueDate(today, row.debit_day), "reminders", row.remind_days_before));
  }
  for (const row of tables.deposits || []) {
    if (row.is_active && row.maturity_date) events.push(createEvent(row, "deposit", "maturity", row.maturity_date, "deposits"));
  }
  for (const row of tables.insurance || []) {
    if (row.status !== "active") continue;
    if (Number(row.annual_premium_cents) > 0) events.push(createEvent(row, "insurance", "payment", monthlyDueDate(today, row.payment_day), "insurance"));
    if (row.renewal_date) events.push(createEvent(row, "insurance", "renewal", row.renewal_date, "insurance"));
  }
  return events.filter((event) => event.dueDate);
}

export function isEventDue(event, preference, today) {
  if (!preference.isEnabled) return false;
  const remainingDays = daysBetween(today, event.dueDate);
  return Number.isFinite(remainingDays) && remainingDays <= preference.remindDaysBefore;
}

export function shouldDeliver(previous, preference, now = new Date()) {
  if (!previous) return true;
  if (preference.deliveryMode === "single" && previous.status === "sent") return false;
  if (!previous.last_sent_at) return true;
  const previousTime = new Date(previous.last_sent_at).getTime();
  if (!Number.isFinite(previousTime)) return true;
  return now.getTime() - previousTime >= preference.repeatHours * 3_600_000;
}

export function notificationKey(event) {
  return `${event.type}:${event.sourceId}:${event.kind}:${event.dueDate}`.slice(0, 180);
}

function createEvent(row, type, kind, dueDate, page, remindDaysBefore) {
  return {
    type,
    kind,
    dueDate,
    page,
    sourceId: row.id,
    ownerUserId: row.user_id,
    ledgerId: row.ledger_id || null,
    remindDaysBefore
  };
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function clampInteger(value, minimum, maximum) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : minimum;
}
