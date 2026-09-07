// Thin wrapper around the Apps Script Web App. All requests are routed by
// an `action` field, so this stays a single stable URL as we add endpoints.

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

function getToken() {
  return localStorage.getItem('token');
}

export function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function getSession() {
  const token = getToken();
  const userRaw = localStorage.getItem('user');
  if (!token || !userRaw) return null;
  return { token, user: JSON.parse(userRaw) };
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function apiGet(action, params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const token = getToken();
  if (token) url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Network error: ' + res.status);
  return res.json();
}

async function apiPost(action, body = {}) {
  const token = getToken();
  const payload = Object.assign({ action }, body, token ? { token } : {});

  // text/plain avoids a CORS preflight against the Apps Script endpoint.
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Network error: ' + res.status);
  return res.json();
}

export async function ping() {
  return apiGet('ping');
}

export async function login(username, pin) {
  const result = await apiPost('login', { username, pin });
  if (!result.ok) throw new Error(result.error || 'login failed');
  setSession(result.token, result.user);
  return result;
}

// Read endpoints get a local cache with a network-first, cache-fallback
// strategy: whatever loaded last time you had signal is what shows up
// when you open a visit with none, instead of a dead error screen.
const CACHE_PRODUCTS = 'cache:products';
const CACHE_JOURNEY_PLAN = 'cache:journeyPlan';

function readCache(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function writeCache(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function getProducts() {
  try {
    const result = await apiGet('getProducts');
    if (!result.ok) throw new Error(result.error || 'failed to load products');
    writeCache(CACHE_PRODUCTS, result.products);
    return result.products;
  } catch (err) {
    const cached = readCache(CACHE_PRODUCTS);
    if (cached) return cached;
    throw err;
  }
}

export async function getJourneyPlan(week) {
  try {
    const result = await apiGet('getJourneyPlan', week ? { week } : {});
    if (!result.ok) throw new Error(result.error || 'failed to load journey plan');
    writeCache(CACHE_JOURNEY_PLAN, result.journeyPlan);
    return result.journeyPlan;
  } catch (err) {
    const cached = readCache(CACHE_JOURNEY_PLAN);
    if (cached) return cached;
    throw err;
  }
}

// Used by the offline queue: submitVisit is safe to retry, the backend
// upserts by visitId so a duplicate send never creates a duplicate row.
export async function submitVisit(visitPayload) {
  const result = await apiPost('submitVisit', visitPayload);
  if (!result.ok) throw new Error(result.error || 'failed to submit visit');
  return result;
}
