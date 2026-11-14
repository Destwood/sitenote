import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import type { SiteInfo, WorkspaceInfo } from "@sitenote/widget";
import { LAST_WORKSPACE_KEY, SitePanel, hostOf, type WorkspaceControl } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  toggleCommentMode: vi.fn(),
  getTargetTab: vi.fn(),
  hasOriginAccess: vi.fn(),
  requestOriginAccess: vi.fn(),
  pendingSet: vi.fn(),
  pendingClear: vi.fn(),
  onManageSites: vi.fn(),
  onWorkspaceControl: vi.fn<(control: WorkspaceControl | null) => void>(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  toggleCommentMode: mocks.toggleCommentMode,
}));

vi.mock("../tab-access", () => ({
  getTargetTab: mocks.getTargetTab,
  hasOriginAccess: mocks.hasOriginAccess,
  requestOriginAccess: mocks.requestOriginAccess,
}));

vi.mock("../pending-enable", () => ({
  createPendingEnable: () => ({
    set: mocks.pendingSet,
    take: vi.fn(),
    clear: mocks.pendingClear,
  }),
}));

vi.mock("../page-threads-panel", () => ({
  PageThreadsPanel: ({ tabId }: { tabId: number }) => (
    <div data-testid="page-threads-panel">{tabId}</div>
  ),
}));

vi.mock("../selection-placement-control", () => ({ SelectionPlacementControl: () => null }));

vi.mock("../record-button", () => ({ RecordButton: () => null }));

vi.mock("../update-notice", () => ({ ExtensionUpdateNotice: () => null }));

vi.mock("wxt/browser", () => ({
  browser: { storage: { local: {} }, runtime: { getManifest: () => ({ version: "0.1.7" }) } },
}));

const ORIGIN = "https://example.test";
const HOST = "example.test";
const COMMENT_MODE = /^Comment mode/;
const NORTHWIND: WorkspaceInfo = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Northwind",
  role: "owner",
};
const AGENCY: WorkspaceInfo = {
  id: "10000000-0000-4000-8000-000000000002",
  name: "Agency",
  role: "guest",
};
const SITE: SiteInfo = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: NORTHWIND.id,
  workspaceName: "Northwind",
  role: "owner",
  userId: "00000000-0000-4000-8000-000000000001",
  captureErrors: true,
};

function route(handlers: Record<string, () => unknown>) {
  mocks.sendMessage.mockImplementation((request: { type: string }) => {
    const handler = handlers[request.type];
    return Promise.resolve(handler === undefined ? failure("unknown") : handler());
  });
}

function renderPanel() {
  return render(
    <SitePanel
      webUrl="https://web.test"
      onManageSites={mocks.onManageSites}
      onWorkspaceControl={mocks.onWorkspaceControl}
    />,
  );
}

function lastControl(): WorkspaceControl {
  const control = mocks.onWorkspaceControl.mock.lastCall?.[0];
  if (!control) {
    throw new Error("No workspace control is published");
  }
  return control;
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "More options" }));
}

function chooseWorkspace(id: string) {
  act(() => {
    lastControl().onChange(id);
  });
}

beforeEach(() => {
  localStorage.clear();
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.getTargetTab.mockResolvedValue({ id: 7, origin: ORIGIN });
  mocks.hasOriginAccess.mockResolvedValue(false);
  mocks.requestOriginAccess.mockResolvedValue(true);
});

