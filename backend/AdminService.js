/**
 * Management-screen endpoints (Dashboard, Merchandisers, Stores), all
 * area-scoped per getScopedAreaIds_ (see Access.js) and restricted to
 * supervisor/manager/headoffice/admin roles via requireManagementRole_.
 *
 * getDashboardSummary_'s KPI percentages are computed from VERIFIED visits
 * only (a supervisor has reviewed them), unverified visits count toward
 * `pendingCount` but don't move the percentages.
 *
 * Facing (vs. target) is its own metric, `facingPct`, objective and
 * target-based, no supervisor judgment involved. "Regular Shelf"
 * (`regularShelfPct`) is a separate weighted composite of the supervisor's
 * Planogram/POSM/Eye Level Ya-Tidak answers per shelf photo: Planogram
 * 40%, POSM 30%, Eye Level 30%. The 3 sub-scores (`planogramPct`/
 * `posmPct`/`eyeLevelPct`) are also returned individually for the
 * dashboard to show broken out, not just the composite. An unanswered
 * Planogram/POSM/Eye Level never counts as either, Verification.jsx
 * already refuses to save until every check has a real answer. OOS and
 * any facing discrepancy the supervisor spots against the photo go in the
 * free-text notes instead of a structured field, there's nothing for the
 * supervisor to "fix" in that data, just flag.
 *
 * Note: facing still compares against the flat Products.expectedFacing
 * (still 1 for everyone as of Phase 1), not a per-store target.
 * StoreProducts stores real per-store MSL/facing targets for the Store
 * Profile screen, but VisitForm doesn't read from it yet — a deliberately
 * deferred follow-up (see the Phase 2 plan notes). Wiring that up is what
 * will make facing (and Stock Availability, which has the same "assumes
 * all 24 SKUs are listed everywhere" limitation) fully accurate.
 */

function getAreas_(auth) {
  requireManagementRole_(auth);
  const sheet = getSheet_(SHEET_NAMES.AREAS);
  return { ok: true, areas: sheetToObjects_(sheet) };
}

function filterByScopedAreas_(rows, auth, storeById) {
  const scoped = getScopedAreaIds_(auth);
  if (scoped === null) return rows; // unscoped role, no filter
  return rows.filter((row) => {
    const areaId = row.areaId !== undefined ? row.areaId : storeById && storeById[row.storeId] ? storeById[row.storeId].areaId : undefined;
    return scoped.indexOf(areaId) !== -1;
  });
}

function getStores_(auth) {
  requireManagementRole_(auth);
  const sheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(sheet);
  return { ok: true, stores: filterByScopedAreas_(stores, auth) };
}

// A merchandiser's area normally comes from their assigned store(s), not a
// field on Users directly (merchandisers aren't area-scoped themselves,
// their *visibility to managers* is derived from where they're assigned).
// A pending (pre-registered, not yet assigned any store) merchandiser has
// no stores yet, so falls back to the areaId set at creation time.
function merchandiserAreaIds_(user, storeById) {
  const storeIds = user.storeIds ? String(user.storeIds).split(',').filter(Boolean) : [];
  const areas = storeIds.map((id) => storeById[id] && storeById[id].areaId).filter(Boolean);
  if (areas.length === 0 && user.areaId) return [user.areaId];
  return areas;
}

/**
 * Shared by getMerchandisers_ and getDashboardSummary_: the list of
 * merchandiser-role Users visible to this caller, plus a storeById map
 * for convenience.
 */
function getInScopeMerchandisers_(auth) {
  const usersSheet = getSheet_(SHEET_NAMES.USERS);
  const users = sheetToObjects_(usersSheet).filter((u) => u.role === 'merchandiser');

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));

  const scoped = getScopedAreaIds_(auth);
  const inScope = users.filter((u) => {
    if (scoped === null) return true;
    const areas = merchandiserAreaIds_(u, storeById);
    return areas.some((a) => scoped.indexOf(a) !== -1);
  });

  return { inScope, storeById };
}

/**
 * action: "getMerchandisers" — merchandisers in the caller's scope, each
 * with their journey plan entries and a lastVisit summary joined in.
 */
