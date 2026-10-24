import type { Page, TestInfo } from "@playwright/test";

const FUNCTIONS_PATH = "/functions/v1/";

function functionName(url: string): string {
  const path = new URL(url).pathname;
  return path.slice(path.indexOf(FUNCTIONS_PATH) + FUNCTIONS_PATH.length) || "function";
}

export function traceFunctionCalls(page: Page, testInfo: TestInfo): void {
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes(FUNCTIONS_PATH)) {
      return;
    }
    void response
      .text()
      .catch(() => "")
      .then((body) =>
        testInfo.attach(`function-${functionName(url)}-${String(response.status())}`, {
          body: JSON.stringify({
            method: response.request().method(),
            url,
            status: response.status(),
            body,
          }),
          contentType: "application/json",
        }),
      )
      .catch(() => undefined);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes(FUNCTIONS_PATH)) {
      return;
    }
    void testInfo
      .attach(`function-${functionName(url)}-failed`, {
        body: JSON.stringify({
          method: request.method(),
          url,
          error: request.failure()?.errorText,
        }),
        contentType: "application/json",
      })
      .catch(() => undefined);
  });
}
