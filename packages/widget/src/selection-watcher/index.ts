export interface SelectionWatcherDeps {
  doc: Document;
  isOwn: (node: Node | null) => boolean;
  onChange: (range: Range | null) => void;
}

export function watchSelection(deps: SelectionWatcherDeps): () => void {
  const { doc } = deps;
  let active = false;

  function report(range: Range | null): void {
    if (range === null && !active) {
      return;
    }
    active = range !== null;
    deps.onChange(range);
  }

  function readRange(): Range | null {
    const selection = doc.getSelection();
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (
      deps.isOwn(selection.anchorNode) ||
      deps.isOwn(selection.focusNode) ||
      deps.isOwn(range.commonAncestorContainer) ||
      range.toString().trim() === ""
    ) {
      return null;
    }
    return range.cloneRange();
  }

  function evaluate(): void {
    report(readRange());
  }

  function handleSelectionChange(): void {
    const selection = doc.getSelection();
    if (selection === null || selection.isCollapsed) {
      report(null);
    }
  }

  doc.addEventListener("mouseup", evaluate, { passive: true });
  doc.addEventListener("keyup", evaluate, { passive: true });
  doc.addEventListener("selectionchange", handleSelectionChange, { passive: true });

  return () => {
    doc.removeEventListener("mouseup", evaluate);
    doc.removeEventListener("keyup", evaluate);
    doc.removeEventListener("selectionchange", handleSelectionChange);
  };
}
