import article from "./article.html?raw";
import landing from "./landing.html?raw";
import spa from "./spa.html?raw";

export const fixtures = { article, landing, spa };

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MODULE_HASH = /(?<=__)[A-Za-z0-9]{5}(?![A-Za-z0-9])/g;

export function renderHtml(html: string): void {
  document.body.innerHTML = html;
}

export function regenerateHashes(html: string): string {
  return html.replace(MODULE_HASH, (hash) =>
    Array.from(hash, (char) =>
      ALPHABET.charAt((ALPHABET.indexOf(char) + 7) % ALPHABET.length),
    ).join(""),
  );
}

export function query(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Fixture element not found: ${selector}`);
  }
  return element;
}

export function queryAll(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)];
}

export function centerOf(element: Element): { clientX: number; clientY: number } {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

export function selectText(needle: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = node.nodeValue ?? "";
    for (let index = data.indexOf(needle); index !== -1; index = data.indexOf(needle, index + 1)) {
      if (seen === occurrence) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        return range;
      }
      seen += 1;
    }
  }
  throw new Error(`Fixture text not found: ${needle}`);
}
