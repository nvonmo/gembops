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

/** Calendar days from the finding creation date to today (local midnight), minimum 0. */
export function daysSinceFindingCreated(createdAt: Date | string | null | undefined): number | null {
  if (createdAt == null) return null;
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(d.getTime())) return null;
  const createdDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - createdDay.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}
