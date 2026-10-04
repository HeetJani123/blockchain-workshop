import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvoice, canAfford, settle } from '../lib/engine.mjs';
test('invoices have unique nonces and bounded prices and payloads', () => {
  const invoices = Array.from({ length: 1000 }, createInvoice);
  assert.equal(new Set(invoices.map(i => i.id)).size, 1000);
  for (const i of invoices) { assert.match(i.id, /^[A-Z0-9]+$/); assert.ok(i.cents >= 1 && i.cents <= 15); assert.ok(i.size >= 24 && i.size <= 1024); }
});
test('both limits are enforced, with inclusive boundaries', () => {
  assert.equal(canAfford(5, 5, 5), true);
  assert.equal(canAfford(6, 5, 100), false);
  assert.equal(canAfford(5, 15, 4), false);
  assert.equal(canAfford(1, 15, 0), false);
});
test('settlement uses exact cents and cannot overdraw', () => {
  assert.equal(settle(5, 5, 100), 95);
  assert.equal(settle(5, 5, 5), 0);
  assert.throws(() => settle(6, 5, 100));
  assert.throws(() => settle(5, 15, 4));
});