describe("hostOf", () => {
  it("keeps only the host of an origin", () => {
    expect(hostOf("https://example.test:8443")).toBe("example.test:8443");
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("SitePanel unavailable pages", () => {
  it.each([
    ["no tab", null],
    ["a tab without a scriptable origin", { id: 7, origin: null }],
  ])("says Sitenote is not available for %s", async (_name, tab) => {
    mocks.getTargetTab.mockResolvedValue(tab);

    renderPanel();

    expect((await screen.findByTestId("site-unavailable")).textContent).toBe(
      "Sitenote is not available on this page.",
    );
    expect(screen.getByText("Chrome system pages can’t be annotated.")).toBeTruthy();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.onWorkspaceControl).toHaveBeenLastCalledWith(null);
  });

  it("shows a status with a spinner while the page is checked", () => {
    mocks.getTargetTab.mockReturnValue(new Promise(() => undefined));

    renderPanel();

    expect(screen.getByRole("status").textContent).toBe("Checking this page...");
  });
});

describe("SitePanel when the site is not enabled", () => {
  function notEnabled(workspaces: WorkspaceInfo[] = [NORTHWIND, AGENCY]) {
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success(workspaces),
    });
  }

  it("shows the host and the state in the card and publishes both workspaces for the footer", async () => {
    notEnabled();

    renderPanel();

    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
    expect(screen.getByTestId("site-origin").textContent).toBe(HOST);
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
    expect(lastControl().value).toBe(NORTHWIND.id);
    expect(lastControl().options).toEqual([NORTHWIND, AGENCY]);
    expect(lastControl().disabled).toBe(false);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "sites.forOrigin", origin: ORIGIN });
  });

  it("defaults to the workspace used last time when it is still available", async () => {
    localStorage.setItem(LAST_WORKSPACE_KEY, AGENCY.id);
    notEnabled();

    renderPanel();

    await vi.waitFor(() => {
      expect(lastControl().value).toBe(AGENCY.id);
    });
  });

  it("falls back to the first workspace when the remembered one is gone", async () => {
    localStorage.setItem(LAST_WORKSPACE_KEY, "10000000-0000-4000-8000-000000000099");
    notEnabled();

    renderPanel();

    await vi.waitFor(() => {
      expect(lastControl().value).toBe(NORTHWIND.id);
    });
  });

  it("explains the limit for guests when a guest workspace is selected", async () => {
    notEnabled();
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().options).toHaveLength(2);
    });
    expect(screen.queryByText(/Guests can enable only sites/)).toBeNull();

    chooseWorkspace(AGENCY.id);

    expect(await screen.findByText(/Guests can enable only sites/)).toBeTruthy();
    expect(lastControl().value).toBe(AGENCY.id);
  });

  it("hides the choice when the user has exactly one workspace but still publishes it", async () => {
    notEnabled([NORTHWIND]);

    renderPanel();

    expect(await screen.findByRole("button", { name: "Enable on this site" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
    expect(lastControl().options).toEqual([NORTHWIND]);
  });

  it("explains that the site will be available on the host", async () => {
    notEnabled();

    renderPanel();

    expect(
      await screen.findByText(`Sitenote will be available whenever you visit ${HOST}.`),
    ).toBeTruthy();
  });

  it("points to the web app when the user has no workspace", async () => {
    notEnabled([]);

    renderPanel();

    const link = await screen.findByRole("link", { name: "Create one on the web" });
    expect(link.getAttribute("href")).toBe("https://web.test/app");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByRole("button", { name: "Enable on this site" })).toBeNull();
  });

  it("opens the dashboard of the workspace selected for the site from the menu", async () => {
    const user = userEvent.setup();
    notEnabled();
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().options).toHaveLength(2);
    });
    chooseWorkspace(AGENCY.id);

    await openMenu(user);

    expect(screen.getByRole("link", { name: "Open dashboard" }).getAttribute("href")).toBe(
      `https://web.test/app/w/${AGENCY.id}`,
    );
  });

  it("opens the dashboard route from the menu when the user has no workspace", async () => {
    const user = userEvent.setup();
    notEnabled([]);
    renderPanel();
    await screen.findByRole("link", { name: "Create one on the web" });

    await openMenu(user);

    expect(screen.getByRole("link", { name: "Open dashboard" }).getAttribute("href")).toBe(
      "https://web.test/app/dashboard",
    );
  });

  it("hands the enable to the background and waits until the site is enabled", async () => {
    const user = userEvent.setup();
    let polls = 0;
    route({
      "sites.forOrigin": () => {
        polls += 1;
        return success(
          polls > 1
            ? { ...SITE, workspaceId: AGENCY.id, workspaceName: AGENCY.name, role: "member" }
            : null,
        );
      },
      "workspaces.list": () => success([NORTHWIND, { ...AGENCY, role: "member" }]),
    });
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().options).toHaveLength(2);
    });
    chooseWorkspace(AGENCY.id);

    await user.click(screen.getByRole("button", { name: "Enable on this site" }));

    await vi.waitFor(() => {
      expect(screen.getByTestId("site-state").textContent).toBe("Enabled in Agency");
    });
    expect(mocks.pendingSet).toHaveBeenCalledWith({
      tabId: 7,
      origin: ORIGIN,
      workspaceId: AGENCY.id,
    });
    expect(mocks.requestOriginAccess).toHaveBeenCalledWith(ORIGIN);
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "sites.enable" }),
    );
    expect(mocks.pendingClear).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBe(AGENCY.id);
  });

  it("shows a fixed message and clears the pending enable when the site never gets enabled", async () => {
    const user = userEvent.setup();
    notEnabled();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Try again.");
    expect(mocks.pendingClear).toHaveBeenCalledOnce();
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBeNull();
  });

  it("does nothing else when the user declines the permission", async () => {
    const user = userEvent.setup();
    notEnabled();
    mocks.requestOriginAccess.mockResolvedValue(false);
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toContain("needs access to this site");
    expect(mocks.pendingClear).toHaveBeenCalledOnce();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "sites.enable" }),
    );
    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
  });

  it("enables a site that already has permission right away in its only workspace", async () => {
    const user = userEvent.setup();
    mocks.hasOriginAccess.mockResolvedValue(true);
    let enabled = false;
    route({
      "sites.forOrigin": () => success(enabled ? SITE : null),
      "workspaces.list": () => success([NORTHWIND]),
      "sites.enable": () => {
        enabled = true;
        return success(null);
      },
    });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByTestId("site-state")).textContent).toBe("Enabled in Northwind");
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "sites.enable",
      tabId: 7,
      origin: ORIGIN,
      workspaceId: NORTHWIND.id,
    });
    expect(mocks.pendingSet).not.toHaveBeenCalled();
  });

  it("shows the fixed message when enabling an already granted site fails", async () => {
    const user = userEvent.setup();
    mocks.hasOriginAccess.mockResolvedValue(true);
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success([AGENCY]),
      "sites.enable": () => failure("forbidden"),
    });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "You do not have permission to do this.",
    );
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBeNull();
  });
});

