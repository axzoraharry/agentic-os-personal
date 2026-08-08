/**
 * Minimal JSON Schema validator for the agent tool catalog.
 *
 * Supports exactly the subset the catalog uses: the object / array / string /
 * number / integer / boolean types, plus required, properties, items, enum,
 * minimum, maximum, and additionalProperties: false.
 *
 * It deliberately does NOT apply `default` values. Handlers already own their
 * own defaults, and applying them here would mean two sources of truth.
 */

const TYPE_CHECKS = {
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  string: (v) => typeof v === "string",
  boolean: (v) => typeof v === "boolean",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
};

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * @returns {string[]} human-readable errors; empty array means valid.
 */
export function validateArgs(schema, value, path = "arguments", errors = []) {
  if (!schema || typeof schema !== "object") return errors;

  if (schema.type) {
    const check = TYPE_CHECKS[schema.type];
    if (check && !check(value)) {
      errors.push(`${path}: expected ${schema.type}, got ${typeName(value)}`);
      return errors; // any further check on this node would be meaningless
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of [${schema.enum.join(", ")}]`);
  }
  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    errors.push(`${path}: must be >= ${schema.minimum}`);
  }
  if (typeof schema.maximum === "number" && typeof value === "number" && value > schema.maximum) {
    errors.push(`${path}: must be <= ${schema.maximum}`);
  }

  if (TYPE_CHECKS.object(value) && (schema.type === "object" || schema.properties)) {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined) errors.push(`${path}.${key}: required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${path}.${key}: unknown property`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (value[key] !== undefined) validateArgs(sub, value[key], `${path}.${key}`, errors);
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validateArgs(schema.items, item, `${path}[${i}]`, errors));
  }

  return errors;
}