function getMerchandisers_(auth) {
  requireManagementRole_(auth);

  const { inScope, storeById } = getInScopeMerchandisers_(auth);

  const plansSheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const plans = sheetToObjects_(plansSheet);

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  const visits = sheetToObjects_(visitsSheet);

  const result = inScope.map((u) => {
    const storeIds = u.storeIds ? String(u.storeIds).split(',').filter(Boolean) : [];
    const myPlans = plans.filter((p) => p.merchandiserId === u.userId);
    const myVisits = visits.filter((v) => v.merchandiserId === u.userId);
    const lastVisit = myVisits.sort((a, b) => (a.checkInTime > b.checkInTime ? -1 : 1))[0] || null;
    return {
      userId: u.userId,
      username: u.username,
      name: u.name,
      storeIds: storeIds,
      storeNames: storeIds.map((id) => (storeById[id] ? storeById[id].name : id)),
      areaIds: merchandiserAreaIds_(u, storeById),
      pending: u.accountStatus === 'pending',
      journeyPlan: myPlans,
      lastVisit: lastVisit ? { storeId: lastVisit.storeId, checkInTime: lastVisit.checkInTime, status: lastVisit.status } : null,
    };
  });

  return { ok: true, merchandisers: result };
}

function findStoreProductRows_(sheet, storeId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const storeIdx = headers.indexOf('storeId');
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (data[r][storeIdx] === storeId) rows.push(r + 1); // 1-based sheet row number
  }
  return { headers: headers, rowNumbers: rows };
}

function requireStoreInScope_(auth, storeId) {
  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const store = stores.find((s) => s.storeId === storeId);
  if (!store) throw new Error('store not found: ' + storeId);
  const scoped = getScopedAreaIds_(auth);
  if (scoped !== null && scoped.indexOf(store.areaId) === -1) {
    throw new AuthError_('unauthorized');
  }
  return store;
}

/**
 * Throws unless areaId is one the caller is allowed to create stores/
 * merchandisers in: for a supervisor, their single assigned area; for a
 * manager (RSM), any area within their region; unscoped roles can pick
 * any area that exists.
 */
function requireAreaInScope_(auth, areaId) {
  const scoped = getScopedAreaIds_(auth);
  if (scoped !== null && scoped.indexOf(areaId) === -1) {
    throw new AuthError_('unauthorized');
  }
  const areas = sheetToObjects_(getSheet_(SHEET_NAMES.AREAS));
  if (!areas.some((a) => a.areaId === areaId)) {
    throw new Error('area not found: ' + areaId);
  }
}

/**
 * action: "createStore" — { token, name, address, channel, areaId }
 * Creates the store's master record only (no product profile, that's a
 * separate step on the existing "Kelola profil produk toko" screen).
 * Stores.packTypes is a legacy column, left blank here, VisitForm's shelf
 * photo slots and product groupings are derived dynamically from
 * StoreProducts/Products instead (see getStorePackTypes_).
 */
function createStore_(auth, body) {
  requireStoreProfileRole_(auth);
  const name = String(body.name || '').trim();
  const areaId = String(body.areaId || '').trim();
  if (!name) throw new Error('name is required');
  requireAreaInScope_(auth, areaId);

  const sheet = getSheet_(SHEET_NAMES.STORES);
  const storeId = 'STORE-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  appendRowByHeaders_(sheet, {
    storeId: storeId,
    name: name,
    address: String(body.address || ''),
    channel: String(body.channel || ''),
    areaId: areaId,
  });
  return { ok: true, storeId: storeId };
}

/**
 * action: "createPendingMerchandiser" — { token, name, areaId }
 * Pre-registers a merchandiser's name and area only, with no
 * username/PIN, so a Supervisor/RSM can appoint them to stores right
 * away. accountStatus stays 'pending' until an admin activates the
 * record (sets username/PIN) via activatePendingMerchandiser() in the
 * Apps Script editor, account/PIN creation deliberately stays an admin
 * task, not something exposed on the web UI.
 */
function createPendingMerchandiser_(auth, body) {
  requireStoreProfileRole_(auth);
  const name = String(body.name || '').trim();
  const areaId = String(body.areaId || '').trim();
  if (!name) throw new Error('name is required');
  requireAreaInScope_(auth, areaId);

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const userId = Utilities.getUuid();
  appendRowByHeaders_(sheet, {
    userId: userId,
    username: '',
    pinHash: '',
    name: name,
    role: 'merchandiser',
    storeIds: '',
    areaId: areaId,
    regionId: '',
    accountStatus: 'pending',
  });
  return { ok: true, userId: userId };
}

/**
 * Throws unless userId is a merchandiser visible to the caller (same scope
 * rule as getMerchandisers_). Returns the merchandiser's row from
 * getInScopeMerchandisers_'s user list.
 */
function requireMerchandiserInScope_(auth, userId) {
  const { inScope } = getInScopeMerchandisers_(auth);
  const found = inScope.find((u) => u.userId === userId);
  if (!found) throw new AuthError_('unauthorized');
  return found;
}

