const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const MARKDOWN_SPECIAL = /[\\`*_[\]<>#|~!]/g;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

export function escapeMarkdown(value: string): string {
  return value.replace(MARKDOWN_SPECIAL, (character) => `\\${character}`);
}

export function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function firstCodePoints(value: string, max: number): string {
  const points = Array.from(value);
  if (points.length <= max) {
    return value;
  }
  return `${points.slice(0, max - 1).join("")}…`;
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
