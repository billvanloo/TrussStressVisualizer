# Truss Stress Visualizer — Improvement Plan

Response to the August 12, 2026 evaluation report. This plan turns each issue
raised into a concrete, code-level implementation approach, sequenced by the
report's own priority tiers (Fix first / Fix next / Later).

**Key decision carried into this plan:** buckling is addressed as a **warning
only**, not as a change to the physics. The solver keeps its ideal
pin-jointed, length-independent model; the tool gains a clearly-advisory
overlay and readout line that flag long compression members as buckling
risks. This matches the report's fallback recommendation ("mark long
compression members on the drawing and add a line to the readout") and leaves
a real length-dependent compression limit as a possible future Phase.

---

## 1. Architecture & constraints that shape every task

These are fixed facts about the codebase that every change below must respect.

- **One self-contained file.** `index.html` must stay a single offline file
  (Chromebook requirement). No bundler, no external dependencies, no network.
  Everything is inline CSS/JS.
- **The solver is duplicated.** The pure solver lives canonically in
  `dev/solver.js` and is copied inline into `index.html` between the markers
  `function tDist(a,b)` … `/* PROJECT CONSTANTS`. `dev/verify-html.js`
  extracts the inline copy and checks parity. **Rule: any pure/testable logic
  goes in `dev/solver.js` first, gets a unit test, then is mirrored inline.**
  UI/DOM/canvas code lives only in `index.html`.
- **Testing surface.** `node dev/test.js` (32 unit tests) and
  `node dev/verify-html.js` (parity + 8-joint Pratt end-to-end) must stay
  green. New pure helpers (buckling-risk detection, member naming, state
  serialization) should be added there with tests. UI, interaction, keyboard,
  screen-reader, and contrast work needs a **manual QA checklist** (Section 6)
  because there is no DOM test harness today.
- **State lives in one object `S`** (`index.html:400`), mutated in place, with
  `resolve()` (`index.html:443`) as the single re-solve-and-redraw entry point.
  Several features below (undo, autosave, save/load) need one shared
  **serialize/deserialize** pair; building that first avoids three divergent
  copies of "what is the document."

### 1a. Two small foundation refactors to do first

Both are prerequisites for multiple later tasks, so they land before feature work.

1. **`serializeState()` / `applyState(obj)`** — a single source of truth for
   the persistable document (`nodes`, `members`, per-member limits, `budget`,
   `loadMode`, `applied`, `movingLoad`, `movingIdx`, `twoTruss`, `studentName`).
   Save, Load, Autosave, and Undo all route through this. Pure, unit-testable;
   lives in `dev/solver.js` + mirrored inline. **This alone fixes the
   "save omits applied load" round-trip bug** (the loader at
   `index.html:928–931` currently drops `applied`/`loadMode`/`movingLoad`).
2. **`labelJoints()` / `memberLabel(mb)`** — stable, human-readable names
   (Section 3.6). Used by the readout, the report, the FBD, and the
   screen-reader summary, so it is built once and reused.

---

## 2. Phase 1 — Fix first (affects learning or shuts students out)

### 2.1 Buckling warning (headline item) — WARNING ONLY, no physics change

**Problem (report):** every member gets the same limit in tension and
compression and length is ignored, so predicted failure loads run optimistic
and the tool can name the wrong first-to-fail member — most often missing the
long compression top chord.

**Chosen approach:** leave `solveTruss` and `failureLoad` untouched. Add a
derived, clearly-advisory buckling-risk layer.

- **New pure helper** `bucklingRiskMembers(nodes, members, forces, opts)` in
  `dev/solver.js`:
  - A member is flagged when it is in **compression** (`forces[id] < 0`) **and**
    its length `≥ BUCKLE_WARN_LEN`.
  - `BUCKLE_WARN_LEN` is a named constant (proposed default **2.0 in** — near
    the panel length where slender balsa/PLA members start to bow; see
    Decision D1). Kept as a constant so a teacher/dev can tune it in one place.
  - Also compute the **single longest compression member** and tag it as the
    highest-risk one, since that is where balsa bridges usually give way.
  - Returns `{ risky: Set<id>, worst: id|null }`. Pure and unit-tested; does
    **not** feed back into `forces`, `maxC`, or the predicted failure load.
