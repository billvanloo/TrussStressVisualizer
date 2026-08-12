// __PURE_BEGIN__
// Truss Stress Visualizer — pure solver core (no DOM).
// Method of joints, statically determinate planar trusses.
// Unknowns: m member axial forces (tension positive) + 3 reactions
// (pin: Rx, Ry at pinNode; roller: Ry at rollerNode).
// Equations: 2 per joint (sum Fx = 0, sum Fy = 0).

function tDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// state: { nodes:[{id,x,y}], members:[{id,a,b}], pinNode, rollerNode, loads:[{node,fx,fy}] }
// Returns { status:'ok'|'mechanism'|'indeterminate'|'unstable'|'empty', message,
//           forces:{memberId:axialForce}, reactions:{pin:{x,y}, roller:{y}},
//           maxT, maxC, totalLength, residual }
function solveTruss(state) {
  const nodes = state.nodes, members = state.members;
  const j = nodes.length, m = members.length;
  const res = { status: 'ok', message: '', forces: {}, reactions: null, maxT: 0, maxC: 0, totalLength: 0, residual: 0 };
  if (j < 2 || m < 1) { res.status = 'empty'; res.message = 'Add joints and members to form a truss.'; return res; }

  const nodeById = {}; nodes.forEach(n => nodeById[n.id] = n);
  if (!nodeById[state.pinNode] || !nodeById[state.rollerNode]) {
    res.status = 'unstable'; res.message = 'Supports are missing.'; return res;
  }
  for (const mb of members) {
    if (!nodeById[mb.a] || !nodeById[mb.b]) { res.status = 'unstable'; res.message = 'A member references a missing joint.'; return res; }
    res.totalLength += tDist(nodeById[mb.a], nodeById[mb.b]);
  }

  // Determinacy count: 2j vs m + 3
  if (2 * j > m + 3) {
    res.status = 'mechanism';
    const need = 2 * j - 3 - m;
    res.message = 'This truss is a mechanism — it will collapse. It needs ' + need + ' more member' + (need > 1 ? 's' : '') + ' (or fewer joints) to be stable. Rule: 2 × joints = members + 3.';
    return res;
  }
  if (2 * j < m + 3) {
    res.status = 'indeterminate';
    const extra = m + 3 - 2 * j;
    res.message = 'This truss is statically indeterminate — it has ' + extra + ' more member' + (extra > 1 ? 's' : '') + ' than the method of joints can solve. Remove redundant members. Rule: 2 × joints = members + 3.';
    return res;
  }

  // Build linear system A x = b, x = [f_0..f_{m-1}, Rpx, Rpy, Rry]
  const N = m + 3;
  const A = Array.from({ length: N }, () => new Float64Array(N));
  const b = new Float64Array(N);
  const rowOf = {}; nodes.forEach((n, i) => rowOf[n.id] = 2 * i);

  members.forEach((mb, k) => {
    const na = nodeById[mb.a], nb = nodeById[mb.b];
    const L = tDist(na, nb) || 1;
    const ux = (nb.x - na.x) / L, uy = (nb.y - na.y) / L;
    // Tension pulls joint a toward b, joint b toward a
    A[rowOf[na.id]][k] += ux;     A[rowOf[na.id] + 1][k] += uy;
    A[rowOf[nb.id]][k] += -ux;    A[rowOf[nb.id] + 1][k] += -uy;
  });
  // Reactions
  A[rowOf[state.pinNode]][m] = 1;          // Rpx
  A[rowOf[state.pinNode] + 1][m + 1] = 1;  // Rpy
  A[rowOf[state.rollerNode] + 1][m + 2] = 1; // Rry (vertical roller)
  // External loads -> RHS (sum F + ext = 0  =>  A x = -ext)
  (state.loads || []).forEach(ld => {
    if (!nodeById[ld.node]) return;
    b[rowOf[ld.node]] -= (ld.fx || 0);
    b[rowOf[ld.node] + 1] -= (ld.fy || 0);
  });

  // Gaussian elimination with partial pivoting
  const x = gaussSolve(A, b, N);
  if (!x) {
    res.status = 'unstable';
    res.message = 'This geometry is unstable even though the member count checks out — look for joints whose members are collinear (they can\u2019t resist a sideways push) or for a disconnected section.';
    return res;
  }

  members.forEach((mb, k) => {
    let f = x[k];
    if (Math.abs(f) < 1e-9) f = 0;
    res.forces[mb.id] = f;
    if (f > res.maxT) res.maxT = f;
    if (f < res.maxC) res.maxC = f;
  });
  res.reactions = { pin: { x: x[m], y: x[m + 1] }, roller: { y: x[m + 2] } };

  // Residual check (joint equilibrium)
  let worst = 0;
  for (let r = 0; r < N; r++) {
    let s = 0;
    for (let c = 0; c < N; c++) s += A[r][c] * x[c];
    worst = Math.max(worst, Math.abs(s - b[r]));
  }
  res.residual = worst;
  return res;
}

