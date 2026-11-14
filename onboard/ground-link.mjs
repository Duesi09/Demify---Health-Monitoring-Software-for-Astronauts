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
  return toLink(r);
}

/**
 * Stores the switch position. Without `changedAt` the row is overwritten and
 * stamped with the database's now(). With `changedAt` (a switch made while
 * the database was unreachable, written back later) the original switch
 * time is kept, and the row is only overwritten when that time is newer than
 * the stored one, so a write-back never undoes a later change. Resolves to
 * the row as stored afterwards.
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {boolean} up
 * @param {string} [changedBy]
 * @param {string | Date} [changedAt]
 * @returns {Promise<{ up: boolean; changedAt: string; changedBy?: string }>}
 */
export async function writeGroundLinkRow(db, up, changedBy, changedAt) {
  if (changedAt === undefined) {
    const { rows } = await db.query(
      `INSERT INTO ground_link (id, up, changed_at, changed_by) VALUES (1, $1, now(), $2)
       ON CONFLICT (id) DO UPDATE SET up = EXCLUDED.up, changed_at = EXCLUDED.changed_at, changed_by = EXCLUDED.changed_by
       RETURNING up, changed_at, changed_by`,
      [up, changedBy ?? null],
    );
    return toLink(rows[0]);
  }
  const at = changedAt instanceof Date ? changedAt : new Date(changedAt);
  if (!Number.isFinite(at.getTime())) throw new Error(`Invalid ground link switch time: ${String(changedAt)}`);
  const { rows } = await db.query(
    `INSERT INTO ground_link (id, up, changed_at, changed_by) VALUES (1, $1, $3, $2)
     ON CONFLICT (id) DO UPDATE SET up = EXCLUDED.up, changed_at = EXCLUDED.changed_at, changed_by = EXCLUDED.changed_by
       WHERE ground_link.changed_at < EXCLUDED.changed_at
     RETURNING up, changed_at, changed_by`,
    [up, changedBy ?? null, at.toISOString()],
  );
  // No row returned: the stored change is as new or newer and stays.
  return rows[0] ? toLink(rows[0]) : readGroundLinkRow(db);
}

/** @param {{ up: unknown; changed_at: unknown; changed_by: unknown }} r */
function toLink(r) {
  return {
    up: r.up === true,
    changedAt: new Date(/** @type {string | Date} */ (r.changed_at)).toISOString(),
    ...(r.changed_by ? { changedBy: String(r.changed_by) } : {}),
  };
}