- **Drawing** (`draw()`, `index.html:540–578`): risky compression members get
  an amber hazard overlay (e.g. a dashed/striped stroke in `--brass` or a
  distinct `--warn` token) plus a small "⚠" glyph at the midpoint. The worst
  one gets a slightly stronger treatment. This is visually distinct from both
  the red compression color and the existing red dashed "predicted first
  failure" highlight, so the three signals don't collide.
- **Readout** (`updateDRO()`, `index.html:457`): whenever any compression
  member exists, append a persistent caveat line:
  *"Estimate ignores buckling — long compression members (marked ⚠) will fail
  sooner than shown."* When at least one member is flagged, name it/them:
  *"Watch member T1–T2 (longest compression member) for buckling."*
- **Predicted-failure value** keeps its current meaning but gains a footnote
  marker (e.g. an asterisk) tied to the same caveat, so the optimistic number
  is never shown unqualified.
- **Report + PNG export**: carry the same caveat sentence and mark risky
  members in the member table (the report already warns about buckling in
  prose at `index.html:895` — upgrade it to name the specific flagged members).
- **Help panel** (`index.html:277`): add one line so students, not just
  teachers/dev-notes, learn that long red members are the buckling risk.

**Testing:** existing 32 + 14 stay green (physics unchanged). Add unit tests
for `bucklingRiskMembers`: a long compression top chord is flagged; a short
compression member below threshold is not; tension members are never flagged;
`worst` picks the longest compression member.

**Risk:** low — purely additive display. Main design care is visual clarity
(three overlapping "attention" signals on one member).

### 2.2 Undo (and redo)

**Problem (report):** no undo at all; deleting a joint silently removes every
attached member with no recovery — the most punishing action in the tool.

**Approach:** snapshot-based history using `serializeState()` (1a).

- Maintain `undoStack` / `redoStack` of serialized snapshots (cap ~50 to bound
  memory). Push the *pre-mutation* snapshot before each mutating action:
  joint add/move/delete, member add/delete, Clear all, material/budget/limit
  changes, and Load.
- Wire to a toolbar **Undo/Redo** button pair and to **Ctrl/Cmd+Z** /
  **Ctrl/Cmd+Shift+Z** (and `Ctrl+Y`). Redo stack clears on any new mutation.
- Move-joint drags should coalesce into one undo entry per drag (snapshot on
  `pointerdown`, not on every `pointermove`).
- Announce via the existing toast + live region ("Undo: joint removed").

**Testing:** manual QA (add/delete/undo/redo round-trips; drag coalescing;
Clear-all undo restores every member). The serialize/apply pair is unit-tested
in `dev/solver.js`.

**Risk:** medium — must catch *every* mutation site. Centralizing mutations
through a small `mutate(fn, label)` wrapper reduces the chance of a missed site.

### 2.3 Keyboard access + screen-reader support

**Problem (report):** the drawing area has no keyboard entry point and no key
handling; both canvases are unnamed and invisible to screen readers.

This is the largest task; split into two shippable parts.

**Part A — keyboard operation of the board:**
- Make `#board` focusable (`tabindex="0"`) with a visible focus ring and an
  on-canvas **cursor** (a highlighted grid cell).
- `keydown` handling on the board:
  - **Arrow keys** move the cursor by one grid step (`GRID`), clamped to
    `WORLD`.
  - **Enter/Space** performs the armed tool's action at the cursor (place
    joint; pick/connect for member; select for inspect; delete).
  - **Delete/Backspace** removes the joint/member at the cursor.
  - **Escape** cancels an in-progress member (`S.memberFirst`) or a drag.
  - **1–5** (optional) arm the five tools from the keyboard.