function gaussSolve(Ain, bin, N) {
  const A = Ain.map(r => Float64Array.from(r));
  const b = Float64Array.from(bin);
  for (let col = 0; col < N; col++) {
    let p = col;
    for (let r = col + 1; r < N; r++) if (Math.abs(A[r][col]) > Math.abs(A[p][col])) p = r;
    if (Math.abs(A[p][col]) < 1e-9) return null; // singular
    if (p !== col) { const t = A[p]; A[p] = A[col]; A[col] = t; const tb = b[p]; b[p] = b[col]; b[col] = tb; }
    for (let r = col + 1; r < N; r++) {
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c = col; c < N; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < N; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

// Linear analysis: forces scale with load. Given per-member limit,
// failure load = limit / max(|force per 1 N of applied load|).
// solvedUnit = solveTruss with a 1 N total applied load pattern.
function failureLoad(solvedUnit, members, limitFn) {
  let minLoad = Infinity, critical = null;
  for (const mb of members) {
    const fPerN = Math.abs(solvedUnit.forces[mb.id] || 0);
    if (fPerN < 1e-12) continue;
    const lim = limitFn(mb);
    const cap = lim / fPerN;
    if (cap < minLoad) { minLoad = cap; critical = mb.id; }
  }
  return { load: minLoad, memberId: critical };
}

function tFmt(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const r = a >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return String(r);
}

// ---- Buckling advisory (pure) ----
// The physics model deliberately ignores buckling (see project notes). This
// helper only marks the long compression members most likely to bow, so the UI
// can draw a warning overlay and readout line. It does NOT touch solved forces,
// maxC, or the predicted failure load — it is a display flag only.
// Scale-free rule: among compression members, flag those whose length is within
// BUCKLE_WARN_RATIO of the longest compression member; that longest one is the
// primary risk ("worst"). Ratio is overridable via opts.ratio for tuning.
const BUCKLE_WARN_RATIO = 0.9;
function bucklingRiskMembers(nodes, members, forces, opts) {
  const ratio = (opts && opts.ratio != null) ? opts.ratio : BUCKLE_WARN_RATIO;
  const nodeById = {}; nodes.forEach(n => nodeById[n.id] = n);
  const comp = [];
  for (const mb of members) {
    const f = forces ? forces[mb.id] : undefined;
    if (f == null || f >= -1e-9) continue; // compression only (tension positive)
    const a = nodeById[mb.a], b = nodeById[mb.b];
    if (!a || !b) continue;
    comp.push({ id: mb.id, L: tDist(a, b) });
  }
  if (!comp.length) return { risky: new Set(), worst: null, worstLen: 0, count: 0, anyCompression: false };
  let worst = comp[0];
  for (const c of comp) if (c.L > worst.L) worst = c;
  const cut = worst.L * ratio;
  const risky = new Set();
  for (const c of comp) if (c.L >= cut - 1e-9) risky.add(c.id);
  return { risky, worst: worst.id, worstLen: worst.L, count: risky.size, anyCompression: true };
}

// ---- Readable labels (pure) ----
// Stable, readable joint labels J1..Jn ordered left-to-right then bottom-to-top.
// Display only; internal node ids are unchanged.
function labelJoints(nodes) {
  const sorted = nodes.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const labels = {};
  sorted.forEach((n, i) => labels[n.id] = 'J' + (i + 1));
  return labels;
}
function memberLabel(mb, labels) {
  return (labels[mb.a] || '?') + '–' + (labels[mb.b] || '?');
}

// ---- Persistence (pure) ----
// Serialize the persistable design document — the full load state
// (loadMode/applied/movingLoad/movingIdx/twoTruss), per-member limits, and the
// student name — so a saved or autosaved design round-trips exactly.
function serializeDesign(S) {
  return {
    version: 2,
    name: S.name || '',
    nodes: S.nodes.map(n => {
      const o = { id: n.id, x: n.x, y: n.y };
      if (n.support) o.support = n.support;
      return o;
    }),
    members: S.members.map(m => {
      const o = { id: m.id, a: m.a, b: m.b };
      if (m.limit != null) o.limit = m.limit;
      return o;
    }),
    limit: S.limit, budget: S.budget,
    loadMode: S.loadMode, applied: S.applied,
    movingLoad: S.movingLoad, movingIdx: S.movingIdx || 0,
    twoTruss: S.twoTruss
  };
}

// Validate + normalize a loaded document into a partial state object to merge
// into S. Returns null if it is not a usable truss. Restores the load fields
// the previous loader silently dropped (applied/loadMode/movingLoad/movingIdx).
function applyDesign(doc) {
  if (!doc || !Array.isArray(doc.nodes) || !Array.isArray(doc.members)) return null;
  if (!doc.nodes.some(n => n.support === 'pin') || !doc.nodes.some(n => n.support === 'roller')) return null;
  const out = { nodes: doc.nodes, members: doc.members };
  if (doc.name != null) out.name = String(doc.name);
  if (doc.limit != null) out.limit = doc.limit;
  if (doc.budget != null) out.budget = doc.budget;
  if (doc.loadMode === 'vsmt' || doc.loadMode === 'moving') out.loadMode = doc.loadMode;
  if (doc.applied != null) out.applied = doc.applied;
  if (doc.movingLoad != null) out.movingLoad = doc.movingLoad;
  if (doc.movingIdx != null) out.movingIdx = doc.movingIdx;
  if (doc.twoTruss != null) out.twoTruss = !!doc.twoTruss;
  let maxN = 0;
  [...doc.nodes, ...doc.members].forEach(o => { const mm = /\d+$/.exec(o.id); if (mm) maxN = Math.max(maxN, Number(mm[0])); });
  out.idc = maxN;
  return out;
}
// __PURE_END__

if (typeof module !== 'undefined') module.exports = {
  solveTruss, failureLoad, tDist, tFmt,
  bucklingRiskMembers, labelJoints, memberLabel, serializeDesign, applyDesign
};
