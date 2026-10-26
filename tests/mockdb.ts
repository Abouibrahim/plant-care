// An in-memory stand-in for the supabase-js query builder, enough for the task expansion, the
// digest and the app's task writes: filters, ordering, range paging, the 1,000-row cap PostgREST
// applies to every response, embeds (`species(care_calendar)`, `plant:plants(tag, site)`), inserts,
// upserts with onConflict, updates, deletes and the unique constraints of the schema (23505).
// Not a full PostgREST: only what the code under test uses.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export interface MockState {
  plants: Row[];
  species: Row[];
  tasks: Row[];
  photos: Row[];
  questions: Row[];
  planting_checks: Row[];
  weather_days: Row[];
  push_subscriptions: Row[];
  settings: Row[];
  /** Storage objects of the photos bucket, by path. */
  objects: Set<string>;
}

export interface MockOptions {
  /** PostgREST's max-rows; Supabase's default is 1,000. */
  rowCap?: number;
  /** Called with every query before it runs (to count requests or inject failures). */
  onQuery?: (q: QueryInfo) => void;
}

export interface QueryInfo {
  table: string;
  op: "select" | "insert" | "upsert" | "update" | "delete";
  columns: string;
}

type Filter = (row: Row) => boolean;
interface Order {
  column: string;
  ascending: boolean;
}

/** Foreign keys the embeds follow: the child row's column that names the parent. */
const FK: Record<string, string> = { species: "species_id", plants: "plant_id" };

