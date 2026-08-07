// Single entry point wiring both halves of sync together — see outbox.ts and pull.ts for the
// actual push/pull mechanics, and merge.ts for how a pulled row lands in local SQLite.
import { registerOutboxTriggers } from './outbox';
import { registerPullTriggers } from './pull';

export function startSyncEngine(): void {
  registerOutboxTriggers();
  registerPullTriggers();
}
