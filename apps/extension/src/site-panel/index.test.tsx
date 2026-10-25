import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import type { SiteInfo, WorkspaceInfo } from "@sitenote/widget";
import { LAST_WORKSPACE_KEY, SitePanel } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  toggleCommentMode: vi.fn(),
  getTargetTab: vi.fn(),
  hasOriginAccess: vi.fn(),
  requestOriginAccess: vi.fn(),
  removeOriginAccess: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  toggleCommentMode: mocks.toggleCommentMode,
}));

vi.mock("../tab-access", () => ({
  getTargetTab: mocks.getTargetTab,
  hasOriginAccess: mocks.hasOriginAccess,
  requestOriginAccess: mocks.requestOriginAccess,
  removeOriginAccess: mocks.removeOriginAccess,
}));

const ORIGIN = "https://example.test";
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

beforeEach(() => {
  localStorage.clear();
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.getTargetTab.mockResolvedValue({ id: 7, origin: ORIGIN });
  mocks.hasOriginAccess.mockResolvedValue(false);
  mocks.requestOriginAccess.mockResolvedValue(true);
  mocks.removeOriginAccess.mockResolvedValue(undefined);
});

describe("SitePanel unavailable pages", () => {
  it.each([
    ["no tab", null],
    ["a tab without a scriptable origin", { id: 7, origin: null }],
  ])("says Sitenote is not available for %s", async (_name, tab) => {
    mocks.getTargetTab.mockResolvedValue(tab);

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByTestId("site-unavailable")).textContent).toBe(
      "Sitenote is not available on this page.",
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SitePanel when the site is not enabled", () => {
  function notEnabled(workspaces: WorkspaceInfo[] = [NORTHWIND, AGENCY]) {
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success(workspaces),
    });
  }

  it("shows the origin, the state and a workspace picker", async () => {
    notEnabled();

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
    expect(screen.getByTestId("site-origin").textContent).toBe(ORIGIN);
    const picker = screen.getByLabelText<HTMLSelectElement>("Workspace");
    expect([...picker.options].map((option) => option.text)).toEqual(["Northwind", "Agency"]);
    expect(picker.value).toBe(NORTHWIND.id);
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "sites.forOrigin", origin: ORIGIN });
  });

  it("defaults to the workspace used last time when it is still available", async () => {
    localStorage.setItem(LAST_WORKSPACE_KEY, AGENCY.id);
    notEnabled();

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByLabelText<HTMLSelectElement>("Workspace")).value).toBe(AGENCY.id);
  });

  it("falls back to the first workspace when the remembered one is gone", async () => {
    localStorage.setItem(LAST_WORKSPACE_KEY, "10000000-0000-4000-8000-000000000099");
    notEnabled();

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByLabelText<HTMLSelectElement>("Workspace")).value).toBe(NORTHWIND.id);
  });

  it("explains the limit for guests when a guest workspace is selected", async () => {
    const user = userEvent.setup();
    notEnabled();
    render(<SitePanel webUrl="https://web.test" />);
    await screen.findByLabelText("Workspace");
    expect(screen.queryByText(/Guests can enable only sites/)).toBeNull();

    await user.selectOptions(screen.getByLabelText("Workspace"), AGENCY.id);

    expect(screen.getByText(/Guests can enable only sites/)).toBeTruthy();
  });

  it("points to the web app when the user has no workspace", async () => {
    notEnabled([]);

    render(<SitePanel webUrl="https://web.test" />);

    const link = await screen.findByRole("link", { name: "Create one on the web" });
    expect(link.getAttribute("href")).toBe("https://web.test/app");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByRole("button", { name: "Enable on this site" })).toBeNull();
  });

  it("requests the permission, enables the site and shows the enabled state", async () => {
    const user = userEvent.setup();
    let enabled = false;
    route({
      "sites.forOrigin": () => success(enabled ? SITE : null),
      "workspaces.list": () => success([NORTHWIND, AGENCY]),
      "sites.enable": () => {
        enabled = true;
        return success(null);
      },
    });
    render(<SitePanel webUrl="https://web.test" />);
    await screen.findByLabelText("Workspace");
    await user.selectOptions(screen.getByLabelText("Workspace"), AGENCY.id);

    await user.click(screen.getByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByTestId("site-state")).textContent).toBe("Enabled in Northwind");
    expect(mocks.requestOriginAccess).toHaveBeenCalledWith(ORIGIN);
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "sites.enable",
      tabId: 7,
      origin: ORIGIN,
      workspaceId: AGENCY.id,
    });
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBe(AGENCY.id);
  });

  it("does nothing else when the user declines the permission", async () => {
    const user = userEvent.setup();
    notEnabled();
    mocks.requestOriginAccess.mockResolvedValue(false);
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toContain("needs access to this site");
    expect(mocks.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "sites.enable" }),
    );
    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
  });

  it("shows the fixed message of the error and gives back a permission it just got", async () => {
    const user = userEvent.setup();
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success([AGENCY]),
      "sites.enable": () => failure("forbidden"),
    });
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "You do not have permission to do this.",
    );
    expect(mocks.removeOriginAccess).toHaveBeenCalledWith(ORIGIN);
    expect(localStorage.getItem(LAST_WORKSPACE_KEY)).toBeNull();
  });

  it("keeps a permission the user already had when enabling fails", async () => {
    const user = userEvent.setup();
    mocks.hasOriginAccess.mockResolvedValue(true);
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success([NORTHWIND]),
      "sites.enable": () => failure("page_unavailable"),
    });
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Enable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sitenote is not available on this page.",
    );
    expect(mocks.removeOriginAccess).not.toHaveBeenCalled();
  });
});

