// Core field-mapping + crosswalk logic for Customer Data Bridge.
// Deliberately framework-free so it's fully unit-testable without a DB or network.

export type FieldType = "string" | "enum" | "ref" | "uuid" | "string(3)";

export interface FieldMapping {
  source: string;
  target: string;
  sourceType: FieldType;
  targetType: FieldType;
  crosswalk?: Record<string, string>; // source value -> target value, required when types are enum-like and differ
  required?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface RawRecord {
  [sourceField: string]: string | number | null | undefined;
}

export interface MappedRecord {
  [targetField: string]: string | number | null;
}

export interface SyncOutcome {
  mapped: MappedRecord[];
  exceptions: { recordIndex: number; field: string; reason: string }[];
}

/** Validates a mapping definition itself (static check, run before any sync). */
export function validateMapping(mapping: FieldMapping): ValidationResult {
  const errors: string[] = [];

  if (!mapping.source || !mapping.target) {
    errors.push("Both source and target fields are required.");
  }

  const isEnumLike = mapping.sourceType === "enum" || mapping.targetType === "enum";

  // Any mapping touching an enum needs an explicit crosswalk — even when both
  // sides are "enum", because the two systems' enum *domains* still differ
  // (e.g. NetSuite's 4-digit tax region codes vs Billing's ISO zone strings).
  // A bare type-equality check misses exactly this case.
  if (isEnumLike && !mapping.crosswalk) {
    errors.push(
      `${mapping.source} (${mapping.sourceType}) -> ${mapping.target} (${mapping.targetType}) ` +
        `touches an enum and needs a crosswalk table — matching type names doesn't mean matching value domains.`
    );
  }

  if (mapping.crosswalk && Object.keys(mapping.crosswalk).length === 0) {
    errors.push(`Crosswalk for ${mapping.source} is declared but empty.`);
  }

  return { ok: errors.length === 0, errors };
}

/** Applies a single mapping to one raw value. Throws only on truly unexpected input. */
export function resolveField(
  mapping: FieldMapping,
  rawValue: RawRecord[string]
): { value: MappedRecord[string]; exception?: string } {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    if (mapping.required) {
      return { value: null, exception: `${mapping.source} is required but missing.` };
    }
    return { value: null };
  }

  if (mapping.crosswalk) {
    const key = String(rawValue);
    if (!(key in mapping.crosswalk)) {
      return {
        value: null,
        exception: `No crosswalk entry for ${mapping.source}="${key}" -> ${mapping.target}.`,
      };
    }
    return { value: mapping.crosswalk[key] };
  }

  return { value: rawValue as MappedRecord[string] };
}

/** Runs a batch of raw records through a set of mappings, producing mapped output + an exception list. */
export function syncBatch(records: RawRecord[], mappings: FieldMapping[]): SyncOutcome {
  const exceptions: SyncOutcome["exceptions"] = [];
  const mapped: MappedRecord[] = [];

  records.forEach((record, recordIndex) => {
    const out: MappedRecord = {};
    let recordHadBlockingException = false;

    for (const mapping of mappings) {
      const { value, exception } = resolveField(mapping, record[mapping.source]);
      if (exception) {
        exceptions.push({ recordIndex, field: mapping.source, reason: exception });
        if (mapping.required) recordHadBlockingException = true;
        continue;
      }
      out[mapping.target] = value;
    }

    if (!recordHadBlockingException) {
      mapped.push(out);
    }
  });

  return { mapped, exceptions };
}
