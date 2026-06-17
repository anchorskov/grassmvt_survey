<!-- guides/survey/attach_pdf_sources.md -->
# Attaching a PDF Sources Document to a Survey

One method is used across this project for attaching a PDF sources or explanation
document to a survey. Follow all steps in order.

---

## When to use this

Attach a PDF when a survey topic benefits from a "Want to know more?" or
"Sources / explanation" document — typically when questions reference specific
legislation, data, or policy claims that a user might want to verify.

---

## The method

### 1. Prepare the PDF

Name the file using the survey slug and a descriptive suffix:

```
<survey-slug>_sources.pdf
```

Examples:
- `wy-voter-access` → `wyoming_voter_access_sources_explanation.pdf`
- `wy-primary-election-participation` → `wy_primary_election_participation_sources.pdf`

Use underscores in the filename, not hyphens, to match the existing convention.

### 2. Place the file

Put the PDF in:

```
public/assets/<filename>.pdf
```

This makes it publicly reachable at `/assets/<filename>.pdf` with no special
routing required. Astro copies everything under `public/` into `dist/` at build
time.

### 3. Add a source comment in the JSONC file

At the top of the survey JSONC file, add a `// source:` comment referencing the
PDF filename so the origin is clear at a glance:

```jsonc
// surveys/surveys_<slug>_v1.jsonc
// slug: <slug>
// source: <filename>.pdf
```

### 4. Link the PDF in the survey intro panel

In the survey's first `"type": "html"` element (the overview/intro block on the
`overview` page), add a button link:

```html
<a class="button button--small button--secondary"
   href="/assets/<filename>.pdf"
   target="_blank"
   rel="noopener">Want to know more?</a>
```

Place it inside the Purpose paragraph or immediately after it, before the
"How responses will be used" section.

Full example (from `surveys_wy_voter_access_v1.jsonc`, line 31):

```html
<h3>Purpose</h3>
<p>Help measure where Wyoming voters stand on voter access, registration,
and election-day participation.</p>
<p><a class="button button--small button--secondary"
      href="/assets/wyoming_voter_access_sources_explanation.pdf"
      target="_blank"
      rel="noopener">Want to know more?</a></p>
<h3>How responses will be used</h3>
...
```

### 5. Re-seed the survey

After editing the JSONC, re-run the seed script so D1 picks up the updated HTML:

```bash
node scripts/seed-surveys-from-jsonc.mjs \
  --db=local \
  --slug=<source-key> \
  --version=<n> \
  --publish=true \
  --changelog="Add sources PDF link"
```

Ask the user whether to seed production before finishing.

---

## Email integration (skovgard2026 pattern)

When a related email campaign needs to reference source material, **do not link
the PDF directly in the email body** — many email clients and spam filters flag
direct PDF links.

Instead, follow the skovgard2026 pattern used in
`src/pages/share/wyoming-voters-choose/sources.astro`:

1. Store the PDF in a publicly served directory (e.g., `/files/` or `/assets/`).
2. Create a companion sources web page (e.g., `/surveys/<slug>/sources/`) that
   shows inline citations and a "Download source packet (PDF)" link with a
   download icon.
3. In the email, link to the companion web page, not the PDF directly.

```html
<!-- In email -->
<a href="https://example.org/surveys/<slug>/sources/">
  Read the full message with sources
</a>

<!-- On the sources page -->
<a href="/assets/<filename>.pdf" target="_blank" rel="noopener">
  Download source packet (PDF)
</a>
```

This pattern keeps email deliverability clean and gives the sources page its own
shareable URL.

---

## Current surveys with PDF sources

| Survey slug              | PDF filename                                                | Status             |
|--------------------------|-------------------------------------------------------------|--------------------|
| wy-voter-access          | wyoming_voter_access_sources_explanation.pdf                | Linked in survey   |
| wy-roadless-areas        | wy_roadless_areas_sources_background.pdf                    | Linked in survey (v2) |
| wy-roadless-areas        | wy_roadless_areas_purpose_privacy_method.pdf                | Linked in survey (v2) |
| abortion-v2              | Abortion Survey Draft revision (1) 2-1-2026.pdf             | Comment only — PDF in docs/survey/, no public link |
| wy-health-care-constitutional-process | wy_health_care_constitutional_process_sources.pdf | Linked in survey (v1) |

The abortion survey PDF is not publicly served. If a live link is needed, move or
copy the file to `public/assets/` and add the button link to the survey JSONC
following the steps above.

---

## Checklist

- [ ] PDF named `<survey-slug>_sources.pdf` with underscores
- [ ] PDF placed in `public/assets/`
- [ ] `// source:` comment added at top of JSONC file
- [ ] Button link added in survey intro HTML
- [ ] Survey re-seeded locally
- [ ] User asked about production seed
