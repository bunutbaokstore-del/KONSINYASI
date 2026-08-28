import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

dotenv.config({ path: ".env.local" });
dotenv.config();

const result = spawnSync("pnpm", ["test"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
