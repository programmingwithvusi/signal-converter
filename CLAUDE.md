# Project Guidelines

## Quota Optimization Rules
- NEVER read files outside of the `src/` directory unless explicitly asked.
- Avoid printing full code files back in the chat if only small sections are changed. Use concise git diffs or specific line updates.
- Keep conversational explanations extremely short. Prioritize direct solutions over conversational filler.

## Tech Stack & Code Conventions
- Primary Codebase: TypeScript + React 19, built with Vite. Conversion uses Mediabunny in the browser; Firebase provides Authentication and Firestore (usage events and the per-account daily quota).
- Code Style: Functional components and hooks only, camelCase, strict typing (no `any`). Heavy libraries (Mediabunny, JSZip, Firestore) are loaded with dynamic `import()`.
- Layout: components in `src/components`, hooks in `src/hooks`, Firebase and helper modules in `src/lib` and `src/utils`, tests in `src/test`.
- Checks: `npm run lint` (oxlint), `npm test` (Vitest + Testing Library), `npm run build` (includes `tsc -b`). All three must pass before committing. After changing `firestore.rules`, also run `npm run test:rules` (Firestore emulator; the script picks an installed JDK 21+ itself). CI deploys the rules on push to `main`.
- Package manager: npm. CI runs `npm ci`, so keep `package-lock.json` in sync.
