import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.CLICKUP_MOCK_PORT ?? 4411);
const HOST = process.env.CLICKUP_MOCK_HOST ?? "127.0.0.1";
const TOKEN_PREFIX = "pk_";
const MOCK_TASK_ID = "86e2e";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage): boolean {
  const token = request.headers.authorization ?? "";
  return token.startsWith(TOKEN_PREFIX);
}

function drain(request: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    request.on("data", () => undefined);
    request.on("end", () => {
      resolve();
    });
  });
}

const server = createServer((request, response) => {
  void drain(request).then(() => {
    const path = new URL(request.url ?? "/", `http://127.0.0.1:${String(PORT)}`).pathname;
    if (path === "/health") {
      send(response, 200, { ok: true });
      return;
    }
    if (!authorized(request)) {
      send(response, 401, { err: "Token invalid", ECODE: "OAUTH_014" });
      return;
    }
    if (request.method === "GET" && path === "/api/v2/user") {
      send(response, 200, { user: { id: 1, username: "e2e" } });
      return;
    }
    if (request.method === "GET" && path === "/api/v2/team") {
      send(response, 200, { teams: [{ id: "9001", name: "Northwind ClickUp" }] });
      return;
    }
    if (request.method === "GET" && path === "/api/v2/team/9001/space") {
      send(response, 200, { spaces: [{ id: "9101", name: "Web" }] });
      return;
    }
    if (request.method === "GET" && path === "/api/v2/space/9101/list") {
      send(response, 200, { lists: [{ id: "9201", name: "Website feedback" }] });
      return;
    }
    if (request.method === "POST" && path === "/api/v2/list/9201/task") {
      send(response, 200, {
        id: MOCK_TASK_ID,
        url: `https://app.clickup.com/t/${MOCK_TASK_ID}`,
      });
      return;
    }
    if (request.method === "POST" && path === `/api/v2/task/${MOCK_TASK_ID}/attachment`) {
      send(response, 200, { id: "attachment-1" });
      return;
    }
    send(response, 404, { err: "Not found" });
  });
});

server.listen(PORT, HOST);