function findJourneyPlanRows_(sheet, merchandiserId, week) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const merchandiserIdx = headers.indexOf('merchandiserId');
  const weekIdx = headers.indexOf('week');
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (data[r][merchandiserIdx] === merchandiserId && data[r][weekIdx] === week) rows.push(r + 1);
  }
  return rows;
}

/**
 * action: "getJourneyPlanForWeek" — { token, merchandiserId, week }
 * week is an ISO week string like "2026-W39" (matches <input type="week">
 * and Utilities.formatDate's "YYYY-'W'ww" pattern used when seeding).
 */
function getJourneyPlanForWeek_(auth, params) {
  requireStoreProfileRole_(auth);
  requireMerchandiserInScope_(auth, params.merchandiserId);

  const sheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const all = sheetToObjects_(sheet);
  const entries = all
    .filter((p) => p.merchandiserId === params.merchandiserId && p.week === params.week)
    .map((p) => ({ storeId: p.storeId, plannedDate: p.plannedDate }));
  return { ok: true, entries: entries };
}

/**
 * action: "setJourneyPlanForWeek" — { token, merchandiserId, week, entries: [{storeId, plannedDate}, ...] }
 * Replaces this merchandiser's journey plan for that week wholesale
 * (same pattern as setStoreProducts_), so a store visited twice in the
 * same week is just two entries with different plannedDate.
 */
function setJourneyPlanForWeek_(auth, body) {
  requireStoreProfileRole_(auth);
  requireMerchandiserInScope_(auth, body.merchandiserId);

  const entries = Array.isArray(body.entries) ? body.entries : [];
  entries.forEach((e) => requireStoreInScope_(auth, e.storeId));

  const sheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const existingRows = findJourneyPlanRows_(sheet, body.merchandiserId, body.week);
  existingRows
    .sort((a, b) => b - a)
    .forEach((rowNumber) => sheet.deleteRow(rowNumber));

  entries.forEach((e) => {
    appendRowByHeaders_(sheet, {
      planId: Utilities.getUuid(),
      merchandiserId: body.merchandiserId,
      week: body.week,
      storeId: e.storeId,
      plannedDate: e.plannedDate,
    });
  });

  return { ok: true, count: entries.length };
}

function findUserRowById_(sheet, userId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));
  for (let r = 1; r < data.length; r++) {
    if (data[r][idx.userId] === userId) {
      return { rowNumber: r + 1, idx: idx, row: data[r] };
    }
  }
  return null;
}

/**
 * action: "assignMerchandiserStores" — { token, userId, storeIds: [...] }
 * Replaces a merchandiser's store assignment wholesale. Works for both
 * pending (pre-registered, no login yet) and already-active
 * merchandisers. Every storeId given, and the merchandiser's own area,
 * must fall within the caller's scope.
 */
function assignMerchandiserStores_(auth, body) {
  requireStoreProfileRole_(auth);
  const userId = String(body.userId || '').trim();
  const storeIds = Array.isArray(body.storeIds) ? body.storeIds.filter(Boolean) : [];

  const sheet = getSheet_(SHEET_NAMES.USERS);
  const found = findUserRowById_(sheet, userId);
  if (!found || found.row[found.idx.role] !== 'merchandiser') {
    throw new Error('merchandiser not found: ' + userId);
  }
  requireAreaInScope_(auth, found.row[found.idx.areaId]);
  storeIds.forEach((storeId) => requireStoreInScope_(auth, storeId));

  sheet.getRange(found.rowNumber, found.idx.storeIds + 1).setValue(storeIds.join(','));
  return { ok: true, userId: userId, storeIds: storeIds };
}

/**
 * action: "getStoreProducts" — { token, storeId } -> that store's product
 * list, each row noting whether it's listed/MSL and its facing target.
 * Products not yet given a StoreProducts row for this store show up with
 * listed:false so the UI can offer to add them.
 */
function getStoreProducts_(auth, params) {
  requireStoreProfileRole_(auth);
  requireStoreInScope_(auth, params.storeId);

  const productsSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  const products = sheetToObjects_(productsSheet);

  const spSheet = getSheet_(SHEET_NAMES.STORE_PRODUCTS);
  const storeProducts = sheetToObjects_(spSheet).filter((sp) => sp.storeId === params.storeId);
  const bySku = {};
  storeProducts.forEach((sp) => (bySku[sp.sku] = sp));

  const merged = products.map((p) => {
    const sp = bySku[p.sku];
    return {
      sku: p.sku,
      name: p.name,
      packtype: p.packtype,
      category: p.category,
      listed: sp ? !!sp.listed : false,
      msl: sp ? !!sp.msl : false,
      expectedFacing: sp ? sp.expectedFacing : p.expectedFacing,
    };
  });

  return { ok: true, storeId: params.storeId, products: merged };
}

