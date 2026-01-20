# Grassmvt Survey Static Site

A no-build static site intended for deployment from `/public` to Cloudflare Pages.

## Quick start

```bash
npm i
npm run dev
```

## Project structure

- `public/` - static site files served directly by Cloudflare Pages
- Config lives in the repo root for formatting, linting, and deploy tooling

## Scripts

- `npm run format` - format HTML/CSS/JS/MD in `public/`
- `npm run lint` - run ESLint, Stylelint, and HTMLHint
- `npm run check` - run lint and Prettier check
- `npm run dev` - serve `public/` at `http://localhost:8788`
- `npm run deploy` - deploy `public/` to Cloudflare Pages via Wrangler

## Notes

- No framework or build step is required or expected.
- Keep all assets in `public/` and reference them with absolute paths like `/css/site.css`.
- See `AI_CONTRACT.md` for workflow rules.
