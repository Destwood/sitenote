import { SITENOTE_ROOT_TAG } from "../../overlay";

const IGNORED_TAGS: ReadonlySet<string> = new Set([
  SITENOTE_ROOT_TAG,
  "script",
  "style",
  "noscript",
  "template",
  "textarea",
]);

export interface TextModel {
  readonly root: Node;
  readonly text: string;
  readonly nodes: readonly Text[];
  readonly starts: readonly number[];
  readonly indexes: ReadonlyMap<Text, number>;
}

export type TextSource = Node | TextModel;

export interface TextPoint {
  node: Text;
  offset: number;
}

export interface TextOffsets {
  start: number;
  end: number;
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function isDocumentNode(node: Node): node is Document {
  return node.nodeType === Node.DOCUMENT_NODE;
}

function isTextModel(source: TextSource): source is TextModel {
  return "nodes" in source && "starts" in source;
}

export function isIgnoredElement(element: Element): boolean {
  return IGNORED_TAGS.has(element.localName);
}

export function isInsideIgnoredElement(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    if (isElementNode(current) && isIgnoredElement(current)) {
      return true;
    }
  }
  return false;
}

function documentOf(node: Node): Document {
  return isDocumentNode(node) ? node : (node.ownerDocument ?? document);
}

function createTextWalker(root: Node): TreeWalker {
  return documentOf(root).createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isTextNode(node)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return isElementNode(node) && isIgnoredElement(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_SKIP;
    },
  });
}

function* textNodesOf(root: Node): Generator<Text> {
  if (isElementNode(root) && isIgnoredElement(root)) {
    return;
  }
  if (isTextNode(root)) {
    yield root;
    return;
  }
  const walker = createTextWalker(root);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (isTextNode(node)) {
      yield node;
    }
  }
}

export function buildTextModel(root: Node): TextModel {
  const nodes: Text[] = [];
  const starts: number[] = [];
  const indexes = new Map<Text, number>();
  const chunks: string[] = [];
  let length = 0;
  for (const node of textNodesOf(root)) {
    if (node.data.length === 0) {
      continue;
    }
    indexes.set(node, nodes.length);
    nodes.push(node);
    starts.push(length);
    chunks.push(node.data);
    length += node.data.length;
  }
  return { root, text: chunks.join(""), nodes, starts, indexes };
}

function modelOf(source: TextSource): TextModel {
  return isTextModel(source) ? source : buildTextModel(source);
}

export function readCollapsedText(root: Node, limit: number): string {
  let raw = "";
  let significant = 0;
  for (const node of textNodesOf(root)) {
    raw += node.data;
    significant += node.data.replace(/\s+/g, "").length;
    if (significant > limit) {
      break;
    }
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, limit).trimEnd();
}

export function offsetToPoint(
  source: TextSource,
  offset: number,
  bias: "start" | "end",
): TextPoint | null {
  const model = modelOf(source);
  if (!Number.isInteger(offset) || offset < 0 || offset > model.text.length) {
    return null;
  }
  let low = 0;
  let high = model.nodes.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const start = model.starts[middle] ?? 0;
    if (bias === "start" ? start <= offset : start < offset) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const index = Math.max(found, 0);
  const node = model.nodes[index];
  const start = model.starts[index];
  if (!node || start === undefined) {
    return null;
  }
  return { node, offset: offset - start };
}

export function pointToOffset(source: TextSource, node: Node, offset: number): number {
  const model = modelOf(source);
  if (isTextNode(node)) {
    const index = model.indexes.get(node);
    const start = index === undefined ? undefined : model.starts[index];
    if (start !== undefined) {
      return start + offset;
    }
  }
  const probe = documentOf(node).createRange();
  probe.setStart(node, offset);
  probe.collapse(true);
  let low = 0;
  let high = model.nodes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const candidate = model.nodes[middle];
    if (candidate && probe.comparePoint(candidate, 0) >= 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return model.starts[low] ?? model.text.length;
}

export function elementTextBounds(source: TextSource, element: Element): TextOffsets {
  return {
    start: pointToOffset(source, element, 0),
    end: pointToOffset(source, element, element.childNodes.length),
  };
}

export function rangeToOffsets(range: Range, source: TextSource): TextOffsets | null {
  const model = modelOf(source);
  const { root } = model;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = pointToOffset(model, range.startContainer, range.startOffset);
  const end = pointToOffset(model, range.endContainer, range.endOffset);
  return end > start ? { start, end } : null;
}

export function offsetsToRange(start: number, end: number, source: TextSource): Range | null {
  const model = modelOf(source);
  if (!(end > start)) {
    return null;
  }
  const from = offsetToPoint(model, start, "start");
  const to = offsetToPoint(model, end, "end");
  if (!from || !to) {
    return null;
  }
  const range = documentOf(from.node).createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}
