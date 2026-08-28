# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## PulseClip landing direction

- Use option 2 as the primary conversion and content structure.
- Bring in option 1's flowing blue/coral current motif and prominent F8 instant-replay visual.
- Bring in option 3's restrained hero spacing and subtly perspective-tilted product screenshot.
- Keep the primary action explicit: `Windows용 무료 다운로드`; GitHub is always secondary.
- Preserve PulseClip's existing near-black, coral, mint, blue, and violet product tokens.
- Keep all claims grounded in the shipped desktop app and repository documentation.
- Motion must honor `prefers-reduced-motion`, and core navigation/download actions must work without motion.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
