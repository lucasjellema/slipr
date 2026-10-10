import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSchema, assertSupported } from '../schema-check.js';
import { readJson } from './helpers.js';

test('Slipr schemas only use keywords the checker supports', () => {
  assert.doesNotThrow(() => assertSupported(readJson('shared/schema/show.schema.json')));
  assert.doesNotThrow(() => assertSupported(readJson('shared/schema/template.schema.json')));
});

test('assertSupported rejects unknown keywords', () => {
  assert.throws(() => assertSupported({ type: 'object', properties: { a: { oneOf: [] } } }), /oneOf/);
});

test('type, required and additionalProperties', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: { type: 'string' }, age: { type: 'integer' } },
  };
  assert.deepEqual(checkSchema({ name: 'x', age: 3 }, schema), []);
  const issues = checkSchema({ age: 1.5, extra: true }, schema);
  assert.deepEqual(issues.map((i) => [i.path, i.code]).sort(), [
    ['', 'required'],
    ['age', 'type'],
    ['extra', 'unknown-property'],
  ]);
});

test('string, number and array constraints', () => {
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'string', pattern: '^[a-z]+$', minLength: 1 },
      n: { type: 'number', minimum: 0, maximum: 1 },
      list: { type: 'array', minItems: 1, items: { enum: ['a', 'b'] } },
      v: { const: '0.1' },
    },
  };
  const issues = checkSchema({ id: 'A1', n: 2, list: ['a', 'c'], v: '0.2' }, schema);
  assert.deepEqual(issues.map((i) => [i.path, i.code]), [
    ['id', 'pattern'],
    ['n', 'maximum'],
    ['list[1]', 'enum'],
    ['v', 'const'],
  ]);
  assert.equal(checkSchema({ list: [] }, schema)[0].code, 'minItems');
});

test('$ref and propertyNames', () => {
  const schema = {
    type: 'object',
    propertyNames: { $ref: '#/$defs/id' },
    additionalProperties: { $ref: '#/$defs/term' },
    $defs: {
      id: { type: 'string', pattern: '^[a-z-]+$' },
      term: { type: 'object', required: ['term'] },
    },
  };
  assert.deepEqual(checkSchema({ 'ok-id': { term: 'x' } }, schema), []);
  const issues = checkSchema({ 'Bad Id': {} }, schema);
  assert.deepEqual(issues.map((i) => i.code).sort(), ['pattern', 'required']);
  assert.match(issues.find((i) => i.code === 'pattern').message, /^key /);
});

test('anyOf with a type discriminator checks only the matching branch', () => {
  const schema = {
    anyOf: [
      { type: 'object', required: ['md'], properties: { type: { const: 'text' }, md: { type: 'string' } } },
      { type: 'object', required: ['url'], properties: { type: { const: 'embed' }, url: { type: 'string' } } },
    ],
  };
  assert.deepEqual(checkSchema({ type: 'text', md: 'hi' }, schema), []);
  assert.deepEqual(checkSchema({ type: 'embed' }, schema).map((i) => i.message), ['is missing required property "url"']);
  const unknown = checkSchema({ type: 'carousel' }, schema);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].path, 'type');
  assert.match(unknown[0].message, /unknown type "carousel"/);
});

test('anyOf without discriminator reports the closest branch', () => {
  const schema = {
    anyOf: [
      { type: 'string' },
      { type: 'object', required: ['src'], additionalProperties: false, properties: { src: { type: 'string' }, alt: { type: 'string' } } },
      { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string' } } },
    ],
  };
  assert.deepEqual(checkSchema('text', schema), []);
  const issues = checkSchema({ alt: 'x' }, schema);
  assert.deepEqual(issues.map((i) => i.message), ['is missing required property "src"']);
  assert.equal(checkSchema(42, schema)[0].code, 'anyOf');
});

test('unresolvable $ref throws (schema bug, not data bug)', () => {
  assert.throws(() => checkSchema({}, { $ref: '#/$defs/missing' }), /Unresolvable/);
});
