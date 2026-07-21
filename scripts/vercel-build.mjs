import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Preview environments intentionally have no production database credentials.
// Production deploys migrate first; Vercel publishes the new build only after
// both the migration and Next.js compilation succeed.
if (process.env.VERCEL_ENV === "production") {
  console.log("Applying production database migrations…");
  run("npm", ["run", "db:deploy"]);
}

run("npm", ["run", "build"]);
