import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createVirtualClock, durationMs } from './virtual-clock.mjs';
import { parseTimeTravelOptions, scenarios } from './time-travel.mjs';

test('virtual durations accept arbitrary seconds, minutes, hours and exact integer milliseconds', () => {
    for(const [value,expected] of [[0,0],[123456,123456],['0s',0],['10s',10000],['2m',120000],['1h',3600000],['1.5h',5400000],['1.25s',1250],['1250ms',1250]])assert.equal(durationMs(value),expected);
    for(const value of [-1,NaN,Infinity,1.5,'-1s','1e3s','1','1d','0.0001s','ten minutes',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>durationMs(value),/whole millisecond/);
});

function browserContext() {
    const events=[];
    const context=vm.createContext({document:{dispatchEvent:event=>events.push(event.type)},Event:class {constructor(type){this.type=type;}}});
    const evaluate=async source=>vm.runInContext(source,context);
    return {clock:createVirtualClock(evaluate),evaluate,events};
}

test('virtual clock advances only its isolated context and emits the real rendering event', async () => {
    const realNow=Date.now;
    const {clock,evaluate,events}=browserContext();
    const original=await evaluate('Date.now');
    assert.equal(await clock.install(1000),1000);
    assert.equal(await clock.advance('10s'),11000);
    assert.equal(await clock.advance('2m'),131000);
    assert.equal(await clock.advance('1h'),3731000);
    assert.equal(await evaluate('Date.now()'),3731000);
    assert.deepEqual(events,['visibilitychange','visibilitychange','visibilitychange']);
    assert.equal(Date.now,realNow,'Host/OS clock is never modified');
    assert.equal(await clock.restore(),true);
    assert.equal(await evaluate('Date.now'),original);
    assert.equal(await evaluate(`'__easyTimerTestClock' in globalThis`),false);
    assert.equal(await clock.restore(),false);
});

test('invalid jumps and duplicate installation cannot corrupt or overflow virtual time', async () => {
    const {clock,evaluate,events}=browserContext();
    await assert.rejects(clock.advance('1s'),/not installed/);
    await assert.rejects(clock.install(-1),/Invalid virtual timestamp/);
    await clock.install(Number.MAX_SAFE_INTEGER-1000);
    await assert.rejects(clock.install(),/already installed/);
    await assert.rejects(clock.advance('2s'),/overflow/);
    await assert.rejects(clock.advance(-1),/whole millisecond/);
    assert.equal(await evaluate('Date.now()'),Number.MAX_SAFE_INTEGER-1000);
    assert.deepEqual(events,[]);
    await clock.restore();
});

test('scenario options leave the normal regression default unchanged and expand selected cases', () => {
    assert.deepEqual(parseTimeTravelOptions([]).names,[]);
    const options=parseTimeTravelOptions(['--scenario','quick-endgame,session-phase-overtime','--scenario','quick-endgame','--theme','dark','--advance','2h','--viewport','320x568','--language','de']);
    assert.deepEqual(options.names,['quick-endgame','session-phase-overtime']);
    assert.deepEqual(options.themes,['dark']);assert.equal(options.advance,7200000);
    assert.equal(options.width,320);assert.equal(options.height,568);assert.equal(options.language,'de');
    assert.deepEqual(parseTimeTravelOptions(['--scenario','all']).names,Object.keys(scenarios));
    assert.deepEqual(parseTimeTravelOptions(['--scenario','quick-expiration']).themes,['light','dark']);
    assert.equal(parseTimeTravelOptions(['--list-scenarios']).list,true);
});

test('scenario CLI rejects unknown choices and keeps screenshots outside the repository', () => {
    for(const args of [['--scenario','missing'],['--theme','dark'],['--scenario','quick-normal','--theme','system'],['--scenario','quick-normal','--language','fr'],['--scenario','quick-normal','--viewport','bad'],['--scenario','quick-normal','--advance','-1s'],['--scenario','quick-normal','--output',resolve('.')],['--scenario','quick-normal','--output',resolve('src/assets')]])assert.throws(()=>parseTimeTravelOptions(args));
    assert.equal(parseTimeTravelOptions(['--scenario','quick-normal','--output',tmpdir()]).output,resolve(tmpdir()));
});
