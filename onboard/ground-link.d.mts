import type { Pool, PoolClient } from "pg";

export interface GroundLinkRow {
  up: boolean;
  changedAt: string;
  changedBy?: string;
}

export function readGroundLinkRow(db: Pool | PoolClient): Promise<GroundLinkRow>;
/**
 * Stores the switch. Without changedAt: overwrite, stamped with now(). With changedAt (write-back of a
 * switch made during a database outage): keeps that time and overwrites only an older stored change.
 * Resolves to the row as stored afterwards.
 */
export function writeGroundLinkRow(
  db: Pool | PoolClient,
  up: boolean,
  changedBy?: string,
  changedAt?: string | Date,
): Promise<GroundLinkRow>;
