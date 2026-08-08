# kintone customization — employee qualifications

Vite-built responsive customization for the existing employee-qualifications example.

```text
kintone custom view (mount only)
  → kintone session / kintone.api()
  → @f4ah6o/data-source
  → source-neutral domain projection
  → @f4ah6o/data-view Matrix/Table ViewModels
  → responsive DOM app shell
```

The domain and UI do not depend on kintone's internal page DOM. kintone is only the host lifecycle and data transport boundary.

## Custom view as the app shell host

Create a kintone list whose display format is **Customize** and put only this HTML in it:

```html
<div id="sdv-employee-qualifications-app"></div>
```

Configure that custom view to be available on both PC and mobile, then copy its list/view ID into `config.js` as `viewId`.

Using a custom view avoids hiding or rewriting undocumented kintone internal elements. kintone supplies the page/lifecycle; the contents of the view are entirely owned by this example.

## Required apps and field codes

The three apps use the same field codes as the fixture-backed example:

- employees: `employee_id`, `name`, `department_id`, `department_name`, `business_role_ids`, `photo`
- qualification definitions: `qualification_id`, `name`, `category`, `grade`
- employee qualifications: `$id`, `employee_id`, `qualification_id`, `acquired_at`, `expires_at`, `credential_number`

The customization reads all three apps through the logged-in user's kintone session. No API token is embedded in the bundle.

## Configure

Copy the example config and edit app IDs, custom-view ID, stable role IDs, and category IDs:

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

Register JavaScript in this order for both **PC** and **mobile** customization:

1. `config.js`
2. `dist/employee-qualifications.js`

Register `dist/employee-qualifications.css` for both targets as well.

The same renderer handles both `app.record.index.show` and `mobile.app.record.index.show`; there is no separate mobile UI implementation.

## Responsive behavior

The app shell owns its layout. Desktop uses a matrix/table layout. On narrow screens the matrix remains horizontally scrollable with a sticky employee column, while the expiration table becomes stacked row cards. No kintone internal CSS class or DOM selector is used for responsive behavior.

## Why the fetch adapter exists

`@f4ah6o/data-source` currently requires an API-token-shaped runtime even when a custom `fetch` is supplied. `runtime.ts` supplies a sentinel value, while `kintone-fetch.ts` ignores headers and forwards the request to `kintone.api()`. The sentinel never leaves the page, and the real authorization is the current kintone session.

This boundary can disappear later if `data-source` gains first-class session/runtime authentication support.

## Plugin path

Plugin packaging does not require changing the domain or renderer. A plugin can replace `config.js` with values loaded from `kintone.plugin.app.getConfig()` and reuse the same `config` → `page` → `render` pipeline.
