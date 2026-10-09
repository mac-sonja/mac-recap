import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind class names; the `utils` alias shadcn components import. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
