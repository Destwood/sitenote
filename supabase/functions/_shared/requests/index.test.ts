import { describe, expect, it } from "vitest";

import { ApiError } from "../api/index.ts";

import {
  clickUpSettings,
  createTaskBody,
  hierarchyBody,
  insertWebhookBody,
  parseRequest,
  readJsonBody,
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
