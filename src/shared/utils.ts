import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge told about the theme's custom tokens (globals.css), so `text-badge`
 * is read as a font size and `shadow-card` as a shadow, never merged away as a colour.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["badge"] }],
      shadow: [{ shadow: ["card", "control", "popover", "primary", "monogram", "page"] }],
    },
  },
});

/** Merges Tailwind class names; the `utils` alias shadcn components import. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