/** Unique constraints besides the primary key, per table. */
const UNIQUE: Record<string, string[][]> = {
  tasks: [["plant_id", "rule_key", "due_on"]],
  push_subscriptions: [["endpoint"]],
  weather_days: [["day"]],
  species: [["scientific_name", "cultivar"]],
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

/** A timestamp that grows with every row, so created_at orders rows the way the database would. */
let clock = Date.UTC(2026, 0, 1);
function nextTime(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

function defaults(table: string): Row {
  const base: Row = { id: nextId() };
  if (table === "tasks") return { ...base, status: "pending", acted_at: null, note: "", window_end: null, instruction: "", created_at: nextTime() };
  if (table === "plants") return { ...base, zone: "", quantity: 1, lat: null, lng: null, planted_on: null, source: "existing", rootstock: "", created_at: nextTime(), updated_at: nextTime() };
  if (table === "photos") return { ...base, note: "", ai_result: null, taken_at: nextTime() };
  if (table === "questions") return { ...base, asked_at: nextTime() };
  if (table === "planting_checks") return { ...base, checked_at: nextTime(), zone: "", note: "" };
  // weather_days is keyed on `day`, not an id.
  if (table === "weather_days") return { spray: [], forecast: true, skipped: 0, fetched_at: nextTime() };
  if (table === "species") return { ...base, cultivar: "", user_edits: {}, confirmed: false, created_at: nextTime(), updated_at: nextTime() };
  if (table === "push_subscriptions") return { ...base, created_at: nextTime() };
  return base;
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

/** Top-level split of a select list on commas, leaving the contents of parentheses whole. */
function splitColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function makeState(partial: Partial<MockState> = {}): MockState {
  return {
    plants: [],
    species: [],
    tasks: [],
    photos: [],
    questions: [],
    planting_checks: [],
    weather_days: [],
    push_subscriptions: [],
    settings: [],
    objects: new Set<string>(),
    ...partial,
  };
}

interface Result {
  data: unknown;
  error: { code: string; message: string } | null;
  count?: number | null;
}

class Builder implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitTo: number | null = null;
  private op: QueryInfo["op"] = "select";
  private columns = "*";
  private returning = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private countOnly = false;
  private head = false;

  constructor(
    private readonly state: MockState,
    private readonly table: keyof Omit<MockState, "objects">,
    private readonly options: MockOptions,
  ) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.op === "select") this.columns = columns;
    else this.returning = true;
    if (opts?.count) this.countOnly = true;
    if (opts?.head) this.head = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((r) => cmp(r[column], value) > 0 && r[column] !== null);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== null && cmp(r[column], value) >= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== null && cmp(r[column], value) < 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== null && cmp(r[column], value) <= 0);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  like(column: string, pattern: string) {
    const re = likeToRegExp(pattern);
    this.filters.push((r) => typeof r[column] === "string" && re.test(r[column] as string));
    return this;
  }
  ilike(column: string, pattern: string) {
    return this.like(column, pattern);
  }
  is(column: string, value: null | boolean) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") this.filters.push((r) => r[column] !== value);
    else if (operator === "in") this.filters.push((r) => !(value as unknown[]).includes(r[column]));
    else throw new Error(`mockdb: not.${operator} is not supported`);
    return this;
  }
  /** PostgREST's `or` filter in its own syntax: "col.op.value,col.op.value" (is.null, eq, lt, lte, gt, gte). */
  or(expression: string) {
    const parts = expression.split(",").map((p) => {
      const [column, operator, ...rest] = p.split(".");
      const value = rest.join(".");
      return { column, operator, value };
    });
    this.filters.push((r) =>
      parts.some(({ column, operator, value }) => {
        const v = r[column];
        if (operator === "is") return value === "null" ? v === null : v === (value === "true");
        if (operator === "eq") return String(v) === value;
        if (v === null || v === undefined) return false;
        if (operator === "lt") return cmp(v, value) < 0;
        if (operator === "lte") return cmp(v, value) <= 0;
        if (operator === "gt") return cmp(v, value) > 0;
        if (operator === "gte") return cmp(v, value) >= 0;
        throw new Error(`mockdb: or.${operator} is not supported`);
      }),
    );
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number) {
    this.limitTo = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : ["id"];
    this.ignoreDuplicates = opts?.ignoreDuplicates === true;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  then<R1 = Result, R2 = never>(onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    return this.state[this.table];
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => f(r)));
  }

  /** Projects one row on the select list, following embeds. */
  private project(row: Row, columns: string, table: string): Row {
    const items = splitColumns(columns);
    const out: Row = {};
    for (const item of items) {
      const embed = /^(?:(\w+):)?(\w+)\((.*)\)$/s.exec(item);
      if (embed) {
        const alias = embed[1] ?? embed[2];
        const target = embed[2] as keyof Omit<MockState, "objects">;
        const fk = FK[target];
        if (!fk) throw new Error(`mockdb: no foreign key for embed ${target}`);
        const parent = this.state[target].find((p) => p.id === row[fk]);
        out[alias] = parent ? this.project(parent, embed[3], target) : null;
      } else if (item === "*") {
        Object.assign(out, row);
      } else {
        const [name, source] = item.includes(":") ? item.split(":").map((s) => s.trim()) : [item, item];
        if (source.includes("->>")) {
          // `alias:column->>key`: one text field of a jsonb column, as PostgREST returns it.
          const [column, key] = source.split("->>").map((s) => s.trim());
          const value = (row[column] as Row | null | undefined)?.[key];
          out[name] = value === undefined || value === null ? null : String(value);
        } else out[name] = row[source];
      }
    }
    void table;
    return out;
  }

  private uniqueClash(row: Row, except?: Row): string[] | null {
    const keys = [["id"], ...(UNIQUE[this.table] ?? [])];
    for (const key of keys) {
      if (key.some((k) => row[k] === undefined)) continue;
      const clash = this.rows().find((r) => r !== except && key.every((k) => String(r[k]).toLowerCase() === String(row[k]).toLowerCase()));
      if (clash) return key;
    }
    return null;
  }

  private run(): Result {
    this.options.onQuery?.({ table: this.table, op: this.op, columns: this.columns });
    const cap = this.options.rowCap ?? 1000;

    if (this.op === "select") {
      let rows = this.matching();
      if (this.countOnly && this.head) return { data: null, error: null, count: rows.length };
      if (this.orders.length > 0) {
        rows = [...rows].sort((a, b) => {
          for (const o of this.orders) {
            const c = cmp(a[o.column], b[o.column]);
            if (c !== 0) return o.ascending ? c : -c;
          }
          return 0;
        });
      }
      const total = rows.length;
      if (this.rangeFrom !== null && this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
      if (this.limitTo !== null) rows = rows.slice(0, this.limitTo);
      rows = rows.slice(0, cap);
      const data = rows.map((r) => this.project(r, this.columns, this.table));
      return this.finish(data, this.countOnly ? total : undefined);
    }

    if (this.op === "delete") {
      const gone = this.matching();
      this.state[this.table] = this.rows().filter((r) => !gone.includes(r));
      if (this.table === "plants") {
        // `references plants(id) on delete cascade` in the schema.
        const ids = new Set(gone.map((r) => r.id));
        for (const child of ["photos", "tasks", "questions"] as const) this.state[child] = this.state[child].filter((r) => !ids.has(r.plant_id));
      }
      if (this.table === "species") {
        // `references species(id) on delete cascade` on planting_checks.
        const ids = new Set(gone.map((r) => r.id));
        this.state.planting_checks = this.state.planting_checks.filter((r) => !ids.has(r.species_id));
      }
      return this.finish(this.returning ? gone.map((r) => this.project(r, this.columns, this.table)) : null);
    }

    if (this.op === "update") {
      const changed = this.matching();
      for (const row of changed) Object.assign(row, this.patch);
      return this.finish(this.returning ? changed.map((r) => this.project(r, this.columns, this.table)) : null);
    }

    // insert / upsert
    const written: Row[] = [];
    for (const incoming of this.payload) {
      const row: Row = { ...defaults(this.table), ...incoming };
      const clashKey = this.uniqueClash(row);
      if (clashKey) {
        if (this.op === "insert") {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint (${clashKey.join(", ")})` } };
        }
        const conflictColumns = this.onConflict ?? ["id"];
        const sameKey = conflictColumns.length === clashKey.length && conflictColumns.every((c) => clashKey.includes(c));
        if (!sameKey) {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint (${clashKey.join(", ")})` } };
        }
        if (this.ignoreDuplicates) continue;
        const existing = this.rows().find((r) => clashKey.every((k) => String(r[k]).toLowerCase() === String(row[k]).toLowerCase()))!;
        Object.assign(existing, incoming);
        written.push(existing);
        continue;
      }
      this.rows().push(row);
      written.push(row);
    }
    return this.finish(this.returning ? written.map((r) => this.project(r, this.columns, this.table)) : null);
  }

  private finish(data: unknown, count?: number): Result {
    if (this.mode === "many") return { data, error: null, count: count ?? null };
    const list = Array.isArray(data) ? data : [];
    if (list.length > 1) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    if (list.length === 0) {
      if (this.mode === "single") return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: null, error: null };
    }
    return { data: list[0], error: null };
  }
}

