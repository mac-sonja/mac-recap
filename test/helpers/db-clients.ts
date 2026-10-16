import { randomInt } from "node:crypto";
import type pg from "pg";

/** A client row as `create_client` returns it (the fields tests use). */
export interface TestClient {
  id: string;
  name: string;
  code: string;
}

/** Codes the fixed-name DB tests expect to be free (AD-21 matrix); random prefixes avoid them. */
const RESERVED = new Set(["LUM", "CIT", "AAX", "MXX", "SPA"]);

/**
 * Three random letters that no client code starts with yet. Clients are never
 * deleted and the DB tests share one database, so each test client gets its own
 * prefix (one prefix allows only 28 codes, AD-21 rule 3).
 */
export async function freshPrefix(db: pg.Pool | pg.ClientBase): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join("");
    if (RESERVED.has(prefix)) continue;
    const { rows } = await db.query("select 1 from public.client where code like $1 limit 1", [`${prefix}%`]);
    if (rows.length === 0) return prefix;
  }
  throw new Error("no free client code prefix found");
}

/**
 * A name whose code letters are exactly `letters`: digits never count as letters
 * (rule 1), so the random digit tag keeps each name key unique without touching the code.
 */
export const nameWithLetters = (letters: string) => `${letters} ${randomInt(1_000_000_000)}`;

/** Creates (and commits, unless `db` is inside a transaction) a client through `create_client`. */
export async function createTestClient(db: pg.Pool | pg.ClientBase, actorId: string, name?: string): Promise<TestClient> {
  const clientName = name ?? nameWithLetters(await freshPrefix(db));
  const { rows } = await db.query<TestClient>("select id, name, code from public.create_client($1, null, null, $2)", [clientName, actorId]);
  return rows[0];
}
