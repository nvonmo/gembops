import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** True if the due date (YYYY-MM-DD) is before today (by calendar day, local time). Avoids timezone bugs where "2026-03-03" parsed as midnight UTC appears overdue on 2026-03-02 evening. */
export function isOverdueByDate(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const dueStr = dueDate.slice(0, 10);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return todayStr > dueStr;
}
