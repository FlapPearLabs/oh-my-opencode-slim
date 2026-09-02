/**
 * Process-global InMemorySnapshotStore shared across all hashline hooks in the
 * current OpenCode process. A single store ensures that a snapshot recorded
 * when processing a `read` tool response is still resolvable when the matching
 * `edit` or `apply_patch` call arrives, regardless of how many hook instances
 * were created.
 *
 * The store is intentionally not session-scoped because:
 * 1. The read→edit round-trip often spans multiple plugin hook invocations.
 * 2. The SnapshotStore is stateless between stores — two stores do not
 *    interfere as long as tags are globally unique (they are: content-hash).
 */
import { InMemorySnapshotStore } from '@oh-my-pi/hashline';

// One shared store per process lifetime.
export const globalSnapshotStore = new InMemorySnapshotStore();
