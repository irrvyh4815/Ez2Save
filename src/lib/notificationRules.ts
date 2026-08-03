export type NotificationStatus = "overdue" | "due_today" | "upcoming" | "scheduled";

export function getNotificationStatus(date: string, todayIso: string, remindDaysBefore: number): NotificationStatus {
  const diff = getDaysBetween(todayIso, date);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due_today";
  if (diff <= Math.max(0, remindDaysBefore)) return "upcoming";
  return "scheduled";
}

export function isNotificationVisible(status: NotificationStatus): boolean {
  return status !== "scheduled";
}

function getDaysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00+08:00`).getTime();
  const to = new Date(`${toIso}T00:00:00+08:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}