- Refactor the pointer handlers so the tool actions are shared functions
  called by both pointer and keyboard paths (avoid duplicating logic).

**Part B — screen-reader text:**
- Give `#board` a descriptive `aria-label` and pair it with an off-screen,
  `aria-live="polite"` **running summary** updated in `resolve()`: joint and
  member counts, determinacy status, max tension/compression, predicted
  failure with the buckling caveat, and the cursor/selected joint. Uses
  `labelJoints()` so it reads "member T1–T2", not coordinates.
- Give `#fbdCanvas` an `aria-label`; the FBD already renders a full text
  breakdown in `#fbdInfo` (`index.html:665–686`) — associate it and ensure it
  updates the live region when a joint is inspected.
- The printable report already provides a full text table; keep it as the
  authoritative text alternative and link to it from the summary.

**Testing:** manual keyboard-only walkthrough (build a truss, inspect, delete,
undo — mouse unplugged) and a screen-reader pass (VoiceOver/NVDA) confirming
status changes are announced. This is the primary acceptance gate.

**Risk:** medium–high, mostly in interaction design (a discoverable,
non-annoying live-region cadence). Ship Part A and Part B independently.

### 2.4 Autosave in the browser

**Problem (report):** nothing survives a refresh or a dead battery.

**Approach:**
- Debounced write of `serializeState()` to `localStorage` (single key,
  e.g. `tsv:autosave:v1`) at the end of `resolve()`.
- On boot, if a saved document exists, restore it and show a non-modal notice
  with a **"Start fresh"** action (so a student isn't trapped in an old
  design). Respect a version field for forward compatibility.
- Purely local; reaffirm the privacy promise (README already says nothing is
  uploaded). Handle `localStorage` being unavailable/full gracefully (wrap in
  try/catch, degrade silently).

