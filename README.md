# Truss Stress Visualizer

A method-of-joints truss analyzer — a tool for engineering education covering statics and structures, matched to a physical bridge project: a 6-inch span between a pin and a roller, tested by a Vernier Structures & Materials Tester pulling down on the deck with a 2″×2″ plate.

## Quick start

**Online:** enable GitHub Pages for this repo (Settings → Pages → Deploy from a branch → `main`, `/ (root)`) and share the URL.

**Offline:** download `index.html` and open it in any browser — one self-contained file, no dependencies, Chromebook-friendly.

## Features

- Build joints and members on a ½-inch grid; live method-of-joints solve on every change
- Blue = tension, red = compression; line thickness scales with utilization; ✕ marks over-limit members; the predicted first-to-fail member is dash-highlighted; long compression members likely to buckle are flagged (amber dashed, ⚠) with an advisory that the prediction ignores buckling
- Readable joint/member labels (J1, J2, …; members read "J1–J2") in the readout, free-body diagram, and printable report
- **Tester load case** mirrors the physical rig: center pull at the deck, a two-truss-planes toggle that splits the load, failure-load prediction, and a warning when the prediction exceeds the tester's 1000 N load cell
- Moving load mode steps a point load across the deck joints
- FBD inspector: tap any joint to see its force vectors and the ΣF = 0 check — the same diagram students draw by hand
- Teachable determinacy errors (mechanism / indeterminate / unstable geometry), each explained in plain language with the 2j = m + 3 rule
- Material presets (balsa, pine, birch, PLA), member-length budget, PNG export, printable design record, JSON save/load

## Teacher notes

- **Calibrate the material limits.** The per-member force limits shipped with the presets are placeholders. Break single members of each material on the tester and enter real values — the interface accepts custom limits and says so.
- The model is ideal pin-jointed 2D truss analysis: members carry only axial force. Real bridges fail through glue joints, buckling, and imperfections, so predicted failure loads will differ from tested ones. The pattern of which members work hardest is the transferable insight, and the help panel says this to students directly.
- **Buckling is flagged, not modeled.** The tool now marks the long compression members most likely to bow (amber dashed, ⚠ on the worst) and adds a readout/report line reminding students the predicted failure load is optimistic because buckling is ignored. The physics is unchanged — no length-dependent compression limit — so predicted failure loads still come only from the per-member force limit. A real length-dependent buckling model remains a possible future upgrade.

## Development

```
cd dev
node test.js         # 32 unit tests (hand-calculated trusses, determinacy, failure scaling)
node verify-html.js  # confirms the inline solver matches and validates an 8-joint Pratt truss end-to-end
```

Edit `dev/solver.js` first, run tests, then sync the inline copy in `index.html`.

This was built using Claude. Please don’t use this tool if you have qualms about using code created with AI tools.

## Privacy

Everything runs in your browser. Nothing you build is uploaded to a server.

## Credits & support

- Designed by **[Bill Van Loo](https://billvanloo.com)**
- Found a bug or want a feature? Email `billvanloo.tech+feedback@gmail.com` (the subject line is pre-filled from the in-app links).
- If this tool saved you time, you can [support the work on Ko-fi](https://ko-fi.com/billvanloo).

## License

[MIT](LICENSE) © 2026 Bill Van Loo
