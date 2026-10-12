import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AD-3: `case_study.status` changes only through `case-study.transition()`, whose
// adapter calls `transition_case_study`. This scans src/ and supabase/migrations/
// for any other writer: no TS insert/update/upsert on `case_study` (its only writes
// go through the two Postgres functions), and no SQL `update case_study set … status`
// outside the sanctioned function body.

const root = fileURLToPath(new URL("..", import.meta.url));

const SANCTIONED_MIGRATION = "supabase/migrations/20261012120000_case_study_transition.sql";
/** The sanctioned writer's definition, through the end of its dollar-quoted body. */
const SANCTIONED_FUNCTION = /create\s+function\s+public\.transition_case_study\s*\([\s\S]*?\$\$[\s\S]*?\$\$\s*;/i;

const TS_WRITE = /\.from\(\s*["'`]case_study["'`]\s*\)\s*\.(insert|update|upsert)\s*\(/;

/** Comments stripped, so prose never counts as a write. */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const SQL_UPDATE = /\bupdate\s+(?:only\s+)?(?:public\.)?"?case_study"?(?:\s+(?:as\s+)?(?!set\b)\w+)?\s+set\b([\s\S]*?)(?:\bwhere\b|\bfrom\b|\breturning\b|;|$)/gi;

/** Number of `update case_study set …` statements whose SET clause names `status`. */
function sqlStatusWrites(sql: string): number {
  return [...stripSqlComments(sql).matchAll(SQL_UPDATE)].filter(([, setClause]) => /\bstatus\b/i.test(setClause))
    .length;
}

function tsWritesCaseStudy(source: string): boolean {
  return TS_WRITE.test(source);
}

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && ext.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"));
}

const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("case_study.status has one writer (AD-3)", () => {
  it("no TypeScript in src/ inserts, updates or upserts case_study directly", () => {
    const offenders = files("src", /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/).filter((rel) => tsWritesCaseStudy(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("no migration writes status outside transition_case_study", () => {
    const migrations = files("supabase/migrations", /\.sql$/);
    expect(migrations).toContain(SANCTIONED_MIGRATION);
    const offenders = migrations.filter((rel) => {
      let sql = read(rel);
      if (rel === SANCTIONED_MIGRATION) {
        expect(sqlStatusWrites(sql.match(SANCTIONED_FUNCTION)?.[0] ?? "")).toBe(1);
        sql = sql.replace(SANCTIONED_FUNCTION, "");
      }
      return sqlStatusWrites(sql) > 0;
    });
    expect(offenders).toEqual([]);
  });

  describe("the scanner catches a planted violation", () => {
    it.each([
      `await client().from("case_study").update({ status: "approved" }).eq("id", id);`,
      `client()\n  .from('case_study')\n  .insert({ name, status: 'approved' })`,
      "db.from(`case_study`).upsert(row)",
    ])("TS: %s", (source) => {
      expect(tsWritesCaseStudy(source)).toBe(true);
    });

    it("TS: reads and other tables pass", () => {
      expect(tsWritesCaseStudy(`client().from("case_study").select("id").eq("id", id)`)).toBe(false);
      expect(tsWritesCaseStudy(`client().from("case_event").insert(row)`)).toBe(false);
    });

    it.each([
      "update public.case_study set status = 'approved' where id = $1;",
      "UPDATE case_study\n  SET name = 'x',\n      status = 'draft';",
      "update only public.case_study cs set (status, name) = ('draft', 'x') where cs.id = p_id;",
      'update public."case_study" set status = p_to',
    ])("SQL: %s", (sql) => {
      expect(sqlStatusWrites(sql)).toBe(1);
    });

    it("SQL: status in WHERE, other columns, other tables and comments pass", () => {
      expect(sqlStatusWrites("update public.case_study set deleted_at = now() where id = $1 and status = 'draft';")).toBe(0);
      expect(sqlStatusWrites("update public.case_event set data = '{}' where type = 'status';")).toBe(0);
      expect(sqlStatusWrites("-- update public.case_study set status = 'approved';")).toBe(0);
      expect(sqlStatusWrites("before update on public.case_study for each row execute function f();")).toBe(0);
    });
  });
});