/**
 * action: "setStoreProducts" — { token, storeId, items: [{sku, listed, msl, expectedFacing}, ...] }
 * Replaces this store's StoreProducts rows wholesale (simplest correct
 * approach given the row count per store is small, at most the product
 * catalog size).
 */
function setStoreProducts_(auth, body) {
  requireStoreProfileRole_(auth);
  requireStoreInScope_(auth, body.storeId);

  if (!Array.isArray(body.items)) {
    return { ok: false, error: 'items must be an array' };
  }

  const sheet = getSheet_(SHEET_NAMES.STORE_PRODUCTS);
  const existing = findStoreProductRows_(sheet, body.storeId);

  // Delete existing rows for this store (bottom-up so row numbers don't shift).
  existing.rowNumbers
    .sort((a, b) => b - a)
    .forEach((rowNumber) => sheet.deleteRow(rowNumber));

  const newRows = body.items
    .filter((item) => item.listed) // only store rows for SKUs actually listed
    .map((item) => [body.storeId, item.sku, true, !!item.msl, item.expectedFacing || 1]);

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  return { ok: true, storeId: body.storeId, count: newRows.length };
}

/**
 * action: "getDashboardSummary" — { token, startDate?, endDate?, storeId? }
 * See the file header note on Regular Shelf/Stock Availability accuracy.
 */
