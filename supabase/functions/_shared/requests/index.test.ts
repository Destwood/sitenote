import { describe, expect, it } from "vitest";

import { ApiError } from "../api/index.ts";

import {
  clickUpSettings,
  createTaskBody,
  hierarchyBody,
  insertWebhookBody,
  linkIssueBody,
  parseJiraSettings,
  parseRequest,
  readJsonBody,
  saveJiraSettingsBody,
  saveSettingsBody,
} from "./index.ts";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

const validSettings = {
  workspaceId: WORKSPACE_ID,
  token: "pk_1_secret",
  teamId: "123",
  teamName: "Team",
  spaceId: "456",
  spaceName: "Space",
  listId: "789",
  listName: "List",
};

describe("createTaskBody", () => {
  it("accepts a thread id", () => {
    expect(parseRequest(createTaskBody, { threadId: WORKSPACE_ID })).toEqual({
      threadId: WORKSPACE_ID,
    });
  });

  it("rejects a missing or malformed thread id", () => {
    expect(() => parseRequest(createTaskBody, {})).toThrow(ApiError);
    expect(() => parseRequest(createTaskBody, { threadId: "abc" })).toThrow(ApiError);
  });
});

describe("saveSettingsBody", () => {
  it("accepts settings with a token", () => {
    expect(parseRequest(saveSettingsBody, validSettings)).toEqual(validSettings);
  });

  it("accepts settings without a token", () => {
    const withoutToken = { ...validSettings, token: undefined };
    expect(parseRequest(saveSettingsBody, withoutToken)).toEqual(withoutToken);
  });

  it("rejects ids that are not numeric, so they cannot change the request path", () => {
    expect(() => parseRequest(saveSettingsBody, { ...validSettings, listId: "../123" })).toThrow(
      ApiError,
    );
    expect(() => parseRequest(saveSettingsBody, { ...validSettings, teamId: "" })).toThrow(
      ApiError,
    );
  });

  it("rejects empty or oversized names", () => {
    expect(() => parseRequest(saveSettingsBody, { ...validSettings, spaceName: "" })).toThrow(
      ApiError,
    );
    expect(() =>
      parseRequest(saveSettingsBody, { ...validSettings, listName: "x".repeat(201) }),
    ).toThrow(ApiError);
  });
});

describe("clickUpSettings", () => {
  it("accepts the settings stored with the integration", () => {
    const settings = {
      teamId: "123",
      teamName: "Team",
      spaceId: "456",
      spaceName: "Space",
      listId: "789",
      listName: "List",
    };
    expect(parseRequest(clickUpSettings, settings)).toEqual(settings);
  });

  it("rejects settings without a list", () => {
    expect(() => parseRequest(clickUpSettings, { ...validSettings, listId: undefined })).toThrow(
      ApiError,
    );
  });
});

describe("hierarchyBody", () => {
  it("accepts a workspace alone and optional picker ids", () => {
    expect(parseRequest(hierarchyBody, { workspaceId: WORKSPACE_ID })).toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(parseRequest(hierarchyBody, { workspaceId: WORKSPACE_ID, teamId: "1" })).toEqual({
      workspaceId: WORKSPACE_ID,
      teamId: "1",
    });
  });
});

