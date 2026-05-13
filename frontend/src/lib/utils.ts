import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(iso: string): string {
  // Bare YYYY-MM-DD has no timezone — parse as local, not UTC,
  // so the displayed day matches what the user typed in <input type="date">.
  const bareDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = bareDate
    ? new Date(Number(bareDate[1]), Number(bareDate[2]) - 1, Number(bareDate[3]))
    : new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
