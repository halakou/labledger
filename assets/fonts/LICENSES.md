# Vendored fonts

These files are the latin subsets the desk used to download at build time.
They are committed so a publish never calls fonts.googleapis.com or fonts.gstatic.com.

- Fraunces (SIL Open Font License 1.1) — `fraunces-600.woff2`
- Source Sans 3 (SIL Open Font License 1.1) — `source-sans-3-400.woff2` and `source-sans-3-600.woff2`

Google Fonts currently serves the same latin variable file for Source Sans 3
weights 400 and 600. Both names are that file, matching the `@font-face` rules.

Upstream: https://github.com/google/fonts
License: https://openfontlicense.org