class StorageBucket {
  constructor(
    private readonly state: MockState,
    private readonly options: MockOptions,
  ) {}

  async upload(path: string, _blob: unknown, opts?: { upsert?: boolean }) {
    if (this.state.objects.has(path) && !opts?.upsert) {
      return { data: null, error: { statusCode: "409", message: "The resource already exists" } };
    }
    this.state.objects.add(path);
    return { data: { path }, error: null };
  }

  async list(prefix: string, opts?: { limit?: number }) {
    const names = [...this.state.objects].filter((p) => p.startsWith(`${prefix}/`)).map((p) => ({ name: p.slice(prefix.length + 1) }));
    return { data: names.slice(0, opts?.limit ?? 100), error: null };
  }

  async remove(paths: string[]) {
    for (const p of paths) this.state.objects.delete(p);
    return { data: paths.map((name) => ({ name })), error: null };
  }

  async createSignedUrl(path: string, ttl: number) {
    void this.options;
    return { data: { signedUrl: `https://signed.test/${path}?ttl=${ttl}` }, error: null };
  }
}

/** A client with `from(table)` and `storage.from(bucket)`, over one mutable state. */
export function makeDb(state: MockState, options: MockOptions = {}) {
  return {
    from(table: string) {
      if (!(table in state) || table === "objects") throw new Error(`mockdb: unknown table ${table}`);
      return new Builder(state, table as keyof Omit<MockState, "objects">, options);
    },
    storage: {
      from(bucket: string) {
        void bucket;
        return new StorageBucket(state, options);
      },
    },
  };
}

export type MockDb = ReturnType<typeof makeDb>;

/** The same mock typed as the client the functions take; the shape they use is covered above. */
export function makeClient(state: MockState, options: MockOptions = {}): SupabaseClient {
  return makeDb(state, options) as unknown as SupabaseClient;
}

/**
 * One state for the tests that mock the browser client (`vi.mock("../src/lib/supabase")`): the mock
 * factory and the test file import this module once each from the same cache, so both see it.
 * `resetState` empties it in place between tests, since the client keeps its reference.
 */
export const sharedState: MockState = makeState();

export function resetState(state: MockState): void {
  for (const table of ["plants", "species", "tasks", "photos", "questions", "planting_checks", "weather_days", "push_subscriptions", "settings"] as const) state[table].length = 0;
  state.objects.clear();
}
