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
Final validation: 720/720 fixture cases and 1105/1105 differential cases
(720 practice inputs, 384 generated combinations, one generated long document).
Command: `node validation/check.mjs --differential`; seed: `872433204`.
The file-based entrypoint also produced 720/720 expected outputs, including
creation of a previously absent output directory.

Final measurements on the exact committed parser, without the profiler:

| Run | Total raw CPU, microseconds | Per-pass raw CPU, microseconds |
| --- | ---: | ---: |
| 1 | 43,339,604 | 433,396.04 |
| 2 | 43,118,227 | 431,182.27 |
| 3 | 43,050,822 | 430,508.22 |

The median is 431,182.27 microseconds per pass, below the 1,150,000 target
using the agreed raw-CPU proxy. This is not an official adjusted-CPU score.

| Change | Before median per pass | After median per pass | Decision |
| --- | ---: | ---: | --- |
| Hoist regexes and escaping callback; share indentation expansion | 702,383.25 | 608,354.99 | Keep |
| List-start and fence-close scanners | 608,354.99 | 610,196.90 | Revert scanner substitutions |
| Plain-word spans, exact ASCII dispatch, direct character escaping | 608,354.99 | 431,182.27 | Keep |

The small list/fence result received three additional paired comparisons,
using ten workload passes per sample and alternating order. Previous/candidate
per-pass values were 611,148.1/619,019.2, 606,706.1/611,579.3, and
612,888.4/613,684.4 microseconds. The changes offered no measured benefit.
Unused list-item metadata was removed and the entrypoint reuses its input
array; those independent memory cleanups remain.

A separate final CPU profile used ten passes, with no scoring measurement
running concurrently. Inline scanning and paragraph-render callbacks dominate;
list handling accounted for 7.4% of samples and garbage collection for 2.3%.
Profiling files were written outside the repository. The nine implementation,
validation, and documentation files together occupy less than 64 KiB.

The continuation began with four existing core files; this transcript does
not establish authorship of their initial contents. Continuation changes and
validation work are recorded here. Each core file received at least two
recorded edits in this continuation. No previous-v3 or vendor parser source
was read; the reference parser was called only by validation tools.
Kit fixtures alone exceed 1 MiB, so source size is reported separately from
the full checkout (approximately 7.4 MiB including kit data and Git metadata).
