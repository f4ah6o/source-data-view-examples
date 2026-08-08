import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: resolve(root, "dist"),
    lib: {
      entry: resolve(root, "main.ts"),
      name: "EmployeeQualificationsCustomization",
      formats: ["iife"],
      fileName: () => "employee-qualifications.js",
      cssFileName: "employee-qualifications",
    },
  },
});
