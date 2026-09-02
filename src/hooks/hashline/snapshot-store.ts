import type { InMemorySnapshotStore } from '@oh-my-pi/hashline';

let snapshotStoreInstance: InMemorySnapshotStore | null = null;

/**
 * Get or initialize the process-global InMemorySnapshotStore.
 * Dynamically imported to ensure @oh-my-pi/hashline is never loaded unless needed.
 */
export async function getGlobalSnapshotStore(): Promise<InMemorySnapshotStore> {
  if (!snapshotStoreInstance) {
    const { InMemorySnapshotStore } = await import('@oh-my-pi/hashline');
    snapshotStoreInstance = new InMemorySnapshotStore();
  }
  return snapshotStoreInstance;
}

/**
 * Reset the store (used in test isolation).
 */
export function resetGlobalSnapshotStore(): void {
  snapshotStoreInstance = null;
}
