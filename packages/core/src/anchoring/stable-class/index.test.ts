import { describe, expect, it } from "vitest";

import { hasHashedSegment, isStableClassName } from ".";

const STABLE = [
  "container",
  "btn",
  "btn-primary",
  "hero",
  "card-title",
  "is-active",
  "nav_item",
  "navBar",
  "NavBar",
  "myNavBar",
  "isOpen",
  "iPhone",
  "YouTube",
  "HEADER",
  "card__title",
  "card__title--large",
  "block__elem--mod",
  "block_mod_value",
  "Button_primary",
  "MuiButton-root",
  "Mui-focusVisible",
  "fa-solid",
  "ember-view",
  "md:px-4",
  "hover:bg-gray-100",
  "bg-[#fff]",
  "w-1/2",
  "w-[300px]",
  "h-[100vh]",
  "text-[length:var(--size)]",
  "max-w-screen-2xl",
  "bg-gray-100",
  "bg-slate-950",
  "grid-cols-12",
  "text-4xl",
  "z-50",
  "z-10000",
  "col-md-12",
  "col12",
  "h1",
  "html5-video",
  "css-grid",
  "mt-0.5",
  "-mt-4",
  "!important",
  "container-fluid",
];

const GENERATED = [
  "Button_root__a1B2c",
  "Home_container__bCOhY",
  "styles_hero__ZlQ1x",
  "_root_1x2y3",
  "_root_1x2y3_1",
  "_3x7Gh",
  "css-1x2y3z",
  "css-0",
  "css-1k9j2d-Button",
  "sc-bdfBwQ",
  "sc-gsDKAQ",
  "jsx-1234567",
  "jsx-1",
  "svelte-1x2y3z",
  "gsDKAQ",
  "xKqzP",
  "a1b2c3d4e5",
  "x7Gh2kL9",
  "1a2b3c",
  "card-a1b2c",
  "card__title--9f8e7d6",
  "tab-panel-x9Y8z7",
  "bdfBwQ",
  "Card_title__x9Y8z",
  "Header_nav__3fK2p",
  "_title_a8f3d_12",
  "css-18t94o8",
  "sc-eCImPb",
  "jsx-3141592653",
  "_container_1k2j3_1",
  "Layout_main__qW3rT",
  "Modal_overlay__M4n8B",
  "raQgk",
  "kbMcn",
  "Nav_link__hfZgk",
  "tbUfw",
  "",
];

describe("isStableClassName", () => {
  it.each(STABLE)("keeps %j", (name) => {
    expect(isStableClassName(name)).toBe(true);
  });

  it.each(GENERATED)("rejects %j", (name) => {
    expect(isStableClassName(name)).toBe(false);
  });

  it("covers at least 30 cases in each direction", () => {
    expect(STABLE.length).toBeGreaterThanOrEqual(30);
    expect(GENERATED.length).toBeGreaterThanOrEqual(30);
  });
});

describe("hasHashedSegment", () => {
  it("detects a hashed segment anywhere in a token", () => {
    expect(hasHashedSegment("tab-panel-x9Y8z7")).toBe(true);
    expect(hasHashedSegment("x9Y8z7-panel")).toBe(true);
  });

  it("ignores short, numeric and unit-like segments", () => {
    expect(hasHashedSegment("tab-12")).toBe(false);
    expect(hasHashedSegment("size-100vh")).toBe(false);
    expect(hasHashedSegment("grid12")).toBe(false);
    expect(hasHashedSegment("page-20240101")).toBe(false);
  });
});
