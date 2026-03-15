<!-- AI_CONTRACT.md -->
# AI Contract

These rules apply to all work in this repository.

## Workflow rules

- Always run `npm run check` before commit and before deploy.
- Never introduce a framework or build pipeline unless explicitly requested.
- Keep assets under `/public` and use absolute paths like `/css/site.css`.
- No inline CSS.
- Keep JavaScript optional and minimal.
- When generating or modifying files, always add an HTML comment at the top with the relative path and filename for HTML, and a block comment for CSS/JS.
- Keep URLs stable: `/`, `/surveys/`, `/verify/`, `/privacy/`.
- Create and run test scripts from `scripts/test/`.

## Survey Data Exposure Rules

- Keep full survey definition responses limited to the dedicated runtime endpoint:
  `/api/surveys/:slug` for rendering `/surveys/:slug`.
- Do not expose bulk prompt/options payloads in list/discovery endpoints.
- Keep D1 access server-side only; client fetches may receive metadata only.
- If `/data/surveys.json` or `/api/surveys/list` exists, restrict to non-sensitive metadata only: slug, title, status, scope, short description. No prompt/options.
- Keep PII separate from answers. Never return PII in public responses.
