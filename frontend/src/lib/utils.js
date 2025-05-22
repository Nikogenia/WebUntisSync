import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export function formatTime(dateString) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat("de-DE", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).format(date)
}
