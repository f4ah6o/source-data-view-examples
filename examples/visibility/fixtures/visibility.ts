import type { MockFixture } from "kintone-mock-server";

/**
 * Five kintone apps backing the "所属 x 業務役割" visibility domain:
 *
 *   users               (app 1): user_id, name
 *   affiliations        (app 2): affiliation_id, name, parent_id
 *   business_roles      (app 3): role_id, name
 *   user_assignments    (app 4): user_id, affiliation_id, role_id
 *   visibility_policies (app 5): affiliation_id, role_id, resources (SUBTABLE)
 *
 * Mirrors the example from the visibility issue:
 *
 *   User A - 名古屋支店 x 工事担当
 *          - 名古屋支店 x 積算担当
 *   User B - 本社 x 経理担当
 *
 * Every coordinate carries 2+ resources. The 名古屋支店 x 工事担当 policy
 * repeats one resource twice within its own subtable (a realistic fixture
 * mistake), and 名古屋支店 x 積算担当 shares a resource with
 * 名古屋支店 x 工事担当 - both are here on purpose, to exercise dedupe
 * within a single policy and across the policies a user's assignments span.
 */
export const visibilityFixture: MockFixture = {
  apps: [
    {
      id: 1,
      code: "USERS",
      name: "Users",
      fields: {
        user_id: { type: "SINGLE_LINE_TEXT", code: "user_id", label: "User ID" },
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "Name" },
      },
      records: [
        {
          user_id: { type: "SINGLE_LINE_TEXT", value: "u1" },
          name: { type: "SINGLE_LINE_TEXT", value: "User A" },
        },
        {
          user_id: { type: "SINGLE_LINE_TEXT", value: "u2" },
          name: { type: "SINGLE_LINE_TEXT", value: "User B" },
        },
      ],
    },
    {
      id: 2,
      code: "AFFILIATIONS",
      name: "Affiliations",
      fields: {
        affiliation_id: {
          type: "SINGLE_LINE_TEXT",
          code: "affiliation_id",
          label: "Affiliation ID",
        },
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "Name" },
        parent_id: { type: "SINGLE_LINE_TEXT", code: "parent_id", label: "Parent ID" },
      },
      records: [
        {
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "hq" },
          name: { type: "SINGLE_LINE_TEXT", value: "本社" },
          parent_id: { type: "SINGLE_LINE_TEXT", value: "" },
        },
        {
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "nagoya" },
          name: { type: "SINGLE_LINE_TEXT", value: "名古屋支店" },
          parent_id: { type: "SINGLE_LINE_TEXT", value: "hq" },
        },
      ],
    },
    {
      id: 3,
      code: "BUSINESS_ROLES",
      name: "Business Roles",
      fields: {
        role_id: { type: "SINGLE_LINE_TEXT", code: "role_id", label: "Role ID" },
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "Name" },
      },
      records: [
        {
          role_id: { type: "SINGLE_LINE_TEXT", value: "construction" },
          name: { type: "SINGLE_LINE_TEXT", value: "工事担当" },
        },
        {
          role_id: { type: "SINGLE_LINE_TEXT", value: "estimate" },
          name: { type: "SINGLE_LINE_TEXT", value: "積算担当" },
        },
        {
          role_id: { type: "SINGLE_LINE_TEXT", value: "accounting" },
          name: { type: "SINGLE_LINE_TEXT", value: "経理担当" },
        },
      ],
    },
    {
      id: 4,
      code: "USER_ASSIGNMENTS",
      name: "User Assignments",
      fields: {
        user_id: { type: "SINGLE_LINE_TEXT", code: "user_id", label: "User ID" },
        affiliation_id: {
          type: "SINGLE_LINE_TEXT",
          code: "affiliation_id",
          label: "Affiliation ID",
        },
        role_id: { type: "SINGLE_LINE_TEXT", code: "role_id", label: "Role ID" },
      },
      records: [
        {
          user_id: { type: "SINGLE_LINE_TEXT", value: "u1" },
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "nagoya" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "construction" },
        },
        {
          user_id: { type: "SINGLE_LINE_TEXT", value: "u1" },
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "nagoya" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "estimate" },
        },
        {
          user_id: { type: "SINGLE_LINE_TEXT", value: "u2" },
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "hq" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "accounting" },
        },
      ],
    },
    {
      id: 5,
      code: "VISIBILITY_POLICIES",
      name: "Visibility Policies",
      fields: {
        affiliation_id: {
          type: "SINGLE_LINE_TEXT",
          code: "affiliation_id",
          label: "Affiliation ID",
        },
        role_id: { type: "SINGLE_LINE_TEXT", code: "role_id", label: "Role ID" },
        resources: {
          type: "SUBTABLE",
          code: "resources",
          label: "Resources",
          fields: {
            source: { type: "SINGLE_LINE_TEXT", code: "source", label: "Source" },
            resource: { type: "SINGLE_LINE_TEXT", code: "resource", label: "Resource" },
            view: { type: "SINGLE_LINE_TEXT", code: "view", label: "View" },
          },
        },
      },
      records: [
        {
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "nagoya" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "construction" },
          resources: {
            type: "SUBTABLE",
            value: [
              {
                id: "1",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "projects" },
                  view: { type: "SINGLE_LINE_TEXT", value: "active-projects" },
                },
              },
              {
                // Intentional duplicate of row "1"'s resource, to exercise
                // dedupe within a single policy's own subtable.
                id: "2",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "projects" },
                  view: { type: "SINGLE_LINE_TEXT", value: "active-projects" },
                },
              },
              {
                id: "3",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "tasks" },
                  view: { type: "SINGLE_LINE_TEXT", value: "" },
                },
              },
            ],
          },
        },
        {
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "nagoya" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "estimate" },
          resources: {
            type: "SUBTABLE",
            value: [
              {
                // Same resource as 名古屋支店 x 工事担当, to exercise
                // dedupe across the policies one user's assignments span.
                id: "1",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "projects" },
                  view: { type: "SINGLE_LINE_TEXT", value: "active-projects" },
                },
              },
              {
                id: "2",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "estimates" },
                  view: { type: "SINGLE_LINE_TEXT", value: "pending-estimates" },
                },
              },
            ],
          },
        },
        {
          affiliation_id: { type: "SINGLE_LINE_TEXT", value: "hq" },
          role_id: { type: "SINGLE_LINE_TEXT", value: "accounting" },
          resources: {
            type: "SUBTABLE",
            value: [
              {
                id: "1",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "invoices" },
                  view: { type: "SINGLE_LINE_TEXT", value: "" },
                },
              },
              {
                id: "2",
                value: {
                  source: { type: "SINGLE_LINE_TEXT", value: "kintone" },
                  resource: { type: "SINGLE_LINE_TEXT", value: "ledger" },
                  view: { type: "SINGLE_LINE_TEXT", value: "monthly-ledger" },
                },
              },
            ],
          },
        },
      ],
    },
  ],
};
