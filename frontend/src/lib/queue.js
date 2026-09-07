// Offline-first submission queue. Apps Script has no built-in offline sync
// (unlike Firestore), so every visit submission goes through IndexedDB
// first, then gets flushed to the server when a connection is available.
// Each queued item carries the visitId the UI already generated, so a
// retry after a partial failure never creates a duplicate row server-side
// (submitVisit_ upserts by visitId).

import { openDB } from 'idb';
import { submitVisit } from './api';

const DB_NAME = 'merchandiser-app';
const STORE_NAME = 'pendingVisits';

let listeners = [];

function notifyListeners(pendingCount) {
  listeners.forEach((fn) => fn(pendingCount));
}

export function onQueueChange(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'visitId' });
    },
  });
}

export async function enqueueVisit(visitPayload) {
  const db = await getDb();
  await db.put(STORE_NAME, visitPayload);
  notifyListeners(await countPending());
  // Try immediately in case we're actually online, no need to wait for the next sync tick.
  syncQueue();
}

export async function countPending() {
  const db = await getDb();
  return db.count(STORE_NAME);
}

export async function getPendingVisits() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

let syncing = false;

export async function syncQueue() {
  if (syncing) return;
  if (!navigator.onLine) return;
  syncing = true;
  try {
    const db = await getDb();
    const pending = await db.getAll(STORE_NAME);
    for (const visit of pending) {
      try {
        await submitVisit(visit);
        await db.delete(STORE_NAME, visit.visitId);
      } catch (err) {
        // Leave it queued, network or server issue, next trigger will retry.
        console.warn('Sync failed for visit', visit.visitId, err.message);
      }
    }
    notifyListeners(await countPending());
  } finally {
    syncing = false;
  }
}

let started = false;
export function startQueueSync() {
  if (started) return;
  started = true;
  window.addEventListener('online', syncQueue);
  // Periodic retry too, in case 'online' doesn't fire reliably on some devices.
  setInterval(syncQueue, 30000);
  syncQueue();
}
