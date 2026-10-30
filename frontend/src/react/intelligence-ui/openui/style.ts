// Adapted from thesysdev/open-intelligent-ui (MIT); see LICENSE.
import { tagSchemaId } from "@openuidev/react-lang";
import type { CSSProperties } from "react";
import { z } from "zod/v4";

// Safety
// A model-written style value could otherwise load a resource: `background: url(...)`.
const UNSAFE_CSS = /(url|image|image-set|cross-fade|element|expression|paint|var|attr|env)\s*\(|@import|[\\;{}<>]/i;
const isSafeCss = (value: string) => !UNSAFE_CSS.test(value);

/** Absolute credential-free web URLs only. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

// Shared prop schemas
/** Children slot: any component, or a list of them (from @Each). Printed as `Node[]`. */
const node = z.unknown();
tagSchemaId(node, "Node");
export const children = z.array(node);

/** A token or a CSS color. Printed once as `Color` and explained in the prompt notes. */
export const color = z.string();
tagSchemaId(color, "Color");

/** A px number or a CSS length such as "50%". Printed as `Length`. */
export const length = z.union([z.number(), z.string()]);
tagSchemaId(length, "Length");

export const radiusSchema = z.union([z.enum(["sm", "md", "lg", "xl", "full"]), z.number()]);
tagSchemaId(radiusSchema, "Radius");

export const option = z.union([z.string(), z.object({ value: z.string(), label: z.string() })]);
export type Option = z.infer<typeof option>;
export const toOption = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

// Values to CSS
const STATUS = ["info", "success", "warning", "danger", "purple", "pink"] as const;
const FOREGROUND: Record<string, string> = {
  ink: "var(--iui-ink)",
  muted: "var(--iui-muted)",
  faint: "var(--iui-faint)",
  canvas: "var(--iui-canvas)",
  surface: "var(--iui-surface)",
  ...Object.fromEntries(STATUS.map((s) => [s, `var(--iui-${s})`])),
  ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`chart${i + 1}`, `var(--iui-chart-${i + 1})`])),
};
const BACKGROUND: Record<string, string> = {
  ...FOREGROUND,
  surface: "var(--iui-surface)",
  "surface-strong": "var(--iui-surface-strong)",
  border: "var(--iui-border)",
  ...Object.fromEntries(STATUS.map((s) => [s, `var(--iui-${s}-soft)`])),
};

const cssValue = (value: unknown) => (typeof value === "string" && value.trim() && isSafeCss(value) ? value.trim() : undefined);

/** Text, icon and stroke colors: a token or a CSS color. */
export const fg = (value: unknown) => (typeof value === "string" ? (FOREGROUND[value] ?? cssValue(value)) : undefined);
/** Backgrounds: status tokens become their soft tints. */
export const bg = (value: unknown) => (typeof value === "string" ? (BACKGROUND[value] ?? cssValue(value)) : undefined);

/** Palette colors always come from the active Socrates theme. */
export function onColor(_background: unknown): CSSProperties { return {}; }

/** Spacing in 4px steps. */
export const space = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? `${Math.min(24, Math.max(0, value)) * 4}px` : undefined);

export function size(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.max(0, value)}px`;
  if (typeof value !== "string") return undefined;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return `${value.trim()}px`;
  return /^\d+(\.\d+)?(px|%|em|rem|vh|vw|fr)$|^auto$/.test(value.trim()) ? value.trim() : undefined;
}

const RADIUS: Record<string, string> = {
  sm: "var(--iui-radius-sm)",
  md: "var(--iui-radius-md)",
  lg: "var(--iui-radius-lg)",
  xl: "var(--iui-radius-xl)",
  full: "999px",
};
export const radius = (value: unknown) => (typeof value === "string" ? RADIUS[value] : size(value));

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

/** A short plain-text name for an element, from its rendered text, for action messages. */
export const textOf = (element: HTMLElement | null) => (element?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
