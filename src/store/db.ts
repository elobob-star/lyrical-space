// Tiny promise wrapper around IndexedDB with an in-memory fallback.
const DB_NAME = 'portascribe';
const STORES = ['songs', 'scraps', 'blobs', 'kv', 'history', 'pages'] as const;
type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase | null> | null = null;
const mem: Record<StoreName, Map<string, unknown>> = {
  songs: new Map(), scraps: new Map(), blobs: new Map(), kv: new Map(), history: new Map(), pages: new Map(),
};

function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function wrap<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return mem[store].get(key) as T | undefined;
  return wrap<T | undefined>(db.transaction(store).objectStore(store).get(key));
}

export async function dbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) { mem[store].set(key, value); return; }
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await open();
  if (!db) { mem[store].delete(key); return; }
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function dbAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  if (!db) return [...mem[store].values()] as T[];
  return wrap<T[]>(db.transaction(store).objectStore(store).getAll());
}

/** All values whose key starts with `prefix` (keys sort as strings). */
export async function dbPrefix<T>(store: StoreName, prefix: string): Promise<Array<{ key: string; value: T }>> {
  const db = await open();
  if (!db) return [...mem[store].entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value: value as T }));
  const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
  const os = db.transaction(store).objectStore(store);
  const [keys, values] = await Promise.all([wrap(os.getAllKeys(range)), wrap(os.getAll(range))]);
  return keys.map((k, i) => ({ key: String(k), value: values[i] as T }));
}

export const kvGet = <T>(k: string) => dbGet<T>('kv', k);
export const kvSet = (k: string, v: unknown) => dbPut('kv', k, v);

export async function persistRequest(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}
