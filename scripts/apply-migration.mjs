// Applies a migration over a direct Postgres connection.
//
// The Supabase SQL editor in this project rolls its session back: a migration
// reports success, a query in the same run sees the change, and nothing has
// committed by the time anyone looks again. Four migrations were lost that way
// before the rollback was identified, and each one looked like a different
// problem. This takes the editor out of the loop.
//
// Usage:
//   node scripts/apply-migration.mjs supabase/migrations/0018_dc_item_component_id.sql
//   node scripts/apply-migration.mjs --all
//
// Needs DATABASE_URL in .env.local, which is the Session pooler or direct
// connection string from Supabase under Project Settings, Database. The value
// is read from that file and never printed.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = "supabase/migrations";

function readEnvLocal() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at < 1 || line.trimStart().startsWith("#")) continue;
    env[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return env;
}

function filesToApply(args) {
  if (args.includes("--all")) {
    return fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => path.join(MIGRATIONS_DIR, name));
  }
  const named = args.filter((arg) => !arg.startsWith("--"));
  if (named.length === 0) {
    console.error("Name a migration file, or pass --all.");
    process.exit(1);
  }
  return named;
}

const env = readEnvLocal();
if (!env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not in .env.local.\n" +
      "Copy it from Supabase: Project Settings > Database > Connection string,\n" +
      "then add a line reading DATABASE_URL=postgresql://..."
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  // Supabase terminates TLS with its own certificate chain.
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const where = await client.query(
  "select current_database() as db, current_user as usr, inet_server_addr()::text as addr"
);
const { db, usr, addr } = where.rows[0];
console.log(`connected to ${db} as ${usr} at ${addr ?? "(local socket)"}\n`);

let failed = false;
for (const file of filesToApply(process.argv.slice(2))) {
  const sql = fs.readFileSync(file, "utf8");
  process.stdout.write(`${path.basename(file)} ... `);
  try {
    // No explicit transaction. Each file is written to be safe to re-run, and
    // ALTER TYPE ... ADD VALUE must not be wrapped: wrapping is what the SQL
    // editor was doing, and 0016 has to be able to commit on its own.
    const result = await client.query(sql);
    const rows = Array.isArray(result) ? result.at(-1)?.rows : result.rows;
    console.log("ok");
    if (rows?.length) console.log(`  ${JSON.stringify(rows[0])}`);
  } catch (error) {
    failed = true;
    console.log("FAILED");
    console.log(`  ${error.message}`);
  }
}

await client.end();
process.exit(failed ? 1 : 0);
