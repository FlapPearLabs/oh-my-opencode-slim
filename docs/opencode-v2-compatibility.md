# OpenCode v2 compatibility and native migration

## Current status

OpenCode v2 compatibility is currently provided by a **v1-to-v2 adapter**. It
is not a native v2 implementation, and native v2 support has not shipped.

The current path is `src/v2/setup.ts`:

1. v2 calls the package's `default.setup(ctx)` entry point.
2. The adapter builds a v1-shaped `PluginInput`, including a client shim and
   `process.cwd()` as the project directory.
3. It invokes the existing `OhMyOpenCodeLite` v1 factory and receives v1
   `Hooks`.
4. It translates those hooks into v2 agent, tool, command, session-context,
   tool-lifecycle, and event registrations.
5. It returns cleanup functions for the v2 registrations and the v1 factory.

This preserves useful behavior while both hosts are supported, but it is a
best-effort compatibility layer. Registration failures are independently
isolated, so a plugin can load with only part of its behavior registered.

The beta checkout used for the migration target is OpenCode `v2` at
`d6deb62379c54dc60468b80c498bd6a5899797cf`.

## Installing the current adapter on v2

The existing package install remains. In the beta checkout, the executable is
`opencode2` but the global configuration root is still named `opencode`:

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["oh-my-opencode-slim@latest"]
}
```

For local development, use the v2 bundle directly:

```json
{
  "plugins": ["/path/to/oh-my-opencode-slim/dist/server.js"]
}
```

Build the two host bundles with:

```bash
bun install
bun run build
```

The build currently produces `dist/index.js` for v1 and `dist/server.js` for
the v2 adapter. Run OpenCode v2 from the project directory, or use
`--standalone`, because the adapter has no project-directory field and uses
`process.cwd()`.

## Adapter limitations

These are limitations of the transitional implementation, not proof that the
official v2 API lacks the capability:

- The adapter must construct fake v1 input and translate v1 hook shapes. It
  cannot provide the type or lifecycle guarantees of a native v2 plugin.
- It uses a client shim with only selected operations and graceful no-ops.
  Legacy code that expects v1 client state, task/session helpers, headers, or
  UI behavior cannot be made equivalent by the shim.
- The v1 factory and synthesized `config()` hook remain the source of agent,
  tool, command, and runtime wiring. Failed bridges are logged and skipped
  rather than failing setup as a native plugin should.
- The adapter currently does not register built-in MCP definitions through the
  v2 MCP domain. OpenCode v2 does provide that domain; native migration must
  use it rather than treating MCP support as config-only.
- The adapter's interview bridge reconstructs only an in-memory projection
  from v2 context and events. It is not a durable, reload-safe v2 history
  implementation.
- Absolute-path development loading can expose externalized `jsdom` and
  `@ast-grep/napi` resolution problems. Installing the package or making those
  dependencies resolvable avoids this adapter/build issue.

## Supported native v2 surface

The beta Promise plugin API uses `define({ id, setup(context) })`; setup returns
cleanup and registrations are disposed with plugin scope. Its domains include:

- `agent`: inspect/update/remove agents, set the default, and transform the
  agent catalog;
- `tool`: add tools and hook `execute.before`/`execute.after`;
- `command`: add executable command definitions and reload commands;
- `session`: create/get/switch agent/switch model, prompt, generate, command,
  synthetic, interrupt, rename, wait, and hook `context`, `model.request`,
  `http.request`, or `http.response`;
- `event`: subscribe to the server event stream;
- `mcp`: transform, add, update, remove, and reload MCP configurations;
- `shell`, `skill`, `storage`, and `websearch`: supported domain APIs for the
  corresponding native integrations.

Session `context` is the supported native replacement for v1 raw message
transforms. Native code should mutate the v2 `system`, `messages`, and `tools`
context directly, without converting through v1 `{ info, parts }` objects.

## Native target architecture

The target is a separate native Promise-plugin composition, not a more capable
adapter:

1. Keep host-neutral configuration, agent definitions, prompt construction, and
   tool definitions in shared modules.
2. Move the existing v1 composition behind an explicit `src/v1` boundary.
3. Implement a native `define({ id, setup })` composition that registers agents,
   tools, executable commands, MCPs, session context/model hooks, tool hooks,
   and event handling through the official domains.
4. Replace the client shim, local v2 type mirror, and interview bridge with
   native context and lifecycle modules.
5. Make required registration failures fail setup; do not silently continue
   with a partial native installation.

The native implementation must not invoke the v1 factory, convert v2 values to
v1 hook payloads, or retain legacy lifecycle ownership merely to preserve
parity.

## Behaviors to deliberately retire

Exact v1 parity is not possible through the supported v2 Promise API. The
following behaviors must be explicitly retired from the native v2 target,
rather than emulated with shims:

- legacy background-job ownership and orchestrator wake scheduling;
- child-pane multiplexer integration (tmux, zellij, herdr, and cmux);
- runtime foreground-model failover;
- tool permission prompt/cancellation interception;
- initiator-header injection;
- interview-history reconstruction after a plugin reload.

The beta API also has no exact plugin hooks for compaction prompt replacement,
permission-prompt interception, or synthetic text completion. Those behaviors
need a product-level replacement or explicit retirement; they must not be
presented as native parity.

TUI toasts and the interactive `/preset` switcher are **not** required
retirements. The beta plugin package exposes TUI participation through
`tui: true` and the TUI context surface, so native migration should evaluate
those controls as API opportunities. The current adapter does not bridge them;
that is an adapter gap, not a claim that the native API cannot support them.

Small-model selection is an inventory decision, not a predeclared retirement.
The current implementation uses `runtime.smallModel()` for SmartFetch's
secondary-model selection. The native migration must determine the supported
v2 equivalent and its parity requirements during inventory.

The official API does provide MCP registration, session model switching, and
executable command registration. Those are migration opportunities, not
retirements. In particular, the old documentation claim that v2 has no model
setter or programmatic MCP surface is outdated for the beta checkout.

The current adapter does not preserve the v1 `/preset` TUI experience. Native
migration should decide whether the v2 TUI context can provide an equivalent
interactive control or whether a documented noninteractive config/command
workflow is preferable; it must not claim v1 UI parity before that work is
verified.

## Verification gates

Validation is required at each migration boundary:

1. **Architecture gate:** approve the host-neutral boundary, native domain
   mapping, parity definition, and deliberate retirements.
2. **Static/runtime gate:** compile, lint, and run unit tests for shared code,
   the v1 host, and native registrations. Required registration failures must
   be observable failures.
3. **v2 host smoke gate:** using the beta checkout's embedded-host patterns and
   `bun run dev:live`, prove plugin loading, agent/tool/command/MCP registration,
   a session-context transform, tool lifecycle hooks, event handling, and
   cleanup.
4. **v1 compatibility gate:** retain the existing v1 load/smoke path until the
   cutover is complete; verify that the v1 factory remains unchanged during
   the transition.
5. **Release-readiness gate:** verify the published package entry points,
   install path, native v2 smoke artifact, documented retirements, and absence
   of adapter-only claims before removing the transitional path.

## Migration roadmap

1. **Inventory:** map each v1 behavior to an official v2 domain, classify it as
   native, adapter-only, or retired, and obtain approval for the retirements.
2. **Separate composition:** introduce shared host-neutral config/prompt/tool
   logic, move v1 composition to `src/v1`, and implement native Promise setup
   with strict registration and cleanup.
3. **Prove both hosts:** run the v2 host smoke and v1 compatibility gates in
   parallel; compare supported behavior without expanding the shim.
4. **Cut over v2:** make the native composition the v2 entry point, remove the
   v1 adapter, client shim, local v2 type mirror, and interview bridge, then
   retain v1 only for the verified cutover period.
5. **Complete migration:** after release-readiness review, decide whether the
   v1 host can be retired and remove remaining compatibility-only code.
