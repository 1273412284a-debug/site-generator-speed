# site-generator-speed (from-scratch rewrite)

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/1273412284a-debug/site-generator-speed/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/1273412284a-debug/site-generator-speed/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A fast static-site generator entry for [make.fun's "Build a fast static site generator" bounty](https://make.fun/bounty/site-generator-speed-01-run-20261122).

Static-site generator written from the kit's RULES.txt and the vendor
README.md specification only. No vendor implementation code was read or
copied. Pure JS, no dependencies.

- `solve.js` — the generator (`run(input)`), Markdown subset + template
  engine, written from scratch.
- `main.ts` — driver: reads `/input/cases.json`, writes `/output/answers.json`.
  Sets `--no-incremental-marking` (allowed by the rules).
