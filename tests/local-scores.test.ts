import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankedScores, readScores, saveRun } from '../src/ui/local-scores';

test('corrupt storage and unsafe score/date values cannot break the cabinet', () => {
  for (const value of ['{', '{}', 'null']) assert.deepEqual(readScores(value), []);
  assert.deepEqual(readScores(JSON.stringify([{ score: -1, at: 0, circuit: false },
    { score: 100, at: 8640000000000001, circuit: true }, { score: '100', at: 0, circuit: true },
    { score: 1200, at: 10, circuit: true }])), [{ score: 1200, at: 10, circuit: true }]);
});

test('legacy personal best survives history rollover without duplicating a recorded best', () => {
  const history = [{ score: 250, at: 10, circuit: true }];
  assert.equal(rankedScores(history, 500)[0].score, 500);
  assert.equal(rankedScores(history, 250).length, 1);
  assert.deepEqual(history, [{ score: 250, at: 10, circuit: true }]);
});

test('history stays bounded, ranking orders scores and newest equal-score runs, and invalid runs are ignored', () => {
  let history = readScores(null);
  for (let n = 0; n < 80; n++) history = saveRun(history, n % 2 ? 100 : 200, n, true);
  assert.equal(history.length, 50);
  assert.equal(rankedScores(history).length, 10);
  assert.equal(rankedScores(history)[0].at, 78);
  assert.equal(saveRun(history, NaN, 80, true), history);
});