describe("insertWebhookBody", () => {
  it("accepts an insert on notifications", () => {
    const body = {
      type: "INSERT",
      table: "notifications",
      record: { id: WORKSPACE_ID, kind: "reply" },
    };
    expect(parseRequest(insertWebhookBody, body)).toEqual({
      type: "INSERT",
      table: "notifications",
      record: { id: WORKSPACE_ID },
    });
  });

  it("rejects other tables and events", () => {
    expect(() =>
      parseRequest(insertWebhookBody, {
        type: "UPDATE",
        table: "notifications",
        record: { id: WORKSPACE_ID },
      }),
    ).toThrow(ApiError);
    expect(() =>
      parseRequest(insertWebhookBody, {
        type: "INSERT",
        table: "comments",
        record: { id: WORKSPACE_ID },
      }),
    ).toThrow(ApiError);
  });
});

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    const request = new Request("https://functions.test", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJsonBody(request)).toEqual({ a: 1 });
  });

  it("maps an invalid JSON body to a validation error", async () => {
    const request = new Request("https://functions.test", { method: "POST", body: "{nope" });
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("saveJiraSettingsBody", () => {
  const jiraBody = {
    workspaceId: WORKSPACE_ID,
    siteUrl: "https://org.atlassian.net",
    email: "user@example.com",
    token: "jira-token",
  };

  it("accepts settings with and without a token", () => {
    expect(parseRequest(saveJiraSettingsBody, jiraBody)).toEqual(jiraBody);
    const withoutToken = { ...jiraBody, token: undefined };
    expect(parseRequest(saveJiraSettingsBody, withoutToken)).toEqual(withoutToken);
  });

  it("rejects an email without an @, with whitespace or with several @ signs", () => {
    for (const email of ["user.example.com", "us er@example.com", "a@b@example.com", "a@"]) {
      expect(() => parseRequest(saveJiraSettingsBody, { ...jiraBody, email })).toThrow(ApiError);
    }
  });

  it("rejects an empty token and an empty or oversized site url", () => {
    expect(() => parseRequest(saveJiraSettingsBody, { ...jiraBody, token: "" })).toThrow(ApiError);
    expect(() => parseRequest(saveJiraSettingsBody, { ...jiraBody, siteUrl: "" })).toThrow(
      ApiError,
    );
    expect(() =>
      parseRequest(saveJiraSettingsBody, { ...jiraBody, siteUrl: "x".repeat(201) }),
    ).toThrow(ApiError);
  });
});

describe("linkIssueBody", () => {
  it("accepts a thread id and an uppercase issue key", () => {
    expect(parseRequest(linkIssueBody, { threadId: WORKSPACE_ID, issueKey: "PROJ-123" })).toEqual({
      threadId: WORKSPACE_ID,
      issueKey: "PROJ-123",
    });
  });

  it("rejects keys that are not normalized server side", () => {
    for (const issueKey of ["proj-123", " PROJ-1", "PROJ-", "../PROJ-1", "P-1", "PROJ-1\n"]) {
      expect(() => parseRequest(linkIssueBody, { threadId: WORKSPACE_ID, issueKey })).toThrow(
        ApiError,
      );
    }
  });

  it("rejects a key longer than 64 characters", () => {
    const issueKey = `AB-${"1".repeat(62)}`;
    expect(() => parseRequest(linkIssueBody, { threadId: WORKSPACE_ID, issueKey })).toThrow(
      ApiError,
    );
  });

  it("rejects a malformed thread id", () => {
    expect(() => parseRequest(linkIssueBody, { threadId: "abc", issueKey: "PROJ-1" })).toThrow(
      ApiError,
    );
  });
});

describe("parseJiraSettings", () => {
  it("returns the normalized site and the email stored with the integration", () => {
    expect(
      parseJiraSettings({ siteUrl: "https://Org.Atlassian.net/", email: "user@example.com" }),
    ).toEqual({ siteUrl: "https://org.atlassian.net", email: "user@example.com" });
  });

  it("refuses stored settings whose site is not an atlassian origin", () => {
    for (const siteUrl of [
      "http://org.atlassian.net",
      "https://evil.com",
      "https://org.atlassian.net:8443",
    ]) {
      expect(() => parseJiraSettings({ siteUrl, email: "user@example.com" })).toThrow(ApiError);
    }
  });

  it("refuses incomplete stored settings", () => {
    expect(() => parseJiraSettings({ siteUrl: "https://org.atlassian.net" })).toThrow(ApiError);
    expect(() => parseJiraSettings(null)).toThrow(ApiError);
  });
});
