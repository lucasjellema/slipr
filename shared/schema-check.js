// @ts-check
/**
 * Minimal JSON Schema (draft 2020-12) checker for the subset of keywords that
 * Slipr's own schemas use. It exists so browser code can validate against the
 * shared schema files without a third-party library (D-001, D-002).
 *
 * Not a general-purpose validator: keywords outside SUPPORTED_KEYWORDS are
 * rejected by `assertSupported()`, which the tests run on every Slipr schema.
 */

/** @typedef {{ path: string, message: string, code: string }} Issue */

/** Keywords this checker understands. Annotation keywords are accepted and ignored. */
export const SUPPORTED_KEYWORDS = new Set([
  // annotations
  '$schema', '$id', 'title', 'description', 'default', 'examples',
  // structure
  '$defs', '$ref', 'type', 'properties', 'required', 'additionalProperties',
  'propertyNames', 'items',
  // values
  'const', 'enum', 'pattern', 'minLength', 'maxLength', 'minItems', 'maxItems',
  'minimum', 'maximum',
  // combinators
  'anyOf',
]);

/**
 * Validate `instance` against `schema` (the root schema, used to resolve $ref).
 * @param {unknown} instance
 * @param {object} schema
 * @returns {Issue[]}
 */
export function checkSchema(instance, schema) {
  /** @type {Issue[]} */
  const issues = [];
  check(instance, schema, schema, '', issues);
  return issues;
}

/**
 * Throw if `schema` uses a keyword this checker does not implement.
 * @param {object} schema
 */
export function assertSupported(schema) {
  const walk = (/** @type {any} */ node, /** @type {string} */ where) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) {
        throw new Error(`Unsupported JSON Schema keyword "${key}" at ${where || '/'}`);
      }
      if (key === 'properties' || key === '$defs') {
        for (const [name, sub] of Object.entries(value)) walk(sub, `${where}/${key}/${name}`);
      } else if (key === 'anyOf') {
        value.forEach((/** @type {any} */ sub, /** @type {number} */ i) => walk(sub, `${where}/anyOf/${i}`));
      } else if (['items', 'additionalProperties', 'propertyNames'].includes(key) && typeof value === 'object') {
        walk(value, `${where}/${key}`);
      }
    }
  };
  walk(schema, '');
}

/**
 * @param {any} value
 * @param {any} schema
 * @param {any} root
 * @param {string} path
 * @param {Issue[]} issues
 */