function getDashboardSummary_(auth, params) {
  requireManagementRole_(auth);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const allStores = sheetToObjects_(storesSheet);
  const storeById = {};
  allStores.forEach((s) => (storeById[s.storeId] = s));
  const scopedStores = filterByScopedAreas_(allStores, auth);

  const usersSheet = getSheet_(SHEET_NAMES.USERS);
  const allUsers = sheetToObjects_(usersSheet);
  const scoped = getScopedAreaIds_(auth);
  const supervisorCount = allUsers.filter((u) => {
    if (u.role !== 'supervisor' && u.role !== 'manager') return false;
    return scoped === null || scoped.indexOf(u.areaId) !== -1;
  }).length;
  const merchandiserCount = getInScopeMerchandisers_(auth).inScope.length;

  const productsSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  const products = sheetToObjects_(productsSheet);
  const productBySku = {};
  products.forEach((p) => (productBySku[p.sku] = p));

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  let visits = sheetToObjects_(visitsSheet);

  visits = filterByScopedAreas_(visits, auth, storeById);
  if (params.storeId) {
    visits = visits.filter((v) => v.storeId === params.storeId);
  }
  if (params.startDate) {
    visits = visits.filter((v) => v.checkInTime >= params.startDate);
  }
  if (params.endDate) {
    // endDate is a plain "yyyy-MM-dd"; include the whole day by comparing against the next day.
    visits = visits.filter((v) => v.checkInTime < params.endDate + 'T23:59:59.999Z');
  }

  // KPI numbers reflect verified data only, a supervisor's revised facing
  // count (when one exists) is what counts, not the merchandiser's raw
  // entry, unverified visits show up as "pending", not in the percentages.
  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const verificationByVisitId = {};
  sheetToObjects_(verificationsSheet).forEach((v) => (verificationByVisitId[v.visitId] = v));

  const verifiedVisits = visits.filter((v) => verificationByVisitId[v.visitId]);
  const pendingCount = visits.length - verifiedVisits.length;

  // Facing is its own metric (objective, target-based, no supervisor
  // judgment involved). "Regular Shelf" is a weighted composite of the
  // supervisor's Planogram/POSM/Eye Level Ya-Tidak answers, per shelf
  // photo: Planogram 40%, POSM 30%, Eye Level 30% (sums to 100). An
  // unanswered check was already rejected at save time (Verification.jsx),
  // so anything present here was genuinely answered.
  const REGULAR_SHELF_WEIGHTS = { planogram: 0.4, posm: 0.3, eyeLevel: 0.3 };

  function pct(met, checked) {
    return checked ? Math.round((met / checked) * 1000) / 10 : null;
  }

  function computeFor(visitSubset) {
    let availChecked = 0;
    let availOos = 0;
    let facingChecked = 0;
    let facingMet = 0;
    let planogramChecked = 0;
    let planogramMet = 0;
    let posmChecked = 0;
    let posmMet = 0;
    let eyeLevelChecked = 0;
    let eyeLevelMet = 0;
    let secondaryPlacedCount = 0;

    visitSubset.forEach((v) => {
      let availability = {};
      let stockTake = {};
      let shelfPhotos = [];
      let planogram = {};
      let posm = {};
      let eyeLevel = {};
      try {
        availability = JSON.parse(v.availabilityJson || '{}');
      } catch (e) {
        /* leave empty */
      }
      try {
        stockTake = JSON.parse(v.stockTakeJson || '{}');
      } catch (e) {
        /* leave empty */
      }
      try {
        shelfPhotos = JSON.parse(v.shelfPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }
      const verification = verificationByVisitId[v.visitId];
      if (verification) {
        try {
          planogram = JSON.parse(verification.planogramJson || '{}');
        } catch (e) {
          /* leave empty */
        }
        try {
          posm = JSON.parse(verification.posmJson || '{}');
        } catch (e) {
          /* leave empty */
        }
        try {
          eyeLevel = JSON.parse(verification.eyeLevelJson || '{}');
        } catch (e) {
          /* leave empty */
        }
      }

      Object.keys(availability).forEach((sku) => {
        availChecked++;
        const entry = availability[sku];
        const isAvailable = typeof entry === 'object' ? entry.available : !!entry;
        if (!isAvailable) availOos++;
      });

      Object.keys(stockTake).forEach((sku) => {
        facingChecked++;
        const facing = Number(stockTake[sku]) || 0;
        const target = (productBySku[sku] && productBySku[sku].expectedFacing) || 1;
        if (facing >= target) facingMet++;
      });

      shelfPhotos.forEach((sp) => {
        if (typeof planogram[sp.packtype] === 'boolean') {
          planogramChecked++;
          if (planogram[sp.packtype] === true) planogramMet++;
        }
        if (typeof posm[sp.packtype] === 'boolean') {
          posmChecked++;
          if (posm[sp.packtype] === true) posmMet++;
        }
        if (typeof eyeLevel[sp.packtype] === 'boolean') {
          eyeLevelChecked++;
          if (eyeLevel[sp.packtype] === true) eyeLevelMet++;
        }
      });

      if (Number(v.secondaryDisplayCount) > 0) {
        secondaryPlacedCount++;
      }
    });

    const planogramPct = pct(planogramMet, planogramChecked);
    const posmPct = pct(posmMet, posmChecked);
    const eyeLevelPct = pct(eyeLevelMet, eyeLevelChecked);

    // Weighted composite, only using whichever of the 3 sub-scores
    // actually have data, re-normalized so a store with no shelf photos
    // yet just shows null instead of a misleadingly low number.
    let weightedSum = 0;
    let weightTotal = 0;
    [
      [planogramPct, REGULAR_SHELF_WEIGHTS.planogram],
      [posmPct, REGULAR_SHELF_WEIGHTS.posm],
      [eyeLevelPct, REGULAR_SHELF_WEIGHTS.eyeLevel],
    ].forEach(([value, weight]) => {
      if (value !== null) {
        weightedSum += value * weight;
        weightTotal += weight;
      }
    });
    const regularShelfPct = weightTotal ? Math.round((weightedSum / weightTotal) * 10) / 10 : null;

    return {
      visitCount: visitSubset.length,
      stockAvailabilityPct: pct(availChecked - availOos, availChecked),
      facingPct: pct(facingMet, facingChecked),
      planogramPct: planogramPct,
      posmPct: posmPct,
      eyeLevelPct: eyeLevelPct,
      regularShelfPct: regularShelfPct,
      secondaryDisplayPct: visitSubset.length ? pct(secondaryPlacedCount, visitSubset.length) : null,
    };
  }

  const overall = Object.assign(computeFor(verifiedVisits), {
    totalVisits: visits.length,
    verifiedCount: verifiedVisits.length,
    pendingCount: pendingCount,
  });

  const byStoreMap = {};
  verifiedVisits.forEach((v) => {
    if (!byStoreMap[v.storeId]) byStoreMap[v.storeId] = [];
    byStoreMap[v.storeId].push(v);
  });
  const byStore = Object.keys(byStoreMap).map((storeId) => {
    return Object.assign(
      { storeId: storeId, storeName: storeById[storeId] ? storeById[storeId].name : storeId },
      computeFor(byStoreMap[storeId])
    );
  });

  return {
    ok: true,
    overall: overall,
    byStore: byStore,
    scope: {
      storeCount: scopedStores.length,
      merchandiserCount: merchandiserCount,
      supervisorCount: supervisorCount,
    },
  };
}
