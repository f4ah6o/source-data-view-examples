# kintone customization — employee qualifications

Vite-built PC customization for the existing employee-qualifications example.

```text
kintone session
  → kintone.api() fetch adapter
  → @f4ah6o/data-source
  → source-neutral domain projection
  → @f4ah6o/data-view Matrix/Table ViewModels
  → DOM renderer
```

The domain layer remains unchanged and does not import DOM or kintone JavaScript APIs. This directory is the runtime/rendering boundary only.

## Required apps and field codes

The three apps use the same field codes as the fixture-backed example:

- employees: `employee_id`, `name`, `department_id`, `department_name`, `business_role_ids`, `photo`
- qualification definitions: `qualification_id`, `name`, `category`, `grade`
- employee qualifications: `$id`, `employee_id`, `qualification_id`, `acquired_at`, `expires_at`, `credential_number`

The customization reads all three apps through the logged-in user's kintone session. No API token is embedded in the bundle.

## Configure

Copy the example config and edit app IDs / stable role IDs / category IDs for the target environment:

```sh
cp examples/employee-qualifications/kintone/config.example.js \
  examples/employee-qualifications/kintone/config.js
```

`config.js` is gitignored. `asOf` is optional; when omitted, the browser's local calendar date is used. An empty `targetQualificationCategories` array means all qualification definitions.

## Build

```sh
corepack enable
pnpm install
pnpm build:kintone
```

Vite library mode produces:

```text
examples/employee-qualifications/kintone/dist/
  employee-qualifications.js
  employee-qualifications.css
```

The JavaScript is an IIFE bundle suitable for kintone customization rather than an ESM chunk graph.

## Register in kintone

For the PC customization, register JavaScript in this order:

1. `config.js`
2. `dist/employee-qualifications.js`

Register `dist/employee-qualifications.css` as the CSS customization file. The script renders into the record-list header on `app.record.index.show`.

## Why the fetch adapter exists

`@f4ah6o/data-source` currently requires an API-token-shaped runtime even when a custom `fetch` is supplied. `runtime.ts` supplies a sentinel value, while `kintone-fetch.ts` ignores headers and forwards the request to `kintone.api()`. The sentinel never leaves the page, and the real authorization is the current kintone session.

This boundary can disappear later if `data-source` gains first-class session/runtime authentication support.

## Plugin path

Plugin packaging does not require changing the domain or renderer. A plugin can replace `config.js` with values loaded from `kintone.plugin.app.getConfig()` and reuse the same `config` → `page` → `render` pipeline.
