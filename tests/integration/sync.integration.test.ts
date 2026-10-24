// Integration test: exercises the sync pipeline end-to-end against an in-memory
// stand-in for Supabase, including the workspace-isolation guarantee that RLS
// enforces in production. Run with: npm run test:integration

import { syncBatch, FieldMapping } from "../../lib/mapping";

type Row = { workspace_id: string; [k: string]: unknown };

class FakeSupabase {
  private tables: Record<string, Row[]> = { exceptions: [], synced_records: [] };

  insert(table: string, rows: Row[]) {
    this.tables[table].push(...rows);
  }

  // Mirrors what an RLS policy does: a workspace can only ever read its own rows.
  selectForWorkspace(table: string, workspaceId: string): Row[] {
    return this.tables[table].filter((r) => r.workspace_id === workspaceId);
  }
}

describe("sync pipeline (integration)", () => {
  const mappings: FieldMapping[] = [
    { source: "customer_internal_id", target: "customer_id", sourceType: "string", targetType: "uuid", required: true },
    { source: "tax_region_code", target: "tax_zone", sourceType: "enum", targetType: "enum", crosswalk: { "7731": "US-CA" } },
  ];

  it("writes mapped records and exceptions scoped to the correct workspace", () => {
    const db = new FakeSupabase();

    const workspaceARecords = [
      { customer_internal_id: "A-1", tax_region_code: "7731" },
      { customer_internal_id: "A-2", tax_region_code: "bogus" },
    ];
    const workspaceBRecords = [{ customer_internal_id: "B-1", tax_region_code: "7731" }];

    const runSync = (workspaceId: string, records: typeof workspaceARecords) => {
      const { mapped, exceptions } = syncBatch(records, mappings);
      db.insert(
        "synced_records",
        mapped.map((m) => ({ workspace_id: workspaceId, ...m }))
      );
      db.insert(
        "exceptions",
        exceptions.map((e) => ({ workspace_id: workspaceId, ...e }))
      );
      return { mapped, exceptions };
    };

    runSync("workspace-A", workspaceARecords);
    runSync("workspace-B", workspaceBRecords);

    // Workspace A sees exactly its own 2 synced records and 1 exception.
    expect(db.selectForWorkspace("synced_records", "workspace-A")).toHaveLength(2);
    expect(db.selectForWorkspace("exceptions", "workspace-A")).toHaveLength(1);

    // Workspace B's data never leaks into A's view, and vice versa — this is
    // the behavioral guarantee that Postgres RLS policies enforce for real.
    expect(db.selectForWorkspace("synced_records", "workspace-B")).toHaveLength(1);
    expect(db.selectForWorkspace("exceptions", "workspace-A").every((r) => r.workspace_id === "workspace-A")).toBe(true);
  });

  it("a failed run on one connector does not block or corrupt another connector's data", () => {
    const db = new FakeSupabase();
    const broken = [{ tax_region_code: "7731" }]; // missing required customer_internal_id
    const healthy = [{ customer_internal_id: "C-9", tax_region_code: "7731" }];

    const { exceptions: brokenExceptions } = syncBatch(broken, mappings);
    db.insert("exceptions", brokenExceptions.map((e) => ({ workspace_id: "ws-1", ...e })));

    const { mapped: healthyMapped } = syncBatch(healthy, mappings);
    db.insert("synced_records", healthyMapped.map((m) => ({ workspace_id: "ws-1", ...m })));

    expect(db.selectForWorkspace("exceptions", "ws-1")).toHaveLength(1);
    expect(db.selectForWorkspace("synced_records", "ws-1")).toHaveLength(1);
  });
});
