import type { BackupMeta, Trade } from "./types";

const DB_NAME = "trading-journal-db";
const DB_VERSION = 1;
const TRADE_STORE = "trades";
const META_STORE = "meta";
const BACKUP_META_KEY = "backup";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRADE_STORE)) {
        const tradeStore = db.createObjectStore(TRADE_STORE, { keyPath: "id" });
        tradeStore.createIndex("date", "date", { unique: false });
        tradeStore.createIndex("symbol", "symbol", { unique: false });
        tradeStore.createIndex("strategy", "strategy", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = run(store);
        let result = undefined as T;

        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function getTrades(): Promise<Trade[]> {
  const trades = await transaction<Trade[]>(TRADE_STORE, "readonly", (store) => store.getAll());
  return [...(trades ?? [])].sort((a, b) => b.date.localeCompare(a.date));
}

export function saveTrade(trade: Trade): Promise<IDBValidKey> {
  return transaction<IDBValidKey>(TRADE_STORE, "readwrite", (store) => store.put(trade));
}

export function deleteTrade(id: string): Promise<undefined> {
  return transaction<undefined>(TRADE_STORE, "readwrite", (store) => store.delete(id));
}

export async function clearTrades(): Promise<void> {
  await transaction<undefined>(TRADE_STORE, "readwrite", (store) => store.clear());
}

export async function importTrades(trades: Trade[]): Promise<{ added: number; updated: number }> {
  const existing = new Set((await getTrades()).map((trade) => trade.id));
  let added = 0;
  let updated = 0;

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TRADE_STORE, "readwrite");
    const store = tx.objectStore(TRADE_STORE);

    for (const trade of trades) {
      if (existing.has(trade.id)) updated += 1;
      else added += 1;
      store.put(trade);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return { added, updated };
}

export async function getBackupMeta(): Promise<BackupMeta> {
  const row = await transaction<{ key: string; value: BackupMeta } | undefined>(
    META_STORE,
    "readonly",
    (store) => store.get(BACKUP_META_KEY),
  );
  return row?.value ?? {};
}

export function saveBackupMeta(meta: BackupMeta): Promise<IDBValidKey> {
  return transaction<IDBValidKey>(META_STORE, "readwrite", (store) =>
    store.put({ key: BACKUP_META_KEY, value: meta }),
  );
}
