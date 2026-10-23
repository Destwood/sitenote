export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response> | undefined;

export interface FakeBackend {
  fetch: typeof fetch;
  requests: RecordedRequest[];
}

export function fakeBackend(responder: Responder): FakeBackend {
  const requests: RecordedRequest[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const recorded: RecordedRequest = {
      method: request.method,
      url: new URL(request.url),
      headers: request.headers,
      body: await request.text(),
    };
    requests.push(recorded);
    const response = await responder(recorded);
    return (
      response ?? new Response(`no responder for ${request.method} ${request.url}`, { status: 599 })
    );
  };
  return { fetch: fake as typeof fetch, requests };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function single(row: unknown, found = true): Response {
  if (!found) {
    return json({ code: "PGRST116", message: "no rows" }, 406);
  }
  return json(row);
}
