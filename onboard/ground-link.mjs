// @ts-check
/**
 * The simulated ground link switch as stored in PostgreSQL (table
 * ground_link, one row). The app wraps this in src/lib/onboard/ground-link.ts
 * (with a file fallback when there is no database); the sync service reads it
 * directly before every scheduled sync.
 */

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @returns {Promise<{ up: boolean; changedAt: string; changedBy?: string }>}
 */
export async function readGroundLinkRow(db) {
  const { rows } = await db.query("SELECT up, changed_at, changed_by FROM ground_link WHERE id = 1");
  const r = rows[0];
  if (!r) return { up: true, changedAt: new Date(0).toISOString() };
  return {
    up: r.up === true,
    changedAt: new Date(r.changed_at).toISOString(),
    ...(r.changed_by ? { changedBy: String(r.changed_by) } : {}),
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {boolean} up
 * @param {string} [changedBy]
 */
export async function writeGroundLinkRow(db, up, changedBy) {
  const { rows } = await db.query(
    `INSERT INTO ground_link (id, up, changed_at, changed_by) VALUES (1, $1, now(), $2)
     ON CONFLICT (id) DO UPDATE SET up = EXCLUDED.up, changed_at = EXCLUDED.changed_at, changed_by = EXCLUDED.changed_by
     RETURNING up, changed_at, changed_by`,
    [up, changedBy ?? null],
  );
  const r = rows[0];
  return {
    up: r.up === true,
    changedAt: new Date(r.changed_at).toISOString(),
    ...(r.changed_by ? { changedBy: String(r.changed_by) } : {}),
  };
}
