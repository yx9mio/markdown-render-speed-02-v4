# Markdown renderer

`main.ts` reads `cases.json` from `MAKEFUN_INPUT_DIR` (default `/input`) and
writes the HTML array to `MAKEFUN_OUTPUT_DIR/html.json` (default `/output`).
The parser scans blocks and inline syntax by index. `containers.js` extracts
list and blockquote contents; `grammar.js` contains shared rules and escaping.
HTML fragments are resolved after reference definitions have been collected.
The submission path uses no external parser or fixture data.

Run `node validation/check.mjs` for the 720 fixture comparisons.
Run `node validation/check.mjs --differential` to additionally compare generated
combinations against the kit reference. The generator seed is `0x34004634`.
Run `sh validation/bench.sh` for three sequential measurements, each containing
100 passes over the workload after three warmup passes. `REPETITIONS`, `RUNS`,
and `PARSER` can override these settings. CPU totals include user and system
CPU; per-pass CPU is the total divided by repetitions. Official adjusted CPU
is unavailable in this kit, so per-pass raw CPU is the local proxy.

The starter passed 720/720. Its three CPU totals were 50,310,671, 49,849,628,
and 50,112,454 microseconds; median per pass was 501,124.54 microseconds.
Final renderer measurements will be recorded after optimization.

The continuation began with four existing core files; this transcript does
not establish authorship of their initial contents. Continuation changes and
validation work are recorded here. Kit fixtures alone exceed 1 MiB, so source
size is reported separately from the full checkout.
