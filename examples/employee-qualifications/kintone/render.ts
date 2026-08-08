import type {
  EmployeeAvatar,
  QualificationDefinition,
  QualificationStatus,
} from "../domain/index.ts";
import type { EmployeeQualificationsPageView } from "./page.ts";

export interface RenderOptions {
  readonly origin: string;
  readonly guestSpaceId?: number;
}

const STATUS_MARK: Record<QualificationStatus, string> = {
  missing: "—",
  valid: "○",
  expiring: "△",
  expired: "×",
  "no-expiry": "○",
};

const STATUS_LABEL: Record<QualificationStatus, string> = {
  missing: "未保有",
  valid: "有効",
  expiring: "期限間近",
  expired: "期限切れ",
  "no-expiry": "期限なし",
};

export function renderEmployeeQualifications(
  root: HTMLElement,
  page: EmployeeQualificationsPageView,
  options: RenderOptions,
): void {
  root.replaceChildren();
  root.className = "sdv-eq";

  const heading = element("h2", "sdv-eq__title", "資格保有状況");
  const asOf = element("p", "sdv-eq__as-of", `基準日: ${page.asOf}`);
  root.append(heading, asOf);

  for (const department of page.departments) {
    const section = document.createElement("section");
    section.className = "sdv-eq__section";
    section.append(element("h3", "sdv-eq__department", department.departmentName));

    const table = document.createElement("table");
    table.className = "sdv-eq__matrix";
    table.append(
      renderMatrixHead(department.qualifications),
      renderMatrixBody(department.employees, department.view.rows, options),
    );
    section.append(table);
    root.append(section);
  }

  root.append(renderExpirationTable(page));
}

export function renderEmployeeQualificationsError(root: HTMLElement, error: unknown): void {
  root.replaceChildren();
  root.className = "sdv-eq sdv-eq--error";
  root.append(
    element(
      "pre",
      "sdv-eq__error",
      error instanceof Error ? error.message : `Failed to render: ${String(error)}`,
    ),
  );
}

function renderMatrixHead(qualifications: readonly QualificationDefinition[]): HTMLTableSectionElement {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  row.append(element("th", "sdv-eq__employee-heading", "社員"));
  for (const qualification of qualifications) {
    const label = qualification.grade
      ? `${qualification.name} (${qualification.grade})`
      : qualification.name;
    row.append(element("th", "sdv-eq__qualification-heading", label));
  }
  head.append(row);
  return head;
}

function renderMatrixBody(
  employees: readonly EmployeeAvatar[],
  rows: readonly {
    readonly key: string;
    readonly cells: readonly {
      readonly value:
        | {
            readonly status: QualificationStatus;
            readonly qualification?: { readonly expiresAt?: string };
          }
        | undefined;
    }[];
  }[],
  options: RenderOptions,
): HTMLTableSectionElement {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const body = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    const employee = employeeById.get(row.key);
    tr.append(renderEmployee(employee, options));
    for (const cell of row.cells) {
      const status = cell.value?.status ?? "missing";
      const td = element(
        "td",
        `sdv-eq__status sdv-eq__status--${status}`,
        STATUS_MARK[status],
      );
      const expiresAt = cell.value?.qualification?.expiresAt;
      td.title = expiresAt ? `${STATUS_LABEL[status]} / ${expiresAt}` : STATUS_LABEL[status];
      td.dataset.status = status;
      tr.append(td);
    }
    body.append(tr);
  }
  return body;
}

function renderEmployee(
  employee: EmployeeAvatar | undefined,
  options: RenderOptions,
): HTMLTableCellElement {
  const cell = document.createElement("th");
  cell.className = "sdv-eq__employee";
  cell.scope = "row";

  if (!employee) {
    cell.textContent = "Unknown";
    return cell;
  }

  const avatar = element("span", "sdv-eq__avatar", employee.name.slice(0, 1));
  avatar.setAttribute("aria-hidden", "true");
  if (employee.photo) void loadEmployeePhoto(avatar, employee.photo.key, options);

  cell.append(avatar, element("span", "sdv-eq__employee-name", employee.name));
  return cell;
}

async function loadEmployeePhoto(
  avatar: HTMLElement,
  fileKey: string,
  options: RenderOptions,
): Promise<void> {
  try {
    const response = await fetch(fileUrl(fileKey, options), {
      method: "GET",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) return;

    const objectUrl = URL.createObjectURL(await response.blob());
    const image = document.createElement("img");
    image.alt = "";
    image.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
    image.addEventListener("error", () => URL.revokeObjectURL(objectUrl), { once: true });
    image.src = objectUrl;
    avatar.replaceChildren(image);
  } catch {
    // Keep the deterministic initial fallback when the user cannot download the file.
  }
}

function renderExpirationTable(page: EmployeeQualificationsPageView): HTMLElement {
  const section = document.createElement("section");
  section.className = "sdv-eq__section";
  section.append(element("h3", "sdv-eq__department", "資格期限"));

  if (page.expirationTable.rows.length === 0) {
    section.append(element("p", "sdv-eq__empty", "該当する資格期限はありません。"));
    return section;
  }

  const labels: Record<string, string> = {
    employeeName: "社員",
    qualificationName: "資格",
    departmentName: "所属",
    expiresAt: "期限",
    status: "状態",
  };
  const table = document.createElement("table");
  table.className = "sdv-eq__expiration";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const field of page.expirationTable.fields) {
    headRow.append(element("th", "", labels[field.key] ?? field.key));
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  for (const row of page.expirationTable.rows) {
    const tr = document.createElement("tr");
    for (const cell of row.cells) {
      const value = cell.value == null ? "" : String(cell.value);
      const td = element("td", "", value);
      td.dataset.label = labels[cell.field] ?? cell.field;
      if (cell.field === "status") td.dataset.status = value;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  section.append(table);
  return section;
}

function fileUrl(fileKey: string, options: RenderOptions): string {
  const base = options.origin.replace(/\/$/, "");
  const path =
    options.guestSpaceId === undefined
      ? "/k/v1/file.json"
      : `/k/guest/${options.guestSpaceId}/v1/file.json`;
  return `${base}${path}?fileKey=${encodeURIComponent(fileKey)}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
