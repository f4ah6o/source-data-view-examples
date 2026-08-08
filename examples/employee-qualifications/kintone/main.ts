import "./style.css";

import { readCustomizationConfig } from "./config.ts";
import type { KintoneIndexEvent } from "./kintone-types.ts";
import { buildEmployeeQualificationsPageView } from "./page.ts";
import {
  renderEmployeeQualifications,
  renderEmployeeQualificationsError,
} from "./render.ts";
import { createBrowserKintoneRuntime } from "./runtime.ts";

const ROOT_ID = "sdv-employee-qualifications";
let renderGeneration = 0;

kintone.events.on("app.record.index.show", async (event: KintoneIndexEvent) => {
  const host = kintone.app.getHeaderSpaceElement();
  if (!host) return event;

  const generation = ++renderGeneration;
  const root = ensureRoot(host);
  try {
    const config = readCustomizationConfig();
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

function ensureRoot(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`#${ROOT_ID}`);
  if (existing) return existing;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  host.append(root);
  return root;
}
