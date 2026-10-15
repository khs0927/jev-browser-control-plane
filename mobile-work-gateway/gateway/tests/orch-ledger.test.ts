import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../src/orch-ledger.js';

test('sha256 is stable for abc', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
