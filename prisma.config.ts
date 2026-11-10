import { defineConfig } from "prisma/config";
import { config } from "./src/config/env.js";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: config.databaseUrl },
});
