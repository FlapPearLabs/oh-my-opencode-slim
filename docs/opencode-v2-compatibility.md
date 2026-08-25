# OpenCode v2 compatibility

> **Capability details:** see the [OpenCode v2 capability-gap report](opencode-v2-gap-report.md)
> for the Oracle-verified matrix, source citations, and migration dispositions.

## Current status

OpenCode v2 support is currently a **v1-to-v2 adapter**, not a native v2
implementation. Native v2 support has not shipped.

`src/v2/setup.ts` receives `default.setup(ctx)`, constructs a v1-shaped
`PluginInput` with a client shim, invokes the existing v1 factory, and
translates selected v1 hooks into v2 registrations. This preserves useful
behavior but does not establish v1 parity. Registration failures are isolated,
so the adapter can load with only part of its behavior registered.

Read the [detailed gap report](opencode-v2-gap-report.md) before relying on any
v2 feature beyond basic loading and smoke-tested behavior.

## Installing the current adapter on v2

The OpenCode beta executable is `opencode2`; its global configuration root is
still named `opencode`:

```json
// ~/.config/opencode/opencode.json
{
  "plugins": ["oh-my-opencode-slim@latest"]
}
```

For local development:

```json
{
  "plugins": ["/path/to/oh-my-opencode-slim/dist/server.js"]
}
```

Build both host bundles with:

```bash
bun install
bun run build
```

This produces `dist/index.js` for v1 and `dist/server.js` for the current v2
adapter. Run v2 from the project directory, or use `--standalone`; the
adapter obtains its directory from `process.cwd()`.

## Native migration status

The planned implementation is a separate native Promise plugin using
`define({ id, setup })` and the official v2 domains. It will not invoke the v1
factory, convert v2 values to v1 hook payloads, or silently continue after a
required registration failure.

The migration remains planned. Its roadmap is: inventory and approve behavior
changes, separate shared host-neutral logic from the v1 composition, implement
and smoke-test native v2 registrations while retaining v1, then remove the
adapter only after release-readiness review.
