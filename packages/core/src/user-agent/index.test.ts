import { describe, expect, it } from "vitest";

import { UNKNOWN_BROWSER, UNKNOWN_OS, parseUserAgentData, type UserAgentInput } from ".";

const GREASE = { brand: "Not?A_Brand", version: "99" };

function chromiumInput(
  userAgent: string,
  brand: string,
  version: string,
  platform: string,
  platformVersion: string,
): UserAgentInput {
  const full = `${version}.0.6723.92`;
  return {
    userAgent,
    brands: [GREASE, { brand: "Chromium", version }, { brand, version }],
    fullVersionList: [
      { brand: "Not?A_Brand", version: "99.0.0.0" },
      { brand: "Chromium", version: full },
      { brand, version: full },
    ],
    platform,
    platformVersion,
  };
}

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/130.0.2849.56`;
const EDGE_MAC = `${CHROME_MAC} Edg/130.0.2849.56`;
const EDGE_LINUX = `${CHROME_LINUX} Edg/130.0.2849.56`;
const GX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0 (Edition GX)";
const GX_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0 (Edition GX)";
const GX_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0 (Edition GX)";

describe("parseUserAgentData with userAgentData", () => {
  it("reads Chrome on Windows 11, macOS and Linux", () => {
    expect(
      parseUserAgentData(
        chromiumInput(CHROME_WINDOWS, "Google Chrome", "130", "Windows", "15.0.0"),
      ),
    ).toEqual({
      browser: { name: "Chrome", version: "130.0.6723.92" },
      os: { name: "Windows", version: "11" },
    });
    expect(
      parseUserAgentData(chromiumInput(CHROME_MAC, "Google Chrome", "130", "macOS", "14.5.0")),
    ).toEqual({
      browser: { name: "Chrome", version: "130.0.6723.92" },
      os: { name: "macOS", version: "14.5" },
    });
    expect(
      parseUserAgentData(chromiumInput(CHROME_LINUX, "Google Chrome", "130", "Linux", "6.8.0")),
    ).toEqual({
      browser: { name: "Chrome", version: "130.0.6723.92" },
      os: { name: "Linux" },
    });
  });

  it("reads Edge on Windows 10, macOS and Linux", () => {
    expect(
      parseUserAgentData(chromiumInput(EDGE_WINDOWS, "Microsoft Edge", "130", "Windows", "10.0.0")),
    ).toEqual({
      browser: { name: "Edge", version: "130.0.6723.92" },
      os: { name: "Windows", version: "10" },
    });
    expect(
      parseUserAgentData(chromiumInput(EDGE_MAC, "Microsoft Edge", "130", "macOS", "13.6.1")),
    ).toEqual({
      browser: { name: "Edge", version: "130.0.6723.92" },
      os: { name: "macOS", version: "13.6.1" },
    });
    expect(
      parseUserAgentData(chromiumInput(EDGE_LINUX, "Microsoft Edge", "130", "Linux", "")),
    ).toEqual({
      browser: { name: "Edge", version: "130.0.6723.92" },
      os: { name: "Linux" },
    });
  });

  it("reads Opera GX from its own brand or from the Opera brand with the GX edition", () => {
    expect(
      parseUserAgentData(chromiumInput(GX_WINDOWS, "Opera GX", "110", "Windows", "15.0.0")),
    ).toEqual({
      browser: { name: "Opera GX", version: "110.0.6723.92" },
      os: { name: "Windows", version: "11" },
    });
    expect(parseUserAgentData(chromiumInput(GX_MAC, "Opera", "110", "macOS", "14.5.0"))).toEqual({
      browser: { name: "Opera GX", version: "110.0.6723.92" },
      os: { name: "macOS", version: "14.5" },
    });
    expect(parseUserAgentData(chromiumInput(GX_LINUX, "Opera", "110", "Linux", ""))).toEqual({
      browser: { name: "Opera GX", version: "110.0.6723.92" },
      os: { name: "Linux" },
    });
  });

  it("uses the brand version without a full version list and names Chromium last", () => {
    expect(
      parseUserAgentData({
        userAgent: CHROME_LINUX,
        brands: [GREASE, { brand: "Chromium", version: "130" }],
        platform: "Linux",
      }),
    ).toEqual({ browser: { name: "Chromium", version: "130" }, os: { name: "Linux" } });
    expect(
      parseUserAgentData({
        userAgent: CHROME_LINUX,
        brands: [{ brand: "Chromium", version: "130" }, { brand: "Brave", version: "130" }, GREASE],
        platform: "Linux",
      }).browser,
    ).toEqual({ name: "Brave", version: "130" });
  });

  it("ignores every known grease brand shape", () => {
    for (const brand of [
      "Not.A/Brand",
      "Not;A=Brand",
      "Not A(Brand",
      "Not)A;Brand",
      "Not_A Brand",
      "Not/A)Brand",
      "Not A;Brand",
    ]) {
      expect(
        parseUserAgentData({
          userAgent: CHROME_WINDOWS,
          brands: [
            { brand, version: "8" },
            { brand: "Google Chrome", version: "130" },
          ],
          platform: "Windows",
          platformVersion: "10.0.0",
        }).browser.name,
      ).toBe("Chrome");
    }
  });

  it("omits the os version when the platform version is unusable", () => {
    for (const platformVersion of ["0.3.0", "", "x"]) {
      expect(
        parseUserAgentData({ userAgent: CHROME_WINDOWS, platform: "Windows", platformVersion }).os,
      ).toEqual({ name: "Windows" });
    }
  });

  it("normalises platform names", () => {
    const name = (platform: string) =>
      parseUserAgentData({ userAgent: "", platform, platformVersion: "14.0.0" }).os;
    expect(name("Chrome OS")).toEqual({ name: "ChromeOS" });
    expect(name("Android")).toEqual({ name: "Android", version: "14" });
    expect(name("iOS")).toEqual({ name: "iOS", version: "14" });
  });

  it("falls back to the user agent string for an unknown platform", () => {
    expect(
      parseUserAgentData({ userAgent: CHROME_MAC, platform: "Plan9", platformVersion: "1" }).os,
    ).toEqual({ name: "macOS" });
  });
});

describe("parseUserAgentData with the user agent string only", () => {
  it("reads Chrome, Edge and Opera GX on Windows, macOS and Linux", () => {
    expect(parseUserAgentData({ userAgent: CHROME_WINDOWS })).toEqual({
      browser: { name: "Chrome", version: "130.0.0.0" },
      os: { name: "Windows" },
    });
    expect(parseUserAgentData({ userAgent: CHROME_MAC })).toEqual({
      browser: { name: "Chrome", version: "130.0.0.0" },
      os: { name: "macOS" },
    });
    expect(parseUserAgentData({ userAgent: CHROME_LINUX })).toEqual({
      browser: { name: "Chrome", version: "130.0.0.0" },
      os: { name: "Linux" },
    });
    expect(parseUserAgentData({ userAgent: EDGE_WINDOWS }).browser).toEqual({
      name: "Edge",
      version: "130.0.2849.56",
    });
    expect(parseUserAgentData({ userAgent: EDGE_MAC }).browser.name).toBe("Edge");
    expect(parseUserAgentData({ userAgent: EDGE_LINUX }).browser.name).toBe("Edge");
    expect(parseUserAgentData({ userAgent: GX_WINDOWS })).toEqual({
      browser: { name: "Opera GX", version: "110.0.0.0" },
      os: { name: "Windows" },
    });
    expect(parseUserAgentData({ userAgent: GX_MAC }).browser.name).toBe("Opera GX");
    expect(parseUserAgentData({ userAgent: GX_LINUX }).browser.name).toBe("Opera GX");
  });

  it("reads plain Opera, Vivaldi, Firefox and Safari", () => {
    expect(
      parseUserAgentData({ userAgent: GX_WINDOWS.replace(" (Edition GX)", "") }).browser,
    ).toEqual({ name: "Opera", version: "110.0.0.0" });
    expect(
      parseUserAgentData({ userAgent: `${CHROME_LINUX} Vivaldi/6.9.3447.37` }).browser,
    ).toEqual({ name: "Vivaldi", version: "6.9.3447.37" });
    expect(
      parseUserAgentData({
        userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
      }).browser,
    ).toEqual({ name: "Firefox", version: "131.0" });
    expect(
      parseUserAgentData({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      }).browser,
    ).toEqual({ name: "Safari", version: "17.5" });
  });

  it("reads mobile and Chrome OS agents", () => {
    expect(
      parseUserAgentData({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      }).os,
    ).toEqual({ name: "Android", version: "14" });
    expect(
      parseUserAgentData({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      }).os,
    ).toEqual({ name: "iOS", version: "17.5" });
    expect(
      parseUserAgentData({
        userAgent:
          "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      }).os,
    ).toEqual({ name: "ChromeOS" });
  });

  it("maps older Windows NT versions and leaves 10.0 ambiguous", () => {
    expect(parseUserAgentData({ userAgent: "Mozilla/5.0 (Windows NT 6.1; Win64)" }).os).toEqual({
      name: "Windows",
      version: "7",
    });
    expect(parseUserAgentData({ userAgent: "Mozilla/5.0 (Windows NT 6.3; Win64)" }).os).toEqual({
      name: "Windows",
      version: "8.1",
    });
  });

  it("returns unknown values for an empty or unrecognised agent", () => {
    expect(parseUserAgentData({ userAgent: "" })).toEqual({
      browser: UNKNOWN_BROWSER,
      os: UNKNOWN_OS,
    });
    expect(parseUserAgentData({ userAgent: "curl/8.0", brands: [GREASE] })).toEqual({
      browser: UNKNOWN_BROWSER,
      os: UNKNOWN_OS,
    });
  });
});
