import { createDocumentStyle } from "../document-style";

export const HIGHLIGHT_NAME = "sitenote";
export const HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgb(29 78 216 / 0.25); }`;

export interface TextHighlighter {
  supported: boolean;
  set: (ranges: readonly Range[]) => void;
  dispose: () => void;
}

export function isHighlightApiAvailable(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

export function createTextHighlighter(doc: Document): TextHighlighter {
  const supported = isHighlightApiAvailable();
  const style = createDocumentStyle(doc, HIGHLIGHT_CSS);

  function clear(): void {
    if (supported) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    }
  }

  return {
    supported,
    set: (ranges) => {
      if (!supported) {
        return;
      }
      if (ranges.length === 0) {
        clear();
        return;
      }
      style.attach();
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    },
    dispose: () => {
      clear();
      style.detach();
    },
  };
}
