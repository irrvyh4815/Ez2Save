import { describe, expect, it } from "vitest";
import {
  buildDueEvents,
  isEventDue,
  monthlyDueDate,
  notificationKey,
  preferenceFor,
  shouldDeliver,
  taipeiDate
} from "./push-candidates.js";
import { verifyCronSecret } from "./push-utils.js";

describe("web push reminder candidates", () => {
  it("uses the real last day for shorter months", () => {
    expect(monthlyDueDate("2026-02-03", 31)).toBe("2026-02-28");
  });

  it("uses Asia/Taipei when determining the current day", () => {
    expect(taipeiDate(new Date("2026-08-02T16:30:00.000Z"))).toBe("2026-08-03");
  });

  it("excludes settled debts and creates only active reminders", () => {
    const events = buildDueEvents({
      today: "2026-08-03",
      tables: {
        creditCards: [{ id: "card", user_id: "user", ledger_id: "ledger", is_active: true, statement_day: 5, payment_due_day: 20, unbilled_amount_cents: 1000, current_statement_amount_cents: 0 }],
        installments: [{ id: "paid-installment", user_id: "user", ledger_id: "ledger", status: "paid_off", remaining_amount_cents: 0, next_due_date: "2026-08-05" }],
        loans: [{ id: "paid-loan", user_id: "user", ledger_id: "ledger", status: "paid_off", remaining_principal_cents: 0, monthly_payment_day: 4 }],
        reminders: [{ id: "done", user_id: "user", ledger_id: "ledger", status: "done", debit_day: 3, start_date: "2026-01-01" }],
        deposits: [],
        insurance: []
      }
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("credit_card");
    expect(events[0].dueDate).toBe("2026-08-05");
  });

  it("honors each user's ledger preference", () => {
    const preferences = new Map([
      ["user:ledger:loan", { is_enabled: true, remind_days_before: 3, delivery_mode: "single", repeat_hours: 24 }]
    ]);
    const preference = preferenceFor(preferences, "user", "ledger", "loan");
    const event = { dueDate: "2026-08-06" };

    expect(isEventDue(event, preference, "2026-08-03")).toBe(true);
    expect(preference.deliveryMode).toBe("single");
  });

  it("repeats only after the configured interval", () => {
    const preference = { deliveryMode: "repeat", repeatHours: 12 };
    const previous = { status: "sent", last_sent_at: "2026-08-03T00:00:00.000Z" };

    expect(shouldDeliver(previous, preference, new Date("2026-08-03T11:59:59.000Z"))).toBe(false);
    expect(shouldDeliver(previous, preference, new Date("2026-08-03T12:00:00.000Z"))).toBe(true);
  });

  it("creates stable keys without financial details", () => {
    expect(notificationKey({ type: "loan", sourceId: "record-id", kind: "payment", dueDate: "2026-08-04" })).toBe("loan:record-id:payment:2026-08-04");
  });
});

describe("web push cron authorization", () => {
  it("accepts a Vercel secret with a trailing input newline", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "a-secure-cron-secret-value-123456\n";
    try {
      expect(verifyCronSecret({ headers: { authorization: "Bearer a-secure-cron-secret-value-123456" } })).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
