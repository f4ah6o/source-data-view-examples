import type { KintoneApi, KintoneApiMethod } from "./kintone-types.ts";

/**
 * Adapts authenticated `kintone.api()` calls to the `fetch` contract used by
 * @f4ah6o/data-source. The API-token header emitted by data-source is ignored;
 * authentication is the current kintone browser session instead.
 */
export function createKintoneApiFetch(api: KintoneApi): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = new URL(toUrl(input), fallbackOrigin());
    const method = toMethod(init?.method ?? requestMethod(input));
    const params = {
      ...queryParams(url.searchParams),
      ...parseBody(init?.body),
    };

    try {
      const result = await api(`${url.origin}${url.pathname}`, method, params);
      return jsonResponse(result, 200);
    } catch (error) {
      return jsonResponse(normalizeError(error), errorStatus(error));
    }
  }) as typeof fetch;
}

function toUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: Parameters<typeof fetch>[0]): string {
  return typeof Request !== "undefined" && input instanceof Request ? input.method : "GET";
}

function toMethod(value: string): KintoneApiMethod {
  const method = value.toUpperCase();
  if (method === "GET" || method === "POST" || method === "PUT" || method === "DELETE") {
    return method;
  }
  throw new TypeError(`unsupported kintone API method: ${method}`);
}

function queryParams(search: URLSearchParams): Record<string, unknown> {
  return Object.fromEntries(search.entries());
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (body == null) return {};
  if (typeof body !== "string") {
    throw new TypeError("kintone fetch adapter only accepts JSON string request bodies");
  }
  const parsed = JSON.parse(body) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("kintone request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(safeJson(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ message: String(value) });
  }
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return error;
}

function errorStatus(error: unknown): number {
  if (error !== null && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status <= 599) return status;
  }
  return 400;
}

function fallbackOrigin(): string {
  return typeof location === "undefined" ? "https://kintone.invalid" : location.origin;
}
