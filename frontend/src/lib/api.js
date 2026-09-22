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

// Management-screen endpoints (Dashboard/Merchandisers/Stores). No offline
// caching here, unlike the field-facing calls above, these screens assume
// the supervisor/manager/etc. has signal.

export async function getAreas() {
  const result = await apiGet('getAreas');
  if (!result.ok) throw new Error(result.error || 'failed to load areas');
  return result.areas;
}

export async function getStores() {
  const result = await apiGet('getStores');
  if (!result.ok) throw new Error(result.error || 'failed to load stores');
  return result.stores;
}

export async function getMerchandisers() {
  const result = await apiGet('getMerchandisers');
  if (!result.ok) throw new Error(result.error || 'failed to load merchandisers');
  return result.merchandisers;
}

export async function getStoreProducts(storeId) {
  const result = await apiGet('getStoreProducts', { storeId });
  if (!result.ok) throw new Error(result.error || 'failed to load store products');
  return result.products;
}

export async function setStoreProducts(storeId, items) {
  const result = await apiPost('setStoreProducts', { storeId, items });
  if (!result.ok) throw new Error(result.error || 'failed to save store products');
  return result;
}

export async function getDashboardSummary({ startDate, endDate, storeId } = {}) {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (storeId) params.storeId = storeId;
  const result = await apiGet('getDashboardSummary', params);
  if (!result.ok) throw new Error(result.error || 'failed to load dashboard summary');
  return result;
}

export async function getStorePackTypes(storeId) {
  const result = await apiGet('getStorePackTypes', { storeId });
  if (!result.ok) throw new Error(result.error || 'failed to load store pack types');
  return result.packtypes;
}

export async function getVisitsForVerification({ startDate, endDate, storeId } = {}) {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (storeId) params.storeId = storeId;
  const result = await apiGet('getVisitsForVerification', params);
  if (!result.ok) throw new Error(result.error || 'failed to load visits for verification');
  return result.visits;
}

export async function submitVerification(payload) {
  const result = await apiPost('submitVerification', payload);
  if (!result.ok) throw new Error(result.error || 'failed to save verification');
  return result;
}

export async function getVisitsForRsmReview({ startDate, endDate, storeId } = {}) {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (storeId) params.storeId = storeId;
  const result = await apiGet('getVisitsForRsmReview', params);
  if (!result.ok) throw new Error(result.error || 'failed to load visits for RSM review');
  return result.visits;
}

export async function submitRsmReview(payload) {
  const result = await apiPost('submitRsmReview', payload);
  if (!result.ok) throw new Error(result.error || 'failed to save RSM review');
  return result;
}

export async function getVisitsForHeadOfficeReview({ startDate, endDate, storeId } = {}) {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (storeId) params.storeId = storeId;
  const result = await apiGet('getVisitsForHeadOfficeReview', params);
  if (!result.ok) throw new Error(result.error || 'failed to load visits for Head Office review');
  return result.visits;
}

export async function submitHeadOfficeReview(payload) {
  const result = await apiPost('submitHeadOfficeReview', payload);
  if (!result.ok) throw new Error(result.error || 'failed to save Head Office review');
  return result;
}
