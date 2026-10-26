import { randomInt, randomUUID } from "node:crypto";
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

/** The sector and description every test client gets (both required since Story 2.15). */
export const TEST_INDUSTRY = "lusso";
export const TEST_DESCRIPTION = "Cliente di prova.";

/**
 * Creates (and commits, unless `db` is inside a transaction) a client through
 * `create_client`, with `TEST_INDUSTRY` and `TEST_DESCRIPTION`. It has no logo
 * and no brief: `addTestLogo` gives it a logo for `update_client`.
 */
export async function createTestClient(db: pg.Pool | pg.ClientBase, actorId: string, name?: string): Promise<TestClient> {
  const clientName = name ?? nameWithLetters(await freshPrefix(db));
  const { rows } = await db.query<TestClient>("select id, name, code from public.create_client($1, $2, $3, $4)", [
    clientName,
    TEST_INDUSTRY,
    TEST_DESCRIPTION,
    actorId,
  ]);
  return rows[0];
}

/**
 * Inserts a `client_logo` row of `clientId` (no object is stored) and returns its id,
 * for `update_client`, which needs a logo since Story 2.15. It is not linked.
 */
export async function addTestLogo(db: pg.Pool | pg.ClientBase, clientId: string, actorId: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    "insert into public.client_logo (id, client_id, path, mime_type, size_bytes, created_by) values ($1, $2, $3, 'image/png', 10, $4)",
    [id, clientId, `clients/${clientId}/logos/${id}.png`, actorId],
  );
  return id;
}
