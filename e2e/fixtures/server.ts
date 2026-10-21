import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const HOST = "127.0.0.1";
const ROOT = resolve(import.meta.dirname, "site");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function readPort(): number {
  const port = Number(process.env.FIXTURE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("FIXTURE_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function send(res: ServerResponse, status: number, headers: Record<string, string>, body?: Buffer) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, message: string) {
  send(res, status, { "Content-Type": "text/plain; charset=utf-8" }, Buffer.from(message));
}

function rewrite(pathname: string): string {
  if (pathname.startsWith("/p/")) {
    return "/index.html";
  }
  return pathname.startsWith("/spa/") ? "/spa.html" : pathname;
}

function resolveInsideRoot(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const target = resolve(join(ROOT, decoded));
  const fromRoot = relative(ROOT, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return null;
  }
  return target;
}

async function findFile(target: string): Promise<string | null> {
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      return await findFile(join(target, "index.html"));
    }
    return info.isFile() ? target : null;
  } catch {
    return null;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(
      res,
      405,
      { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
      Buffer.from("Method Not Allowed"),
    );
    return;
  }

  const target = resolveInsideRoot(rewrite(new URL(req.url ?? "/", `http://${HOST}`).pathname));
  const file = target === null ? null : await findFile(target);
  if (file === null) {
    sendText(res, 404, "Not Found");
    return;
  }

  const body = await readFile(file);
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  send(
    res,
    200,
    { "Content-Type": contentType, "Content-Length": String(body.length) },
    req.method === "HEAD" ? undefined : body,
  );
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) {
      sendText(res, 500, "Internal Server Error");
    } else {
      res.destroy();
    }
  });
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const port = readPort();
server.listen(port, HOST, () => {
  console.log(`Fixture site: http://${HOST}:${String(port)}`);
});
