/**
 * Crash / tab-close recovery. While the document has unsaved changes, a
 * snapshot (.icon.zip bytes) is kept in IndexedDB. On the next launch the user
 * is offered to restore it. Saving or discarding clears the snapshot.
 *
 * This is recovery, not a replacement for Save: the bundle on disk is only
 * written when the user saves.
 */
import { unzipBundle, zipBundle, type IconDocument } from '@fresnel/core';
import type { FileMap } from '../store/doc';

const DB = 'fresnel';
const STORE = 'recovery';
const KEY = 'current';

export interface Snapshot {
  name: string;
  location: string | null;
  savedAt: number;
  zip: Uint8Array;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result as T);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function writeSnapshot(doc: IconDocument, extra: FileMap, name: string, location: string | null): Promise<void> {
  const snap: Snapshot = { name, location, savedAt: Date.now(), zip: zipBundle(doc, name, extra) };
  await tx('readwrite', (s) => s.put(snap, KEY));
}

export async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const s = await tx<Snapshot | undefined>('readonly', (st) => st.get(KEY));
    return s && s.zip instanceof Uint8Array ? s : null;
  } catch {
    return null;
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* storage unavailable */
  }
}

export function restoreSnapshot(s: Snapshot) {
  const b = unzipBundle(s.zip);
  return { doc: b as IconDocument, extra: b.extra, name: s.name, location: s.location };
}
