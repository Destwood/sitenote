export type DocumentStyleMode = "adopted" | "element";

export interface DocumentStyle {
  attach: () => DocumentStyleMode;
  detach: () => void;
}

export function createDocumentStyle(doc: Document, css: string): DocumentStyle {
  let sheet: CSSStyleSheet | null = null;
  let element: HTMLStyleElement | null = null;
  let mode: DocumentStyleMode | null = null;

  function adopt(): boolean {
    try {
      if (sheet === null) {
        const created = new CSSStyleSheet();
        created.replaceSync(css);
        sheet = created;
      }
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      return true;
    } catch {
      return false;
    }
  }

  function insertElement(): void {
    element = doc.createElement("style");
    element.textContent = css;
    (doc.querySelector("head") ?? doc.documentElement).append(element);
  }

  return {
    attach: () => {
      if (mode !== null) {
        return mode;
      }
      mode = adopt() ? "adopted" : "element";
      if (mode === "element") {
        insertElement();
      }
      return mode;
    },
    detach: () => {
      if (mode === "adopted") {
        const owned = sheet;
        doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((item) => item !== owned);
      } else if (mode === "element") {
        element?.remove();
        element = null;
      }
      mode = null;
    },
  };
}
