import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAbsoluteDropPaths,
  formatReference,
  nextUsageDelayMs,
  toAbsoluteReferencePath,
} from './pathReference.ts';

test('drop paths stay absolute and quote only paths with spaces', () => {
  assert.equal(
    formatAbsoluteDropPaths(['D:\\vault\\a.md', 'D:\\vault\\my note.md']),
    'D:\\vault\\a.md "D:\\vault\\my note.md" ',
  );
});

test('cursor, columns, and line ranges match the toolbox format', () => {
  assert.equal(formatReference('src/main.ts', [{ anchor: { line: 11, ch: 0 }, head: { line: 11, ch: 0 } }]), 'src/main.ts:12');
  assert.equal(formatReference('src/main.ts', [{ anchor: { line: 11, ch: 4 }, head: { line: 11, ch: 9 } }]), 'src/main.ts:12(5-9)');
  assert.equal(formatReference('src/main.ts', [{ anchor: { line: 17, ch: 0 }, head: { line: 11, ch: 3 } }]), 'src/main.ts:12-18');
});

test('absolute references keep the platform path and drop uri suffixes', () => {
  assert.equal(toAbsoluteReferencePath('D:\\vault', 'src/main.ts?x=1#h', 'win32'), 'D:\\vault\\src\\main.ts');
  assert.equal(toAbsoluteReferencePath('/vault', 'src/main.ts', 'posix'), '/vault/src/main.ts');
});

test('usage polling backs off and then returns to the base interval', () => {
  assert.equal(nextUsageDelayMs(45, 0), 45_000);
  assert.equal(nextUsageDelayMs(45, 1), 90_000);
  assert.equal(nextUsageDelayMs(45, 3), 360_000);
  assert.equal(nextUsageDelayMs(45, 8), 360_000);
});