describe("SitePanel when the site is enabled", () => {
  function enabled(workspaces: WorkspaceInfo[] = [NORTHWIND]) {
    route({
      "sites.forOrigin": () => success(SITE),
      "workspaces.list": () => success(workspaces),
    });
  }

  it("publishes the enabled workspace to the footer and clears it when the panel unmounts", async () => {
    enabled();

    const { unmount } = renderPanel();

    await screen.findByTestId("site-state");
    expect(lastControl().value).toBe(NORTHWIND.id);
    expect(lastControl().options).toEqual([NORTHWIND]);
    expect(lastControl().disabled).toBe(false);
    unmount();
    expect(mocks.onWorkspaceControl).toHaveBeenLastCalledWith(null);
  });

  it("orders the card, the comments overview and then the comment mode button", async () => {
    enabled();

    renderPanel();

    const origin = await screen.findByTestId("site-origin");
    const threads = await screen.findByTestId("page-threads-panel");
    const mode = screen.getByRole("button", { name: COMMENT_MODE });
    expect(origin.compareDocumentPosition(threads) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(threads.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the host, the state, the comment mode button with its shortcut and the menu", async () => {
    const user = userEvent.setup();
    enabled();

    renderPanel();

    expect((await screen.findByTestId("site-state")).textContent).toBe("Enabled in Northwind");
    expect(screen.getByTestId("site-origin").textContent).toBe(HOST);
    expect(screen.getByRole("button", { name: COMMENT_MODE }).textContent).toContain("Alt+Shift+C");
    expect(
      screen.getByRole("button", { name: COMMENT_MODE }).getAttribute("aria-keyshortcuts"),
    ).toBe("Alt+Shift+C");
    expect(screen.queryByRole("button", { name: /Workspace/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable on this site" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();

    await openMenu(user);

    expect(screen.getByRole("button", { name: "Disable on this site" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Capture console errors" })).toBeTruthy();
  });

  it("publishes every workspace for the footer picker when the user belongs to more than one", async () => {
    enabled([NORTHWIND, AGENCY]);

    renderPanel();

    await vi.waitFor(() => {
      expect(lastControl().options).toEqual([NORTHWIND, AGENCY]);
    });
    expect(lastControl().value).toBe(NORTHWIND.id);
    expect(lastControl().disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
  });

  it("re-binds the site to the chosen workspace in place and asks to refresh the page", async () => {
    let current: SiteInfo = SITE;
    route({
      "sites.forOrigin": () => success(current),
      "workspaces.list": () => success([NORTHWIND, { ...AGENCY, role: "member" }]),
      "sites.switchWorkspace": () => {
        current = { ...SITE, workspaceId: AGENCY.id, workspaceName: AGENCY.name };
        return success(null);
      },
    });
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().value).toBe(NORTHWIND.id);
    });

    chooseWorkspace(AGENCY.id);

    const hint = await screen.findByRole("status");
    expect(within(hint).getByText("Workspace updated")).toBeTruthy();
    expect(
      within(hint).getByText("Refresh the page to load this workspace's comments."),
    ).toBeTruthy();
    expect(screen.queryByTestId("page-threads-panel")).toBeNull();
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "sites.switchWorkspace",
      origin: ORIGIN,
      workspaceId: AGENCY.id,
    });
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "sites.disable" }),
    );
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBe(AGENCY.id);
    expect(screen.getByTestId("site-state").textContent).toBe("Enabled in Agency");
    expect(screen.queryByRole("button", { name: "Enable on this site" })).toBeNull();
    expect(lastControl().value).toBe(AGENCY.id);
  });

  it("drops the workspace hint once the site is disabled", async () => {
    const user = userEvent.setup();
    let current: SiteInfo | null = SITE;
    route({
      "sites.forOrigin": () => success(current),
      "workspaces.list": () => success([NORTHWIND, AGENCY]),
      "sites.switchWorkspace": () => {
        current = { ...SITE, workspaceId: AGENCY.id, workspaceName: AGENCY.name };
        return success(null);
      },
      "sites.disable": () => {
        current = null;
        return success(null);
      },
    });
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().value).toBe(NORTHWIND.id);
    });
    chooseWorkspace(AGENCY.id);
    expect(await screen.findByRole("status")).toBeTruthy();

    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "Disable on this site" }));

    expect(await screen.findByRole("button", { name: "Enable on this site" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the enabled state and shows no notice when switching fails", async () => {
    route({
      "sites.forOrigin": () => success(SITE),
      "workspaces.list": () => success([NORTHWIND, AGENCY]),
      "sites.switchWorkspace": () => failure("unknown"),
    });
    renderPanel();
    await vi.waitFor(() => {
      expect(lastControl().value).toBe(NORTHWIND.id);
    });

    chooseWorkspace(AGENCY.id);

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(
      screen.queryByText("Workspace updated. Refresh the page to see its comments."),
    ).toBeNull();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "sites.disable" }),
    );
    expect(screen.getByTestId("site-state").textContent).toBe("Enabled in Northwind");
    expect(lastControl().value).toBe(NORTHWIND.id);
  });

  it("places the page threads above the comment mode button and the notices below it", async () => {
    const user = userEvent.setup();
    enabled();
    mocks.toggleCommentMode.mockResolvedValueOnce(failure("page_unavailable"));
    renderPanel();

    const button = await screen.findByRole("button", { name: COMMENT_MODE });
    await user.click(button);
    const alert = await screen.findByRole("alert");

    const threads = screen.getByTestId("page-threads-panel");
    expect(threads.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the page threads for the tab only when the site is enabled", async () => {
    enabled();
    const { unmount } = renderPanel();

    expect((await screen.findByTestId("page-threads-panel")).textContent).toBe("7");
    unmount();

    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success([NORTHWIND]),
    });
    renderPanel();

    expect(await screen.findByRole("button", { name: "Enable on this site" })).toBeTruthy();
    expect(screen.queryByTestId("page-threads-panel")).toBeNull();
  });

  it("opens the allowed sites screen from the menu", async () => {
    const user = userEvent.setup();
    enabled();
    renderPanel();

    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "Allowed sites" }));

    expect(mocks.onManageSites).toHaveBeenCalledOnce();
  });

  it("opens the dashboard of the enabled workspace from the menu", async () => {
    const user = userEvent.setup();
    enabled([NORTHWIND, AGENCY]);
    renderPanel();

    await openMenu(user);

    expect(screen.getByRole("link", { name: "Open dashboard" }).getAttribute("href")).toBe(
      `https://web.test/app/w/${NORTHWIND.id}`,
    );
  });

  it("toggles comment mode in the tab and reports the new state", async () => {
    const user = userEvent.setup();
    enabled();
    mocks.toggleCommentMode.mockResolvedValueOnce(success({ active: true }));
    mocks.toggleCommentMode.mockResolvedValueOnce(success({ active: false }));
    renderPanel();

    await user.click(await screen.findByRole("button", { name: COMMENT_MODE }));
    expect((await screen.findByRole("status")).textContent).toBe("Comment mode is on.");
    await user.click(screen.getByRole("button", { name: COMMENT_MODE }));

    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Comment mode is off.");
    });
    expect(mocks.toggleCommentMode).toHaveBeenCalledWith(7);
  });

  it("shows a fixed message when the page does not answer", async () => {
    const user = userEvent.setup();
    enabled();
    mocks.toggleCommentMode.mockResolvedValue(failure("page_unavailable"));
    renderPanel();

    await user.click(await screen.findByRole("button", { name: COMMENT_MODE }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sitenote is not available on this page.",
    );
  });

  it("shows the console error switch as on by default and as off when the site opted out", async () => {
    const user = userEvent.setup();
    route({ "sites.forOrigin": () => success({ ...SITE, captureErrors: false }) });
    const { unmount } = renderPanel();
    await openMenu(user);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }).checked,
    ).toBe(false);
    unmount();

    enabled();
    renderPanel();
    await openMenu(user);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }).checked,
    ).toBe(true);
  });

  it("switches console error capture off for the tab and reloads the state", async () => {
    const user = userEvent.setup();
    let captureErrors = true;
    route({
      "sites.forOrigin": () => success({ ...SITE, captureErrors }),
      "sites.setErrorCapture": () => {
        captureErrors = false;
        return success(null);
      },
    });
    renderPanel();
    await openMenu(user);

    await user.click(await screen.findByRole("checkbox", { name: "Capture console errors" }));

    await vi.waitFor(() => {
      expect(
        screen.getByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }).checked,
      ).toBe(false);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "sites.setErrorCapture",
      tabId: 7,
      origin: ORIGIN,
      enabled: false,
    });
    expect(screen.getByRole("status").textContent).toBe("Console errors will not be captured.");
  });

  it("shows the error and keeps the switch when changing it fails", async () => {
    const user = userEvent.setup();
    route({
      "sites.forOrigin": () => success(SITE),
      "sites.setErrorCapture": () => failure("unknown"),
    });
    renderPanel();
    await openMenu(user);

    await user.click(await screen.findByRole("checkbox", { name: "Capture console errors" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }).checked,
    ).toBe(true);
  });

  it("disables the site from the menu and goes back to the picker", async () => {
    const user = userEvent.setup();
    let isEnabled = true;
    route({
      "sites.forOrigin": () => success(isEnabled ? SITE : null),
      "workspaces.list": () => success([NORTHWIND]),
      "sites.disable": () => {
        isEnabled = false;
        return success(null);
      },
    });
    renderPanel();
    await openMenu(user);

    await user.click(await screen.findByRole("button", { name: "Disable on this site" }));

    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "sites.disable", origin: ORIGIN });
  });

  it("shows the error when disabling fails and stays enabled", async () => {
    const user = userEvent.setup();
    route({ "sites.forOrigin": () => success(SITE), "sites.disable": () => failure("unknown") });
    renderPanel();
    await openMenu(user);

    await user.click(await screen.findByRole("button", { name: "Disable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(screen.getByTestId("site-state").textContent).toBe("Enabled in Northwind");
  });
});

describe("SitePanel errors", () => {
  it("shows the fixed message and retries", async () => {
    const user = userEvent.setup();
    route({ "sites.forOrigin": () => failure("network") });
    renderPanel();

    expect((await screen.findByRole("alert")).textContent).toContain("could not reach the server");

    route({ "sites.forOrigin": () => success(SITE) });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect((await screen.findByTestId("site-state")).textContent).toBe("Enabled in Northwind");
  });

  it("shows an error when the workspaces cannot be loaded", async () => {
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => failure("unauthorized"),
    });

    renderPanel();

    expect((await screen.findByRole("alert")).textContent).toBe("Sign in to Sitenote to continue.");
  });
});
