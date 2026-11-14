import type { Pool, PoolClient } from "pg";

export interface GroundLinkRow {
  up: boolean;
  changedAt: string;
  changedBy?: string;
}

export function readGroundLinkRow(db: Pool | PoolClient): Promise<GroundLinkRow>;
export function writeGroundLinkRow(db: Pool | PoolClient, up: boolean, changedBy?: string): Promise<GroundLinkRow>;
