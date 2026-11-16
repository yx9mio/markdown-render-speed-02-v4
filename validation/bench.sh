#!/bin/sh
set -eu
runs=${RUNS:-3}
run=0
while [ "$run" -lt "$runs" ]; do
  node validation/bench.mjs
  run=$((run + 1))
done
