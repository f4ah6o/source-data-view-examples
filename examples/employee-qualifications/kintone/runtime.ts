import type { KintoneRuntime } from "@f4ah6o/data-source";

import { createKintoneApiFetch } from "./kintone-fetch.ts";
import type { KintoneApi } from "./kintone-types.ts";

export interface BrowserKintoneRuntimeOptions {
  readonly api: KintoneApi;
  readonly origin: string;
  readonly guestSpaceId?: number;
}

/**
 * data-source currently requires an API-token-shaped value even when a custom
 * fetch implementation is supplied. The sentinel is never sent to kintone:
 * createKintoneApiFetch ignores request headers and uses the logged-in session.
 */
export function createBrowserKintoneRuntime(
  options: BrowserKintoneRuntimeOptions,
): KintoneRuntime {
  return {
    baseUrl: options.origin,
    apiToken: "__session_via_kintone_api__",
    ...(options.guestSpaceId === undefined ? {} : { guestSpaceId: options.guestSpaceId }),
    fetch: createKintoneApiFetch(options.api),
  };
}
