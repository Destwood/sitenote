import { describe, expect, it } from "vitest";

import { isStableId } from ".";

const STABLE_IDS = [
  "hero",
  "hero-title",
  "main-content",
  "cards-heading",
  "site_header",
  "nav",
  "section2",
  "address-line1",
  "faq-3",
  "Footer",
  "app",
  "root",
  "__next",
  "checkout-step-2",
];

const GENERATED_IDS = [
  "",
  ":r1:",
  ":r0:",
  ":Rkq:",
  ":r1a:-label",
  "radix-:r2:",
  "headlessui-menu-button-:r3:",
  "«r1»",
  "«r2f»",
  "radix-«r4»",
  "_r_1_",
  "_r_2a_",
  "ember1",
  "ember123",
  "Ember4567",
  "ext-gen1042",
  "ext-comp-1001",
  "gwt-uid-17",
  "item-12345",
  "row1234",
  "user-98765432",
  "5f8a7b3c-9d4e-4a1b-8c2d-0e1f2a3b4c5d",
  "field-5F8A7B3C-9D4E-4A1B-8C2D-0E1F2A3B4C5D",
  "tab-panel-x9Y8z7",
  "a1b2c3d4e5",
  "x7Gh2kL9",
];

describe("isStableId", () => {
  it.each(STABLE_IDS)("keeps %j", (id) => {
    expect(isStableId(id)).toBe(true);
  });

  it.each(GENERATED_IDS)("rejects %j", (id) => {
    expect(isStableId(id)).toBe(false);
  });
});
