# Truss Stress Visualizer

A method-of-joints truss analyzer — a tool for engineering education covering statics and structures, matched to a physical bridge project: a 6-inch span between a pin and a roller, tested by a Vernier Structures & Materials Tester pulling down on the deck with a 2″×2″ plate.

## Quick start

**Online:** enable GitHub Pages for this repo (Settings → Pages → Deploy from a branch → `main`, `/ (root)`) and share the URL.

**Offline:** download `index.html` and open it in any browser — one self-contained file, no dependencies, Chromebook-friendly.

## Features

- Build joints and members on a ½-inch grid; live method-of-joints solve on every change
- Blue = tension, red = compression; line thickness scales with utilization; ✕ marks over-limit members; the predicted first-to-fail member is dash-highlighted
- **Tester load case** mirrors the physical rig: center pull at the deck, a two-truss-planes toggle that splits the load, failure-load prediction, and a warning when the prediction exceeds the tester's 1000 N load cell
- Moving load mode steps a point load across the deck joints
- FBD inspector: tap any joint to see its force vectors and the ΣF = 0 check — the same diagram students draw by hand
- Teachable determinacy errors (mechanism / indeterminate / unstable geometry), each explained in plain language with the 2j = m + 3 rule
- Material presets (balsa, pine, birch, PLA), member-length budget, PNG export, printable design record, JSON save/load

## Teacher notes

- **Calibrate the material limits.** The per-member force limits shipped with the presets are placeholders. Break single members of each material on the tester and enter real values — the interface accepts custom limits and says so.
- The model is ideal pin-jointed 2D truss analysis: members carry only axial force. Real bridges fail through glue joints, buckling, and imperfections, so predicted failure loads will differ from tested ones. The pattern of which members work hardest is the transferable insight, and the help panel says this to students directly.
- Buckling (length-dependent compression limits) is the planned Phase 2 upgrade.

## Development

```
cd dev
node test.js         # 32 unit tests (hand-calculated trusses, determinacy, failure scaling)
node verify-html.js  # confirms the inline solver matches and validates an 8-joint Pratt truss end-to-end
```

Edit `dev/solver.js` first, run tests, then sync the inline copy in `index.html`.
