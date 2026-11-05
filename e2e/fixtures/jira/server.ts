import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.JIRA_MOCK_PORT ?? 4412);
const HOST = process.env.JIRA_MOCK_HOST ?? "127.0.0.1";
const AUTH_PREFIX = "Basic ";
const ISSUE_PATH = /^\/rest\/api\/3\/issue\/([^/]+)$/;
const MOCK_ISSUE_KEY = "E2E-1";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization ?? "";
  return header.startsWith(AUTH_PREFIX);
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
      send(response, 401, { errorMessages: ["Unauthorized"] });
      return;
    }
    if (request.method === "GET" && path === "/rest/api/3/myself") {
      send(response, 200, { accountId: "e2e", emailAddress: "e2e@example.com" });
      return;
    }
    const issue = ISSUE_PATH.exec(path);
    if (request.method === "GET" && issue) {
      if (issue[1] === MOCK_ISSUE_KEY) {
        send(response, 200, { id: "10001", key: MOCK_ISSUE_KEY, fields: { summary: "E2E issue" } });
        return;
      }
      send(response, 404, {
        errorMessages: ["Issue does not exist or you do not have permission to see it."],
      });
      return;
    }
    if (request.method === "POST" && path === `/rest/api/3/issue/${MOCK_ISSUE_KEY}/comment`) {
      send(response, 201, { id: "20001" });
      return;
    }
    send(response, 404, { errorMessages: ["Not found"] });
  });
});

server.listen(PORT, HOST);
