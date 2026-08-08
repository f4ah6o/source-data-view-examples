import assert from "node:assert/strict";
import { test } from "node:test";

import { readCustomizationConfig } from "../kintone/config.ts";
import { createKintoneApiFetch } from "../kintone/kintone-fetch.ts";
import type { KintoneApi } from "../kintone/kintone-types.ts";

test("customization config validates app IDs and applies non-secret defaults", () => {
  const config = readCustomizationConfig({
    apps: {
      employees: 1,
      qualificationDefinitions: 2,
      employeeQualifications: 3,
    },
    targetRoleIds: ["construction"],
  });

  assert.deepEqual(config, {
    apps: {
      employees: 1,
      qualificationDefinitions: 2,
      employeeQualifications: 3,
    },
    targetRoleIds: ["construction"],
    targetQualificationCategories: [],
    expiringWithinDays: 90,
    includeNoExpiry: false,
  });
});

test("customization config rejects an empty role filter", () => {
  assert.throws(
    () =>
      readCustomizationConfig({
        apps: {
          employees: 1,
          qualificationDefinitions: 2,
          employeeQualifications: 3,
        },
        targetRoleIds: [],
      }),
    /targetRoleIds must not be empty/,
  );
});

test("kintone.api fetch adapter moves GET query parameters into the API params object", async () => {
  const calls: unknown[][] = [];
  const api: KintoneApi = async (url, method, params) => {
    calls.push([url, method, params]);
    return { records: [], next: false };
  };
  const fetcher = createKintoneApiFetch(api);

  const response = await fetcher("https://example.cybozu.com/k/v1/records/cursor.json?id=cursor-1", {
    method: "GET",
    headers: { "X-Cybozu-API-Token": "ignored" },
  });

  assert.equal(response.ok, true);
  assert.deepEqual(calls, [
    ["https://example.cybozu.com/k/v1/records/cursor.json", "GET", { id: "cursor-1" }],
  ]);
  assert.deepEqual(await response.json(), { records: [], next: false });
});

test("kintone.api fetch adapter forwards JSON request bodies without API tokens", async () => {
  const calls: unknown[][] = [];
  const api: KintoneApi = async (url, method, params) => {
    calls.push([url, method, params]);
    return { id: "cursor-1", totalCount: "0" };
  };
  const fetcher = createKintoneApiFetch(api);

  const response = await fetcher("https://example.cybozu.com/k/v1/records/cursor.json", {
    method: "POST",
    body: JSON.stringify({ app: 1, fields: ["employee_id"], size: 500 }),
  });

  assert.equal(response.ok, true);
  assert.deepEqual(calls, [
    [
      "https://example.cybozu.com/k/v1/records/cursor.json",
      "POST",
      { app: 1, fields: ["employee_id"], size: 500 },
    ],
  ]);
});

test("kintone.api fetch adapter converts API rejections to failed Response objects", async () => {
  const api: KintoneApi = async () => {
    throw { code: "GAIA_CO02", message: "permission denied" };
  };
  const response = await createKintoneApiFetch(api)(
    "https://example.cybozu.com/k/v1/records/cursor.json?id=cursor-1",
    { method: "GET" },
  );

  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "GAIA_CO02", message: "permission denied" });
});
