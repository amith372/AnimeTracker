// A stable per-install random id, persisted like guestMode.ts's flag. Stamped onto every row this
// device pushes (series.updated_by_device_id / series_entries.updated_by_device_id) so
// src/sync/merge.ts can tell "a pull just echoed back a write I made myself" from "another device
// changed this" — the former is a safe no-op to skip, the latter is the whole point of pulling.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_DEVICE_ID = 'sync_device_id';

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(KEY_DEVICE_ID);
  if (existing) {
    cached = existing;
    return existing;
  }
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY_DEVICE_ID, id);
  cached = id;
  return id;
}
