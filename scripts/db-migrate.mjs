// @ts-check
// Applies the PostgreSQL migrations of the onboard server (onboard/migrations.mjs)
// and prints the tables. The app and the sync service also migrate on start;
// this is for a first install, an upgrade check or a fresh test database.
//   DATABASE_URL=postgres://demify:<password>@127.0.0.1:5432/demify npm run db:migrate
// Exit code 1 when DATABASE_URL is missing, the database is unreachable or a
// migration fails.
import { closePool, databaseUrl, ensureSchema, getPool } from "../onboard/db.mjs";

/** host:port/database, without the user name or password. @param {string} url */
function where(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(DATABASE_URL is not a valid URL)";
  }
}

/** @param {unknown} err */
function message(err) {
  if (err instanceof Error) {
    const code = /** @type {{ code?: unknown }} */ (err).code;
    return err.message || (typeof code === "string" ? code : err.name);
  }
  return String(err);
}

const url = databaseUrl();
if (!url) {
  console.error(
    "db:migrate: DATABASE_URL is not set. Without it Demify uses its JSON file store and needs no migration.\n" +
      "Example: DATABASE_URL=postgres://demify:<password>@127.0.0.1:5432/demify npm run db:migrate",
  );
  process.exit(1);
}

const target = where(url);
let code = 0;
try {
  const pool = getPool();
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error(`db:migrate: cannot reach PostgreSQL at ${target}: ${message(err)}`);
    code = 1;
  }
  if (code === 0) {
    try {
      const applied = await ensureSchema(pool);
      console.log(
        applied.length
          ? `Applied migrations at ${target}: ${applied.join(", ")}`
          : `Schema at ${target} is up to date (no pending migrations).`,
      );
      const migrations = await pool.query(
        "SELECT id, applied_at FROM schema_migrations ORDER BY id",
      );
      console.log("Migrations:");
      for (const r of migrations.rows) {
        console.log(`  ${r.id}  (applied ${new Date(r.applied_at).toISOString()})`);
      }
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      console.log("Tables:");
      for (const r of tables.rows) console.log(`  ${r.table_name}`);
    } catch (err) {
      console.error(`db:migrate: migration failed at ${target}: ${message(err)}`);
      code = 1;
    }
  }
} catch (err) {
  console.error(`db:migrate: ${message(err)}`);
  code = 1;
} finally {
  await closePool();
}
process.exit(code);
