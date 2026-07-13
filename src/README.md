# src

`src/` contains the public contract types, request validation, deterministic wizard state machine, and Pi extension entrypoint.

- `index.ts` — public request/result types.
- `validation.ts` — request boundary validation.
- `wizard.ts` — terminal-independent state transitions.
- `extension.ts` — `dask` tool registration and TUI adapter; the root `index.ts` exposes this entrypoint for Pi.
