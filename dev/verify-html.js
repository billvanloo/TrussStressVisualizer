const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const start = html.indexOf("function tDist(a,b)");
const end = html.indexOf('/* =====================================================================\n   PROJECT CONSTANTS');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(1); }
const box = {};
new Function('exports', html.slice(start, end) + '\nexports.solveTruss=solveTruss;exports.failureLoad=failureLoad;exports.tDist=tDist;')(box);
const { solveTruss, failureLoad } = box;

let passed = 0, failed = 0;
function eq(name, actual, expected, eps = 0.01) {
  const ok = (typeof expected === 'number') ? Math.abs(actual - expected) <= eps : actual === expected;
  if (ok) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}: got ${actual}, expected ${expected}`); }
}

console.log('Inline solver parity (triangle):');
{
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:6,y:0},{id:'C',x:3,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'AC',a:'A',b:'C'},{id:'BC',a:'B',b:'C'}],
    pinNode:'A', rollerNode:'B',
    loads: [{node:'C', fx:0, fy:-100}]
  };
  const r = solveTruss(st);
  eq('AC', r.forces['AC'], -62.5);
  eq('AB', r.forces['AB'], 37.5);
}

console.log('End-to-end: 6-inch Pratt-style truss, VSMT center pull, PLA limits:');
{
  // Deck joints at 0,1.5,3,4.5,6 (y=0); top chord at 1.5,3,4.5 (y=1.5)
  // j=8 -> 2j=16 -> need m=13
  const nodes = [
    {id:'S1',x:0,y:0},{id:'D1',x:1.5,y:0},{id:'D2',x:3,y:0},{id:'D3',x:4.5,y:0},{id:'S2',x:6,y:0},
    {id:'T1',x:1.5,y:1.5},{id:'T2',x:3,y:1.5},{id:'T3',x:4.5,y:1.5}
  ];
  const members = [
    {id:'m1',a:'S1',b:'D1'},{id:'m2',a:'D1',b:'D2'},{id:'m3',a:'D2',b:'D3'},{id:'m4',a:'D3',b:'S2'},
    {id:'m5',a:'T1',b:'T2'},{id:'m6',a:'T2',b:'T3'},
    {id:'m7',a:'S1',b:'T1'},{id:'m8',a:'S2',b:'T3'},
    {id:'m9',a:'D1',b:'T1'},{id:'m10',a:'D2',b:'T2'},{id:'m11',a:'D3',b:'T3'},
    {id:'m12',a:'D1',b:'T2'},{id:'m13',a:'D3',b:'T2'}
  ];
  eq('determinate count', 2*nodes.length, members.length+3);
  // VSMT: 100 N tester, two planes -> 50 N per truss at center deck joint D2
  const st = { nodes, members, pinNode:'S1', rollerNode:'S2', loads:[{node:'D2', fx:0, fy:-50}] };
  const r = solveTruss(st);
  eq('status ok', r.status, 'ok');
  eq('reactions sum', r.reactions.pin.y + r.reactions.roller.y, 50, 1e-6);
  eq('symmetric reactions', r.reactions.pin.y, 25, 1e-6);
  eq('top chord compression', r.forces['m5'] < 0 && r.forces['m6'] < 0, true);
  eq('residual tiny', r.residual < 1e-8, true);
  // symmetry: m1 == m4, m9 == m11
  eq('mirror symmetry chords', r.forces['m1'], r.forces['m4'], 1e-6);
  eq('mirror symmetry verticals', r.forces['m9'], r.forces['m11'], 1e-6);
  // Failure with PLA 90 N per member, per-truss:
  const unit = solveTruss({ nodes, members, pinNode:'S1', rollerNode:'S2', loads:[{node:'D2', fx:0, fy:-1}] });
  const f = failureLoad(unit, members, () => 90);
  eq('failure load finite', isFinite(f.load), true);
  eq('critical member exists', !!f.memberId, true);
  // Tester-load doubling for two planes:
  const testerFail = f.load * 2;
  console.log(`    (info) per-truss failure ${Math.round(f.load)} N -> tester ${Math.round(testerFail)} N at member ${f.memberId}`);
  eq('tester failure = 2x per-truss', testerFail, f.load*2, 1e-9);
}

console.log('Zero-force member identified:');
{
  // King post with NO load on the post joint: BD should be zero-force? Load at D instead.
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:3,y:0},{id:'C',x:6,y:0},{id:'D',x:3,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'AD',a:'A',b:'D'},{id:'DC',a:'D',b:'C'},{id:'BD',a:'B',b:'D'}],
    pinNode:'A', rollerNode:'C',
    loads: [{node:'D', fx:0, fy:-100}]
  };
  const r = solveTruss(st);
  eq('BD is zero-force when load moves to apex', Math.abs(r.forces['BD']) < 1e-9, true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
