const { solveTruss, failureLoad, bucklingRiskMembers, labelJoints, memberLabel, serializeDesign, applyDesign } = require('./solver.js');

let passed = 0, failed = 0;
function eq(name, actual, expected, eps = 0.01) {
  const ok = (typeof expected === 'number') ? Math.abs(actual - expected) <= eps : actual === expected;
  if (ok) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}: got ${actual}, expected ${expected}`); }
}

console.log('T1: single triangle, apex load (hand-calc: AC=BC=-62.5 C, AB=+37.5 T)');
{
  // A(0,0) pin, B(6,0) roller, C(3,4). 100 N down at C. 3-4-5 geometry.
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:6,y:0},{id:'C',x:3,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'AC',a:'A',b:'C'},{id:'BC',a:'B',b:'C'}],
    pinNode:'A', rollerNode:'B',
    loads: [{node:'C', fx:0, fy:-100}]
  };
  const r = solveTruss(st);
  eq('status ok', r.status, 'ok');
  eq('AC compression', r.forces['AC'], -62.5);
  eq('BC compression', r.forces['BC'], -62.5);
  eq('AB tension', r.forces['AB'], 37.5);
  eq('pin Ry', r.reactions.pin.y, 50);
  eq('roller Ry', r.reactions.roller.y, 50);
  eq('pin Rx', r.reactions.pin.x, 0);
  eq('residual tiny', r.residual < 1e-9, true);
}

console.log('T2: king post truss, deck center load (BD = +100 T)');
{
  // A(0,0) pin, B(3,0), C(6,0) roller, D(3,4). Members AB,BC,AD,DC,BD. 100 N down at B.
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:3,y:0},{id:'C',x:6,y:0},{id:'D',x:3,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'AD',a:'A',b:'D'},{id:'DC',a:'D',b:'C'},{id:'BD',a:'B',b:'D'}],
    pinNode:'A', rollerNode:'C',
    loads: [{node:'B', fx:0, fy:-100}]
  };
  const r = solveTruss(st);
  eq('status ok', r.status, 'ok');
  eq('king post BD tension', r.forces['BD'], 100);
  eq('AD compression', r.forces['AD'], -62.5);
  eq('DC compression', r.forces['DC'], -62.5);
  eq('AB == BC (symmetry)', r.forces['AB'], r.forces['BC'], 1e-6);
  eq('AB tension value', r.forces['AB'], 37.5);
}

console.log('T3: mechanism detected (square, no diagonal)');
{
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:4,y:0},{id:'C',x:4,y:4},{id:'D',x:0,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'CD',a:'C',b:'D'},{id:'DA',a:'D',b:'A'}],
    pinNode:'A', rollerNode:'B',
    loads: [{node:'C', fx:0, fy:-50}]
  };
  const r = solveTruss(st);
  eq('mechanism status', r.status, 'mechanism');
  eq('message mentions collapse', /collapse/.test(r.message), true);
}

console.log('T4: indeterminate detected (square with BOTH diagonals)');
{
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:4,y:0},{id:'C',x:4,y:4},{id:'D',x:0,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'CD',a:'C',b:'D'},{id:'DA',a:'D',b:'A'},{id:'AC',a:'A',b:'C'},{id:'BD',a:'B',b:'D'}],
    pinNode:'A', rollerNode:'B',
    loads: [{node:'C', fx:0, fy:-50}]
  };
  const r = solveTruss(st);
  eq('indeterminate status', r.status, 'indeterminate');
  eq('message mentions redundant', /redundant/.test(r.message), true);
}

console.log('T5: count passes but geometry unstable (collinear joint)');
{
  // Three collinear joints in a line with a hanging load — passes 2j=m+3? j=3, need m=3: A-B, B-C, A-C (overlapping line) -> singular
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:3,y:0},{id:'C',x:6,y:0}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'AC',a:'A',b:'C'}],
    pinNode:'A', rollerNode:'C',
    loads: [{node:'B', fx:0, fy:-50}]
  };
  const r = solveTruss(st);
  eq('unstable status', r.status, 'unstable');
  eq('message mentions collinear', /collinear/.test(r.message), true);
}

console.log('T6: Warren truss (2 panel), symmetric loads, reaction sum');
{
  // A(0,0) pin, B(2,0), C(4,0) roller? Warren with apexes D(1,1.5), E(3,1.5)
  // j=5 -> 2j=10, need m=7: AB,BC,AD,DB,BE,EC,DE
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:2,y:0},{id:'C',x:4,y:0},{id:'D',x:1,y:1.5},{id:'E',x:3,y:1.5}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'AD',a:'A',b:'D'},{id:'DB',a:'D',b:'B'},{id:'BE',a:'B',b:'E'},{id:'EC',a:'E',b:'C'},{id:'DE',a:'D',b:'E'}],
    pinNode:'A', rollerNode:'C',
    loads: [{node:'B', fx:0, fy:-200}]
  };
  const r = solveTruss(st);
  eq('status ok', r.status, 'ok');
  eq('reactions balance applied load', r.reactions.pin.y + r.reactions.roller.y, 200, 1e-6);
  eq('symmetry AD == EC', r.forces['AD'], r.forces['EC'], 1e-6);
  eq('symmetry DB == BE', r.forces['DB'], r.forces['BE'], 1e-6);
  eq('top chord DE in compression', r.forces['DE'] < 0, true);
  eq('bottom chords in tension', r.forces['AB'] > 0 && r.forces['BC'] > 0, true);
  eq('residual tiny', r.residual < 1e-8, true);
}

console.log('T7: failure load scales linearly');
{
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:6,y:0},{id:'C',x:3,y:4}],
    members: [{id:'AB',a:'A',b:'B'},{id:'AC',a:'A',b:'C'},{id:'BC',a:'B',b:'C'}],
    pinNode:'A', rollerNode:'B',
    loads: [{node:'C', fx:0, fy:-1}]  // unit load
  };
  const unit = solveTruss(st);
  // limit 45 N per member. Critical members AC/BC at 0.625 N per N applied.
  const f = failureLoad(unit, st.members, () => 45);
  eq('failure load 45/0.625', f.load, 72);
  eq('critical member is a diagonal', f.memberId === 'AC' || f.memberId === 'BC', true);
}

console.log('T8: off-center load -> asymmetric reactions');
{
  // Load at quarter point: pin should carry more
  const st = {
    nodes: [{id:'A',x:0,y:0},{id:'B',x:1.5,y:0},{id:'C',x:6,y:0},{id:'D',x:1.5,y:2}],
    members: [{id:'AB',a:'A',b:'B'},{id:'BC',a:'B',b:'C'},{id:'AD',a:'A',b:'D'},{id:'DC',a:'D',b:'C'},{id:'BD',a:'B',b:'D'}],
    pinNode:'A', rollerNode:'C',
    loads: [{node:'B', fx:0, fy:-100}]
  };
  const r = solveTruss(st);
  eq('status ok', r.status, 'ok');
  eq('pin Ry = 75 (load at quarter span)', r.reactions.pin.y, 75);
  eq('roller Ry = 25', r.reactions.roller.y, 25);
}

console.log('T9: buckling advisory flags long compression members (display only)');
{
  const nodes = [{id:'A',x:0,y:0},{id:'B',x:6,y:0},{id:'C',x:3,y:0.5},{id:'D',x:3,y:2}];
  const members = [{id:'long',a:'A',b:'B'},{id:'short',a:'A',b:'C'},{id:'tens',a:'C',b:'D'}];
  const forces = { long:-50, short:-10, tens:+30 };
  const r = bucklingRiskMembers(nodes, members, forces);
  eq('worst is the longest compression member', r.worst, 'long');
  eq('long compression member flagged', r.risky.has('long'), true);
  eq('short compression member not flagged', r.risky.has('short'), false);
  eq('tension member never flagged', r.risky.has('tens'), false);
  eq('anyCompression true', r.anyCompression, true);
}

console.log('T10: no compression -> no buckling warning');
{
  const nodes = [{id:'A',x:0,y:0},{id:'B',x:6,y:0}];
  const r = bucklingRiskMembers(nodes, [{id:'AB',a:'A',b:'B'}], { AB:+40 });
  eq('anyCompression false', r.anyCompression, false);
  eq('no worst member', r.worst, null);
}

console.log('T11: readable joint + member labels (left-to-right)');
{
  const nodes = [{id:'S2',x:6,y:0},{id:'S1',x:0,y:0},{id:'T',x:3,y:1.5}];
  const L = labelJoints(nodes);
  eq('leftmost joint is J1', L['S1'], 'J1');
  eq('rightmost joint is J3', L['S2'], 'J3');
  eq('member label reads in id order', memberLabel({a:'S1',b:'T'}, L), 'J1–J2');
}

console.log('T12: serialize/apply round-trips the full load state');
{
  const S = {
    name:'Ada',
    nodes:[{id:'S1',x:0,y:0,support:'pin'},{id:'S2',x:6,y:0,support:'roller'},{id:'n1',x:3,y:0}],
    members:[{id:'m1',a:'S1',b:'n1',limit:150},{id:'m2',a:'n1',b:'S2'}],
    limit:90, budget:60, loadMode:'moving', applied:250, movingLoad:120, movingIdx:1, twoTruss:false
  };
  const back = applyDesign(serializeDesign(S));
  eq('applied load preserved', back.applied, 250);
  eq('loadMode preserved', back.loadMode, 'moving');
  eq('movingIdx preserved', back.movingIdx, 1);
  eq('twoTruss preserved', back.twoTruss, false);
  eq('name preserved', back.name, 'Ada');
  eq('per-member limit preserved', back.members[0].limit, 150);
  eq('idc from max id suffix', back.idc, 2);
  eq('rejects a truss with no supports', applyDesign({nodes:[{id:'x',x:0,y:0}],members:[]}), null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