describe("SitePanel when the site is enabled", () => {
  function enabled() {
    route({ "sites.forOrigin": () => success(SITE) });
  }

  it("shows where it is enabled with the comment mode and disable buttons", async () => {
    enabled();

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByTestId("site-state")).textContent).toBe("Enabled in Northwind");
    expect(screen.getByRole("button", { name: "Comment mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable on this site" })).toBeTruthy();
    expect(screen.queryByLabelText("Workspace")).toBeNull();
  });

  it("reports the enabled tab to its parent and reports it disabled otherwise", async () => {
    const onStateChange = vi.fn();
    enabled();

    const { unmount } = render(
      <SitePanel webUrl="https://web.test" onStateChange={onStateChange} />,
    );

    await screen.findByTestId("site-state");
    expect(onStateChange).toHaveBeenLastCalledWith(true, 7);
    unmount();

    route({ "sites.forOrigin": () => success(null), "workspaces.list": () => success([]) });
    render(<SitePanel webUrl="https://web.test" onStateChange={onStateChange} />);

    await screen.findByTestId("site-state");
    expect(onStateChange).toHaveBeenLastCalledWith(false, null);
  });

  it("toggles comment mode in the tab and reports the new state", async () => {
    const user = userEvent.setup();
    enabled();
    mocks.toggleCommentMode.mockResolvedValueOnce(success({ active: true }));
    mocks.toggleCommentMode.mockResolvedValueOnce(success({ active: false }));
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Comment mode" }));
    expect((await screen.findByRole("status")).textContent).toBe("Comment mode is on.");
    await user.click(screen.getByRole("button", { name: "Comment mode" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Comment mode is off.");
    });
    expect(mocks.toggleCommentMode).toHaveBeenCalledWith(7);
  });

  it("shows a fixed message when the page does not answer", async () => {
    const user = userEvent.setup();
    enabled();
    mocks.toggleCommentMode.mockResolvedValue(failure("page_unavailable"));
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Comment mode" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sitenote is not available on this page.",
    );
  });

  it("shows the console error switch as on by default and as off when the site opted out", async () => {
    route({ "sites.forOrigin": () => success({ ...SITE, captureErrors: false }) });
    const { unmount } = render(<SitePanel webUrl="https://web.test" />);
    expect(
      (await screen.findByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }))
        .checked,
    ).toBe(false);
    unmount();

    enabled();
    render(<SitePanel webUrl="https://web.test" />);
    expect(
      (await screen.findByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }))
        .checked,
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
    render(<SitePanel webUrl="https://web.test" />);

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
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("checkbox", { name: "Capture console errors" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Capture console errors" }).checked,
    ).toBe(true);
  });

  it("disables the site and goes back to the picker", async () => {
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
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Disable on this site" }));

    expect((await screen.findByTestId("site-state")).textContent).toBe("Not enabled");
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "sites.disable", origin: ORIGIN });
  });

  it("shows the error when disabling fails and stays enabled", async () => {
    const user = userEvent.setup();
    route({ "sites.forOrigin": () => success(SITE), "sites.disable": () => failure("unknown") });
    render(<SitePanel webUrl="https://web.test" />);

    await user.click(await screen.findByRole("button", { name: "Disable on this site" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(screen.getByTestId("site-state").textContent).toBe("Enabled in Northwind");
  });
});

describe("SitePanel errors", () => {
  it("shows the fixed message and retries", async () => {
    const user = userEvent.setup();
    route({ "sites.forOrigin": () => failure("network") });
    render(<SitePanel webUrl="https://web.test" />);

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

    render(<SitePanel webUrl="https://web.test" />);

    expect((await screen.findByRole("alert")).textContent).toBe("Sign in to Sitenote to continue.");
  });

  it("renders a workspace name as text and never as markup", async () => {
    route({
      "sites.forOrigin": () => success(null),
      "workspaces.list": () => success([{ ...NORTHWIND, name: "<img src=x onerror=alert(1)>" }]),
    });

    render(<SitePanel webUrl="https://web.test" />);

    await screen.findByLabelText("Workspace");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("option").textContent).toBe("<img src=x onerror=alert(1)>");
  });
});
