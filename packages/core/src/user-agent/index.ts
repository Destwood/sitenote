export interface UserAgentBrand {
  brand: string;
  version: string;
}

export interface UserAgentInput {
  userAgent: string;
  brands?: readonly UserAgentBrand[] | undefined;
  fullVersionList?: readonly UserAgentBrand[] | undefined;
  platform?: string | undefined;
  platformVersion?: string | undefined;
}

export interface BrowserInfo {
  name: string;
  version: string;
}

export interface OsInfo {
  name: string;
  version?: string | undefined;
}

export interface UserAgentSummary {
  browser: BrowserInfo;
  os: OsInfo;
}

export const UNKNOWN_BROWSER: BrowserInfo = { name: "Unknown", version: "" };
export const UNKNOWN_OS: OsInfo = { name: "Unknown" };

const GREASE_BRAND = /^Not.{0,2}A.{0,2}Brand$/i;
const BRAND_NAMES: Readonly<Record<string, string>> = {
  "Google Chrome": "Chrome",
  "Microsoft Edge": "Edge",
  "Opera GX": "Opera GX",
  Opera: "Opera",
  Brave: "Brave",
  Vivaldi: "Vivaldi",
  Chromium: "Chromium",
};
const GAMING_EDITION = /\(Edition GX\)|Edition GX/i;

const UA_BROWSERS: readonly { pattern: RegExp; name: string }[] = [
  { pattern: /\bEdg(?:e|A|iOS)?\/([\d.]+)/, name: "Edge" },
  { pattern: /\bOPR\/([\d.]+)/, name: "Opera" },
  { pattern: /\bVivaldi\/([\d.]+)/, name: "Vivaldi" },
  { pattern: /\b(?:Firefox|FxiOS)\/([\d.]+)/, name: "Firefox" },
  { pattern: /\b(?:Chrome|CriOS)\/([\d.]+)/, name: "Chrome" },
  { pattern: /\bVersion\/([\d.]+).*\bSafari\//, name: "Safari" },
];

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  "chrome os": "ChromeOS",
  chromeos: "ChromeOS",
  ios: "iOS",
};

const WINDOWS_NT_VERSIONS: Readonly<Record<string, string>> = {
  "6.1": "7",
  "6.2": "8",
  "6.3": "8.1",
};

function trimTrailingZeros(version: string): string {
  const parts = version.split(".");
  while (parts.length > 1 && parts[parts.length - 1] === "0") {
    parts.pop();
  }
  return parts.join(".");
}

function windowsVersion(platformVersion: string): string | undefined {
  const major = Number.parseInt(platformVersion, 10);
  if (Number.isNaN(major) || major < 1) {
    return undefined;
  }
  return major >= 13 ? "11" : "10";
}

function pickBrand(brands: readonly UserAgentBrand[]): UserAgentBrand | null {
  const real = brands.filter((entry) => !GREASE_BRAND.test(entry.brand));
  return real.find((entry) => entry.brand !== "Chromium") ?? real[0] ?? null;
}

function browserFromBrands(input: UserAgentInput): BrowserInfo | null {
  const picked = pickBrand(input.brands ?? []);
  if (picked === null) {
    return null;
  }
  const full = input.fullVersionList?.find((entry) => entry.brand === picked.brand);
  const mapped = BRAND_NAMES[picked.brand] ?? picked.brand;
  const name = mapped === "Opera" && GAMING_EDITION.test(input.userAgent) ? "Opera GX" : mapped;
  return { name, version: full?.version ?? picked.version };
}

function browserFromUserAgent(userAgent: string): BrowserInfo {
  for (const { pattern, name } of UA_BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match?.[1] !== undefined) {
      const resolved = name === "Opera" && GAMING_EDITION.test(userAgent) ? "Opera GX" : name;
      return { name: resolved, version: match[1] };
    }
  }
  return UNKNOWN_BROWSER;
}

function osFromPlatform(platform: string, platformVersion: string | undefined): OsInfo | null {
  const name = PLATFORM_NAMES[platform.trim().toLowerCase()];
  if (name === undefined) {
    return null;
  }
  const raw = platformVersion?.trim() ?? "";
  let version: string | undefined;
  if (raw !== "") {
    if (name === "Windows") {
      version = windowsVersion(raw);
    } else if (name === "macOS" || name === "Android" || name === "iOS") {
      version = trimTrailingZeros(raw.replace(/_/g, "."));
    }
  }
  return version === undefined ? { name } : { name, version };
}

function osFromUserAgent(userAgent: string): OsInfo {
  const windows = /Windows NT ([\d.]+)/.exec(userAgent);
  if (windows?.[1] !== undefined) {
    const version = WINDOWS_NT_VERSIONS[windows[1]];
    return version === undefined ? { name: "Windows" } : { name: "Windows", version };
  }
  const android = /Android ([\d.]+)/.exec(userAgent);
  if (android?.[1] !== undefined) {
    return { name: "Android", version: trimTrailingZeros(android[1]) };
  }
  if (/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) {
    const ios = /OS ([\d_]+) like Mac OS X/.exec(userAgent);
    return ios?.[1] === undefined
      ? { name: "iOS" }
      : { name: "iOS", version: trimTrailingZeros(ios[1].replace(/_/g, ".")) };
  }
  if (/\bMac OS X\b/.test(userAgent)) {
    return { name: "macOS" };
  }
  if (/\bCrOS\b/.test(userAgent)) {
    return { name: "ChromeOS" };
  }
  if (/\bLinux\b|\bX11\b/.test(userAgent)) {
    return { name: "Linux" };
  }
  return UNKNOWN_OS;
}

export function parseUserAgentData(input: UserAgentInput): UserAgentSummary {
  const browser = browserFromBrands(input) ?? browserFromUserAgent(input.userAgent);
  const os =
    (input.platform === undefined ? null : osFromPlatform(input.platform, input.platformVersion)) ??
    osFromUserAgent(input.userAgent);
  return { browser, os };
}