function check(value, schema, root, path, issues) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    issues.push({ path, code: 'not-allowed', message: 'is not allowed here' });
    return;
  }
  if (schema.$ref) {
    check(value, resolveRef(schema.$ref, root), root, path, issues);
  }
  if (schema.type && !hasType(value, schema.type)) {
    issues.push({ path, code: 'type', message: `should be ${article(schema.type)} but is ${describe(value)}` });
    return; // further checks would only add noise
  }
  if ('const' in schema && value !== schema.const) {
    issues.push({ path, code: 'const', message: `should be ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, code: 'enum', message: `should be one of ${schema.enum.map((/** @type {any} */ v) => JSON.stringify(v)).join(', ')}` });
  }
  if (typeof value === 'string') checkString(value, schema, path, issues);
  if (typeof value === 'number') checkNumber(value, schema, path, issues);
  if (Array.isArray(value)) checkArray(value, schema, root, path, issues);
  if (isObject(value)) checkObject(value, schema, root, path, issues);
  if (schema.anyOf) checkAnyOf(value, schema.anyOf, root, path, issues);
}

/** @param {string} value @param {any} schema @param {string} path @param {Issue[]} issues */
function checkString(value, schema, path, issues) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    issues.push({ path, code: 'minLength', message: schema.minLength === 1 ? 'should not be empty' : `should have at least ${schema.minLength} characters` });
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    issues.push({ path, code: 'maxLength', message: `should have at most ${schema.maxLength} characters` });
  }
  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
    issues.push({ path, code: 'pattern', message: `"${value}" does not match the required format (${schema.pattern})` });
  }
}

/** @param {number} value @param {any} schema @param {string} path @param {Issue[]} issues */
function checkNumber(value, schema, path, issues) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    issues.push({ path, code: 'minimum', message: `should be ≥ ${schema.minimum}` });
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    issues.push({ path, code: 'maximum', message: `should be ≤ ${schema.maximum}` });
  }
}

/** @param {any[]} value @param {any} schema @param {any} root @param {string} path @param {Issue[]} issues */
function checkArray(value, schema, root, path, issues) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    issues.push({ path, code: 'minItems', message: `should have at least ${schema.minItems} item(s)` });
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    issues.push({ path, code: 'maxItems', message: `should have at most ${schema.maxItems} item(s)` });
  }
  if (schema.items !== undefined) {
    value.forEach((item, i) => check(item, schema.items, root, `${path}[${i}]`, issues));
  }
}

/** @param {Record<string, any>} value @param {any} schema @param {any} root @param {string} path @param {Issue[]} issues */
function checkObject(value, schema, root, path, issues) {
  for (const name of schema.required ?? []) {
    if (!(name in value)) {
      issues.push({ path, code: 'required', message: `is missing required property "${name}"` });
    }
  }
  const props = schema.properties ?? {};
  for (const [name, sub] of Object.entries(value)) {
    const childPath = join(path, name);
    if (schema.propertyNames) {
      /** @type {Issue[]} */
      const nameIssues = [];
      check(name, schema.propertyNames, root, childPath, nameIssues);
      for (const issue of nameIssues) issues.push({ ...issue, message: `key ${issue.message}` });
    }
    if (name in props) {
      check(sub, props[name], root, childPath, issues);
    } else if (schema.additionalProperties === false) {
      issues.push({ path: childPath, code: 'unknown-property', message: `unknown property "${name}"` });
    } else if (schema.additionalProperties !== undefined) {
      check(sub, schema.additionalProperties, root, childPath, issues);
    }
  }
}

/**
 * anyOf with readable errors. If the branches are objects discriminated by a
 * `type` const (Slipr's reader blocks), only the matching branch is checked.
 * Otherwise the error list of the closest branch is reported.
 * @param {any} value @param {any[]} branches @param {any} root @param {string} path @param {Issue[]} issues
 */
function checkAnyOf(value, branches, root, path, issues) {
  const resolved = branches.map((b) => (b.$ref ? resolveRef(b.$ref, root) : b));

  const discriminated = resolved.every((b) => b?.properties?.type && 'const' in b.properties.type);
  if (discriminated && isObject(value)) {
    const match = resolved.find((b) => b.properties.type.const === value.type);
    if (!match) {
      const allowed = resolved.map((b) => JSON.stringify(b.properties.type.const)).join(', ');
      issues.push({ path: join(path, 'type'), code: 'enum', message: `unknown type ${JSON.stringify(value.type)}; should be one of ${allowed}` });
      return;
    }
    check(value, match, root, path, issues);
    return;
  }

  /** @type {Issue[][]} */
  const attempts = [];
  for (const branch of resolved) {
    /** @type {Issue[]} */
    const branchIssues = [];
    check(value, branch, root, path, branchIssues);
    if (branchIssues.length === 0) return;
    attempts.push(branchIssues);
  }
  // Prefer branches that at least have the right basic type.
  const plausible = attempts.filter((a) => !(a.length === 1 && a[0].path === path && (a[0].code === 'type' || a[0].code === 'const')));
  if (plausible.length > 0) {
    issues.push(...plausible.reduce((best, a) => (a.length < best.length ? a : best)));
  } else {
    issues.push({ path, code: 'anyOf', message: `has an unsupported form (${describe(value)})` });
  }
}

/** @param {string} ref @param {any} root */
function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`Only local $ref is supported, got ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) throw new Error(`Unresolvable $ref ${ref}`);
  }
  return node;
}

/** @param {any} value @param {string} type */
function hasType(value, type) {
  switch (type) {
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: throw new Error(`Unsupported type "${type}"`);
  }
}

/** @param {any} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {any} value */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  return `${article(typeof value)} (${JSON.stringify(value)})`;
}

/** @param {string} word */
function article(word) {
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

/** @param {string} path @param {string} name */
function join(path, name) {
  const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
  if (!path) return key.startsWith('"') ? `[${key}]` : key;
  return key.startsWith('"') ? `${path}[${key}]` : `${path}.${key}`;
}
