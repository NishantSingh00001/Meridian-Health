import { validateMapping, resolveField, syncBatch, FieldMapping } from "../mapping";

describe("validateMapping", () => {
  it("passes a straightforward same-type mapping", () => {
    const m: FieldMapping = { source: "invoice_currency", target: "currency", sourceType: "string(3)", targetType: "string(3)" };
    expect(validateMapping(m)).toEqual({ ok: true, errors: [] });
  });

  it("requires a crosswalk when an enum type differs from its target", () => {
    const m: FieldMapping = { source: "tax_region_code", target: "tax_zone", sourceType: "enum", targetType: "enum" };
    const result = validateMapping(m);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/crosswalk/i);
  });

  it("accepts an enum mapping once a crosswalk is supplied", () => {
    const m: FieldMapping = {
      source: "tax_region_code", target: "tax_zone", sourceType: "enum", targetType: "enum",
      crosswalk: { "7731": "US-CA" },
    };
    expect(validateMapping(m).ok).toBe(true);
  });

  it("rejects an empty crosswalk object", () => {
    const m: FieldMapping = { source: "x", target: "y", sourceType: "enum", targetType: "enum", crosswalk: {} };
    expect(validateMapping(m).ok).toBe(false);
  });
});

describe("resolveField", () => {
  const passthrough: FieldMapping = { source: "subsidiary", target: "legal_entity", sourceType: "ref", targetType: "ref" };

  it("passes through a value with no crosswalk", () => {
    expect(resolveField(passthrough, "ENTITY-9")).toEqual({ value: "ENTITY-9" });
  });

  it("flags a missing required field", () => {
    const required: FieldMapping = { ...passthrough, required: true };
    const result = resolveField(required, undefined);
    expect(result.value).toBeNull();
    expect(result.exception).toMatch(/required but missing/);
  });

  it("allows a missing optional field silently", () => {
    expect(resolveField(passthrough, null)).toEqual({ value: null });
  });

  it("resolves a crosswalk hit", () => {
    const m: FieldMapping = { ...passthrough, crosswalk: { "7731": "US-CA" } };
    expect(resolveField(m, "7731")).toEqual({ value: "US-CA" });
  });

  it("reports a crosswalk miss as an exception, not a thrown error", () => {
    const m: FieldMapping = { ...passthrough, crosswalk: { "7731": "US-CA" } };
    const result = resolveField(m, "9999");
    expect(result.value).toBeNull();
    expect(result.exception).toMatch(/No crosswalk entry/);
  });
});

describe("syncBatch", () => {
  const mappings: FieldMapping[] = [
    { source: "customer_internal_id", target: "customer_id", sourceType: "string", targetType: "uuid", required: true },
    { source: "tax_region_code", target: "tax_zone", sourceType: "enum", targetType: "enum", crosswalk: { "7731": "US-CA" } },
  ];

  it("maps clean records and produces no exceptions", () => {
    const { mapped, exceptions } = syncBatch(
      [{ customer_internal_id: "C-1", tax_region_code: "7731" }],
      mappings
    );
    expect(mapped).toEqual([{ customer_id: "C-1", tax_zone: "US-CA" }]);
    expect(exceptions).toHaveLength(0);
  });

  it("drops a record that fails a required field, but keeps it out of mapped output", () => {
    const { mapped, exceptions } = syncBatch([{ tax_region_code: "7731" }], mappings);
    expect(mapped).toHaveLength(0);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].field).toBe("customer_internal_id");
  });

  it("keeps a record with a non-blocking exception, mapping what it can", () => {
    const { mapped, exceptions } = syncBatch(
      [{ customer_internal_id: "C-2", tax_region_code: "9999" }],
      mappings
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0].customer_id).toBe("C-2");
    expect(mapped[0].tax_zone).toBeUndefined();
    expect(exceptions).toHaveLength(1);
  });

  it("processes a large batch without throwing (capacity smoke test)", () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({
      customer_internal_id: `C-${i}`,
      tax_region_code: i % 2 === 0 ? "7731" : "unknown",
    }));
    const { mapped, exceptions } = syncBatch(big, mappings);
    expect(mapped).toHaveLength(10000);
    expect(exceptions).toHaveLength(5000);
  });
});
