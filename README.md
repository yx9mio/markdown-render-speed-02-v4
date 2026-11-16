# Markdown renderer — recorded rebuild

This renderer was authored fresh during the recorded redo. The seven previous
implementation and validation files were deleted before their replacements
were written. The reference parser was used only for validation calls.

`main.ts` reads the JSON array from `MAKEFUN_INPUT_DIR/cases.json` (default
`/input`), renders each Markdown string, and writes the HTML array to
`MAKEFUN_OUTPUT_DIR/html.json` (default `/output`). It creates the output
directory when needed.

`parse.js` scans blocks and inline syntax, retaining block text until reference
definitions have been collected. `containers.js` extracts list and blockquote
contents, including lazy continuation metadata. `grammar.js` supplies shared
escaping, indentation, destinations, HTML block recognition, and table rules.
The runtime uses built-in Node modules and these original source files.

Run `node validation/check.mjs` for exact fixture comparisons and first
differences. Both this check and the file-based entrypoint pass **720/720**.

Run `sh validation/bench.sh` for three sequential CPU measurements. Each process
warms up with three workload passes and then measures 100 passes using
`process.cpuUsage()`. The reported per-pass value is total user plus system CPU
divided by repetitions. The script reports the median of the three values.
`RUNS`, `REPETITIONS`, and `PARSER` override those defaults. This raw CPU proxy
is used because official adjusted CPU is unavailable in the kit.

No submission command was run, and the recording process was left untouched.
