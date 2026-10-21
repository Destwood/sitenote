import { SITENOTE_ROOT_TAG } from "../../overlay";
import { hasHashedSegment, isStableClassName } from "../stable-class";

const MAX_ATTRIBUTE_VALUE_LENGTH = 64;
const MAX_ANCESTOR_DEPTH = 6;
const MAX_DATA_ATTRIBUTES = 3;
const MAX_CLASS_CANDIDATES = 3;
const TEST_ATTRIBUTES = ["data-testid", "data-test", "data-cy"];
const TRANSIENT_DATA_ATTRIBUTE =
  /^data-(?:state|active|selected|open|checked|disabled|focus|hover|expanded|loading|pressed|hidden|visible|index|key)$/;
const TRANSIENT_VALUE = /^(?:true|false|open|closed|on|off|null|undefined)$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_DIGIT_RUN = /\d{4,}/;
const GENERATED_ID_SYNTAX = /[:«»]|_r_[0-9a-z]+_/;
const FRAMEWORK_ID = /^(?:ember|ext-gen|ext-comp-?|gwt-uid-?)\d+$/i;

export function isStableId(id: string): boolean {
  return (
    id !== "" &&
    !GENERATED_ID_SYNTAX.test(id) &&
    !UUID.test(id) &&
    !LONG_DIGIT_RUN.test(id) &&
    !FRAMEWORK_ID.test(id) &&
    !hasHashedSegment(id)
  );
}

function isUsableValue(value: string | null): value is string {
  return value !== null && value !== "" && value.length <= MAX_ATTRIBUTE_VALUE_LENGTH;
}

function isStableDataValue(value: string | null): value is string {
  return (
    isUsableValue(value) &&
    !TRANSIENT_VALUE.test(value) &&
    !value.split(/\s+/).some(hasHashedSegment)
  );
}

function attributeSelector(name: string, value: string): string {
  return `[${CSS.escape(name)}="${CSS.escape(value)}"]`;
}

function stableClasses(element: Element): string[] {
  const names = (element.getAttribute("class") ?? "").split(/\s+/);
  return [...new Set(names)].filter((name) => name !== "" && isStableClassName(name));
}

function candidatesOf(element: Element): string[] {
  if (element.localName === SITENOTE_ROOT_TAG) {
    return [];
  }
  const tag = CSS.escape(element.localName);
  const candidates: string[] = [];

  const id = element.getAttribute("id");
  if (id !== null && isStableId(id)) {
    candidates.push(`#${CSS.escape(id)}`);
  }

  for (const name of TEST_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (isUsableValue(value)) {
      candidates.push(attributeSelector(name, value));
    }
  }

  let dataAttributes = 0;
  for (const attribute of element.attributes) {
    if (
      dataAttributes < MAX_DATA_ATTRIBUTES &&
      attribute.name.startsWith("data-") &&
      !TEST_ATTRIBUTES.includes(attribute.name) &&
      !TRANSIENT_DATA_ATTRIBUTE.test(attribute.name) &&
      !hasHashedSegment(attribute.name) &&
      isStableDataValue(attribute.value)
    ) {
      candidates.push(attributeSelector(attribute.name, attribute.value));
      dataAttributes += 1;
    }
  }

  const label = element.getAttribute("aria-label");
  if (isUsableValue(label)) {
    candidates.push(attributeSelector("aria-label", label));
  }
  const role = element.getAttribute("role");
  if (isUsableValue(role)) {
    candidates.push(`${tag}${attributeSelector("role", role)}`);
  }
  const name = element.getAttribute("name");
  if (isUsableValue(name)) {
    candidates.push(`${tag}${attributeSelector("name", name)}`);
  }

  const classes = stableClasses(element).map((className) => `.${CSS.escape(className)}`);
  for (const className of classes.slice(0, MAX_CLASS_CANDIDATES)) {
    candidates.push(`${tag}${className}`);
  }
  if (classes.length >= 2) {
    candidates.push(`${tag}${classes.slice(0, 2).join("")}`);
  }

  candidates.push(tag);
  return [...new Set(candidates)];
}

function isUniqueMatch(root: Document | ShadowRoot, selector: string, element: Element): boolean {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 && matches[0] === element;
}

function typeIndex(element: Element): number {
  let index = 1;
  for (
    let sibling = element.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    if (sibling.localName === element.localName) {
      index += 1;
    }
  }
  return index;
}

function stepSelector(element: Element): string {
  const siblings = [...(element.parentElement?.children ?? [])];
  for (const candidate of candidatesOf(element)) {
    if (siblings.filter((sibling) => sibling.matches(candidate)).length === 1) {
      return candidate;
    }
  }
  return `${CSS.escape(element.localName)}:nth-of-type(${String(typeIndex(element))})`;
}

export function buildNthPath(element: Element): string {
  const segments: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.localName === "body") {
      segments.push("body");
      break;
    }
    segments.push(`${CSS.escape(node.localName)}:nth-of-type(${String(typeIndex(node))})`);
  }
  return segments.reverse().join(" > ");
}

export function buildCssSelector(
  element: Element,
  root: Document | ShadowRoot = element.ownerDocument,
): string {
  const own = candidatesOf(element);
  for (const candidate of own) {
    if (isUniqueMatch(root, candidate, element)) {
      return candidate;
    }
  }

  const lineage: Element[] = [element];
  for (
    let ancestor = element.parentElement;
    ancestor && lineage.length <= MAX_ANCESTOR_DEPTH && ancestor.localName !== "html";
    ancestor = ancestor.parentElement
  ) {
    lineage.push(ancestor);
  }

  const steps = new Map<Element, string>();
  const stepOf = (node: Element): string => {
    const cached = steps.get(node);
    if (cached !== undefined) {
      return cached;
    }
    const step = stepSelector(node);
    steps.set(node, step);
    return step;
  };

  for (const [index, ancestor] of lineage.slice(1).entries()) {
    const depth = index + 1;
    const path = lineage.slice(0, depth).reverse().map(stepOf).join(" > ");
    for (const top of candidatesOf(ancestor)) {
      if (depth >= 2) {
        for (const candidate of own) {
          const selector = `${top} ${candidate}`;
          if (isUniqueMatch(root, selector, element)) {
            return selector;
          }
        }
      }
      const selector = `${top} > ${path}`;
      if (isUniqueMatch(root, selector, element)) {
        return selector;
      }
    }
  }

  return buildNthPath(element);
}