**Testing:** manual (build → refresh → design restored; Start fresh clears;
private-mode/quota failure doesn't break the app). Serialize/apply covered by
unit tests.

**Risk:** low, given the shared serializer.

---

## 3. Phase 2 — Fix next (clear wins for classroom use)

### 3.1 Per-member materials / cross-sections

**Problem (report):** one limit applies to the whole truss; you can't give the
deck heavier stock than the diagonals.

**Approach (infrastructure already exists):** `failureLoad` takes a per-member
`limitFn` (`index.html:371`) — it's currently called with `()=>S.limit`.

- Add an optional `limit` (and later `section`) field per member. `S.limit`
  stays as the **default for newly created members**; existing behavior is
  unchanged when nobody overrides.
- Change the failure call to `mb => mb.limit ?? S.limit` and the drawing
  utilization (`index.html:547`) to use the per-member limit.
- UI: with the Inspect (or a new "Assign material") interaction, let the user
  set a selected member's material/limit from the existing preset dropdown.
  Show the per-member limit in the report's member table and the FBD info.
- Include per-member limits in `serializeState()` (so save/autosave/undo carry
  them) with back-compat for old files that only have a global limit.

**Testing:** unit test `failureLoad` with a mixed-limit `limitFn` (heavier deck
→ different critical member). Manual UI assignment check.

**Risk:** low–medium (mostly UI for selecting a member and picking material).

### 3.2 Readable member names

**Problem (report):** failure messages read like "member (0.0,0.0)–(1.5,1.0)".

**Approach:** the `labelJoints()`/`memberLabel()` helper from 1a.
- Assign stable joint labels: supports as **Pin/Roller** (or L/R), other joints
  **J1, J2, …** in a deterministic order (creation order, or sorted
  left-to-right then bottom-to-top for stability across reloads — see D2).
- `memberLabel(mb)` → e.g. **"J1–J2"**. Optional nicety: a geometry-based role
  hint (bottom chord / top chord / diagonal / vertical) derived from endpoint
  `y` values, shown as a secondary label.
- Replace `memberName()` (`index.html:488`) usages in the DRO message, report,
  and FBD with the new labels. Keep coordinates available in the report table
  as a secondary column so the mapping is never lost.

**Testing:** unit-test labeling determinism (same truss → same labels; adding a
joint doesn't renumber existing ones unexpectedly). Manual readout check.

**Risk:** low. Main decision is the numbering scheme (D2).

### 3.3 Contrast + force-label legibility

**Problem (report):** zero-force gray ≈2.9:1 and load arrows (brass) ≈2.95:1,
both under the 3:1 graphics minimum; force labels are 10px, rotated, and
collide on busy trusses.

**Approach:**
- Darken the zero-force gray (`#8B929B`, used at `index.html:544,550,653`) and
  the brass load arrow/`--brass` (`index.html:14,591`) until each clears
  **3:1** against `--paper` `#F6F5F0`. Illustrative starting points to verify
  with a contrast check: gray → ~`#6C727A`, brass → ~`#8A6A1E`. Adjust to hit
  ≥3:1 exactly; keep tension/compression hues distinguishable.
- Force labels (`index.html:555–566`): bump to ~11px, draw **horizontal**
  (drop the per-member rotation) with a small semi-opaque paper-colored pill
  behind each so they stay readable over members and grid. Optionally hide
  labels below a zoom/among very short members to reduce collisions.

**Testing:** compute and record contrast ratios for the new tokens; visual
check on a dense truss. (A tiny contrast-ratio assertion can be added as a
Node check if we want it enforced.)

**Risk:** low.

### 3.4 Explain the two load cases on screen

**Problem (report):** Tester splits load across two truss planes; Moving puts
it all on one; numbers aren't comparable and nothing says so.

**Approach:** add a short, always-visible note in each load-case control block
(`#vsmtCtl` / `#movingCtl`, `index.html:187–196`):
- Tester: "Each of two truss planes carries half the tester load — halve to
  compare with Moving mode" (reflecting the `twoTruss` toggle state).
- Moving: "Whole load on this single plane."
- Optionally surface a one-line "planes: 2 (÷2)" vs "planes: 1" indicator near
  the DRO so the assumption travels with the numbers.

**Testing:** manual copy/clarity review.

**Risk:** trivial.

### 3.5 Filenames carry the student name; save the full load state

**Problem (report):** every download is `truss-design.json` / a date-named
image even though the student typed a name; the save round-trip loses the
applied load.

**Approach:**
- Build a `safeFilename()` from the Name box: e.g.
  `truss-<name>-<date>.json` / `.png` (slugified, falls back to `truss-<date>`
  when empty). Apply to both `btnSave` (`index.html:915`) and `btnPng`
  (`index.html:864`).
- The applied-load loss is fixed by routing Save/Load through
  `serializeState()`/`applyState()` (1a), which restores `applied`,
  `loadMode`, `movingLoad`, `movingIdx` that the current loader drops
  (`index.html:928–931`).

**Testing:** manual round-trip (name → save → filename correct; load restores
applied load and mode).

**Risk:** trivial.

### 3.6 Enlarge the joint grab area relative to grid spacing

**Problem (report):** grab radius ~16px (32px across) while grid points sit
~30px apart, so touch users grab the neighbor.

**Approach:** in `hitNode()` (`index.html:698`) the fixed `d<16` (world→px via
`*PX`) exceeds half the grid spacing at the default zoom (`GRID*PX/2 ≈ 15px`).
Cap the grab radius to just under half the current grid spacing, e.g.
`radius = Math.min(16, 0.45 * GRID * PX)`, so the catch zone can never reach a
neighboring grid point regardless of zoom. Consider a slightly larger visual
node hit-highlight so targets still feel big without cross-catching.

**Testing:** manual touch/trackpad check at a couple of window sizes (zoom
changes `PX`, so verify the relative cap holds).

**Risk:** low.

---

## 4. Phase 3 — Later (worth considering)

### 4.1 Spread the tester load across the 2″ plate

**Problem (report):** the real plate is 2″ wide and would load several deck
joints; the tool puts it all on the nearest single joint (off-center with a
warning if none is central).

**Approach:** `currentLoads()` (`index.html:425`) already can emit multiple
loads and the solver handles them. In Tester mode, distribute the load across
deck joints within ±1″ of center (weighted by proximity / tributary width);
apply the same multi-point pattern to the unit-load failure solve so the
prediction stays consistent. **This changes reported numbers**, so gate it
behind a toggle ("point load ↔ 2″ plate") and default carefully, with a note,
since it breaks comparability with prior results.

**Risk:** medium (changes outputs; needs a symmetry/sanity test in
`dev/test.js`).

### 4.2 Record the actual tested failure load (calibration)

**Problem (report):** no place to capture the real break-test result next to
the prediction; the material presets stay placeholders forever.

**Approach:** add an "Actual tested failure (N)" field stored with the design
(via `serializeState()`) and shown beside the prediction in the report. As a
stretch, accumulate a local per-material log in `localStorage` to help a class
build real calibration data over time (offline, private).

**Risk:** low–medium; keep modest to preserve the single-file/offline nature.

---

## 5. Suggested sequencing

1. **Foundation (1a):** `serializeState`/`applyState`, `labelJoints`/
   `memberLabel`. Unblocks undo, autosave, save/load fix, readable names,
   screen-reader text.
2. **Buckling warning (2.1)** — headline, isolated, low risk, high value.
3. **Quick wins:** contrast + labels (3.3), grab area (3.6), load-case
   explanation (3.4), filename + save-load fix (3.5).
4. **Per-member materials (3.1)** and **readable names (3.2)** (both lean on
   the foundation).
5. **Undo/redo (2.2)** then **autosave (2.4)** (both on the serializer).
6. **Keyboard + screen reader (2.3)** — largest; ship Part A then Part B.
7. **Phone layout** (report's usability item): add a sub-640px breakpoint that
   stacks panels, turns the palette into a collapsible drawer, and lets the
   page scroll (today `body{overflow:hidden}` + the 900px-only breakpoint
   breaks small screens). CSS-heavy; scheduled after core features.
8. **Phase 3:** plate spread (4.1), calibration record (4.2).

Each numbered item is independently shippable and independently revertable on
this branch.

## 6. Testing & QA strategy

- **Automated (must stay green):** `node dev/test.js`, `node dev/verify-html.js`.
  Physics is unchanged, so all 46 checks should keep passing throughout. Add
  new unit tests to `dev/solver.js`/`dev/test.js` for: `bucklingRiskMembers`,
  `serializeState`/`applyState` round-trip, per-member `limitFn` in
  `failureLoad`, and `labelJoints`/`memberLabel` determinism. Mirror any new
  pure logic inline and confirm `verify-html.js` parity.
- **Manual QA checklist** (no DOM harness today): undo/redo across every
  mutation; autosave restore + Start fresh + quota failure; keyboard-only build
  and edit; screen-reader announcements; contrast ratios recorded ≥3:1; touch
  grab accuracy; save/load round-trip preserves applied load and per-member
  materials; phone layout scroll/stack.

## 7. Decisions to confirm before implementation

- **D1 — Buckling threshold.** Default `BUCKLE_WARN_LEN = 2.0 in` plus
  always-flag-the-longest-compression-member. Confirm the number, or prefer a
  purely relative rule (e.g. flag the longest N compression members) with no
  absolute threshold.
- **D2 — Joint numbering scheme.** `Pin/Roller` + `J1, J2 …` in
  left-to-right/bottom-to-top order (stable across reloads) vs. creation order.
  And whether to add geometry-based role hints (top chord / diagonal / …).
- **D3 — Per-member material UI.** Reuse the Inspect tool to also assign
  materials, or add a dedicated "Assign material" tool button.
- **D4 — Plate spread (4.1) default.** Ship as an opt-in toggle (recommended,
  preserves comparability) vs. making the 2″ plate the default load model.
- **D5 — Scope of this pass.** Land Phase 1 (+ quick wins) first for review,
  or implement Phases 1–2 together before a review checkpoint.
