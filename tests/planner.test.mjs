import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlannedDuration } from '../src/js/planner.js';

test('planned workshop totals use compact hour and minute labels', () => {
    for (const [seconds, expected] of [
        [0, '0 min'],
        [300, '5 min'],
        [3600, '1 h'],
        [3900, '1 h 5 min'],
        [45000, '12 h 30 min'],
        [360900, '100 h 15 min'],
    ]) assert.equal(formatPlannedDuration(seconds), expected);
});
