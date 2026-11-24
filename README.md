# site-generator-speed (from-scratch rewrite)

Static-site generator written from the kit's RULES.txt and the vendor
README.md specification only. No vendor implementation code was read or
copied. Pure JS, no dependencies.

- `solve.js` — the generator (`run(input)`), Markdown subset + template
  engine, written from scratch.
- `main.ts` — driver: reads `/input/cases.json`, writes `/output/answers.json`.
  Sets `--no-incremental-marking` (allowed by the rules).
