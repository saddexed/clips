import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | bigint | null | undefined): string {
  if (bytes === null || bytes === undefined) return "-";
  const val = Number(bytes);
  if (val === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(val) / Math.log(k));
  return parseFloat((val / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
