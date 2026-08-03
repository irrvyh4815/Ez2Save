import { describe, expect, it } from "vitest";
import { getNotificationStatus, isNotificationVisible } from "./notificationRules";

describe("notification reminder window", () => {
  it("shows an item on the configured first reminder day", () => {
    const status = getNotificationStatus("2026-08-10", "2026-08-03", 7);

    expect(status).toBe("upcoming");
    expect(isNotificationVisible(status)).toBe(true);
  });

  it("keeps an item quiet before the configured reminder window", () => {
    const status = getNotificationStatus("2026-08-11", "2026-08-03", 7);

    expect(status).toBe("scheduled");
    expect(isNotificationVisible(status)).toBe(false);
  });

  it("supports due-date-only reminders", () => {
    expect(getNotificationStatus("2026-08-04", "2026-08-03", 0)).toBe("scheduled");
    expect(getNotificationStatus("2026-08-04", "2026-08-04", 0)).toBe("due_today");
  });

  it("keeps overdue items visible until they are settled", () => {
    const status = getNotificationStatus("2026-08-02", "2026-08-03", 3);

    expect(status).toBe("overdue");
    expect(isNotificationVisible(status)).toBe(true);
  });
});
