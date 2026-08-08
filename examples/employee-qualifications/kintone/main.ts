import "./style.css";

import { readCustomizationConfig } from "./config.ts";
import type { KintoneIndexEvent } from "./kintone-types.ts";
import { buildEmployeeQualificationsPageView } from "./page.ts";
import {
  renderEmployeeQualifications,
  renderEmployeeQualificationsError,
} from "./render.ts";
import { createBrowserKintoneRuntime } from "./runtime.ts";

const ROOT_ID = "sdv-employee-qualifications-app";
const INDEX_EVENTS = ["app.record.index.show", "mobile.app.record.index.show"] as const;
let renderGeneration = 0;

kintone.events.on(INDEX_EVENTS, async (event: KintoneIndexEvent) => {
  const config = readCustomizationConfig();
  if (event.viewId !== config.viewId) return event;

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(
      `employee qualifications customization mount #${ROOT_ID} was not found in the custom view`,
    );
    return event;
  }

  const generation = ++renderGeneration;
  try {
    const origin = location.origin;
    const runtime = createBrowserKintoneRuntime({
      api: (url, method, params) => kintone.api(url, method, params),
      origin,
      ...(config.guestSpaceId === undefined ? {} : { guestSpaceId: config.guestSpaceId }),
    });
    const page = await buildEmployeeQualificationsPageView(config, runtime);
    if (generation !== renderGeneration) return event;

    renderEmployeeQualifications(root, page, {
      origin,
      ...(config.guestSpaceId === undefined ? {} : { guestSpaceId: config.guestSpaceId }),
    });
  } catch (error) {
    if (generation !== renderGeneration) return event;
    console.error("employee qualifications customization failed", error);
    renderEmployeeQualificationsError(root, error);
  }

  return event;
});
