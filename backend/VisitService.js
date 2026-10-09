/**
 * Journey plan, product catalog, and visit submission (availability check +
 * stock take + shelf photos), all keyed off the authenticated merchandiser.
 */

function sheetToObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    // Skip fully blank rows.
    if (data[r].every((v) => v === '')) continue;
    const obj = {};
    headers.forEach((h, i) => (obj[h] = data[r][i]));
    rows.push(obj);
  }
  return rows;
}

function getProducts_() {
  const sheet = getSheet_(SHEET_NAMES.PRODUCTS);
  return { ok: true, products: sheetToObjects_(sheet) };
}

/**
 * action: "getStorePackTypes" — { token, storeId } -> distinct pack types
 * this store carries, so VisitForm knows how many shelf photo slots to
 * show. Uses the store's StoreProducts profile if one has been set up
 * (see setStoreProducts_ in AdminService.js), otherwise falls back to the
 * full global catalog's pack types so the form still works for stores
 * nobody has profiled yet.
 */
function getStorePackTypes_(params) {
  const spSheet = getSheet_(SHEET_NAMES.STORE_PRODUCTS);
  const storeProducts = sheetToObjects_(spSheet).filter((sp) => sp.storeId === params.storeId && sp.listed);

  const productsSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  const products = sheetToObjects_(productsSheet);
  const productBySku = {};
  products.forEach((p) => (productBySku[p.sku] = p));

  let packtypes;
  if (storeProducts.length > 0) {
    packtypes = storeProducts.map((sp) => productBySku[sp.sku] && productBySku[sp.sku].packtype).filter(Boolean);
  } else {
    packtypes = products.map((p) => p.packtype);
  }

  const distinct = Array.from(new Set(packtypes));
  return { ok: true, storeId: params.storeId, packtypes: distinct };
}

/**
 * action: "getJourneyPlan" — { token, week? } -> plans for the logged-in merchandiser
 */
function getJourneyPlan_(auth, body) {
  const sheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const all = sheetToObjects_(sheet);
  const mine = all.filter((row) => {
    if (row.merchandiserId !== auth.userId) return false;
    if (body.week && row.week !== body.week) return false;
    return true;
  });

  // Attach store details so the client doesn't need a second round trip.
  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));

  const plan = mine.map((row) => Object.assign({}, row, { store: storeById[row.storeId] || null }));
  return { ok: true, journeyPlan: plan };
}

/**
 * action: "getMyVisits" — { token } -> this merchandiser's own submitted
 * visits, newest first, each joined with store name and the approval
 * chain's current stage (none/supervisor/rsm/headoffice + status), so a
 * merchandiser can see what they've already submitted and where it stands.
 */
function getMyVisits_(auth) {
  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  const visits = sheetToObjects_(visitsSheet).filter((v) => v.merchandiserId === auth.userId);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const storeById = {};
  sheetToObjects_(storesSheet).forEach((s) => (storeById[s.storeId] = s));

  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const verificationByVisitId = {};
  sheetToObjects_(verificationsSheet).forEach((v) => (verificationByVisitId[v.visitId] = v));

  const result = visits
    .sort((a, b) => (a.checkInTime > b.checkInTime ? -1 : 1))
    .map((v) => {
      const verification = verificationByVisitId[v.visitId];
      let stage = 'Menunggu Verifikasi Supervisor';
      if (verification) {
        if (verification.headOfficeStatus === 'approved') stage = 'Disetujui Final (Head Office)';
        else if (verification.headOfficeStatus === 'sent_back') stage = 'Dikirim Balik oleh Head Office';
        else if (verification.rsmStatus === 'approved') stage = 'Menunggu Persetujuan Head Office';
        else if (verification.rsmStatus === 'sent_back') stage = 'Dikirim Balik oleh RSM';
        else if (verification.status === 'approved') stage = 'Menunggu Review RSM';
        else if (verification.status === 'revision_requested') stage = 'Perlu Revisi (Supervisor)';
        else stage = 'Sudah Diverifikasi Supervisor';
      }
      return {
        visitId: v.visitId,
        storeId: v.storeId,
        storeName: storeById[v.storeId] ? storeById[v.storeId].name : v.storeId,
        checkInTime: v.checkInTime,
        stage: stage,
      };
    });

  return { ok: true, visits: result };
}

function findVisitRow_(sheet, visitId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = headers.indexOf('visitId');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idx] === visitId) {
      return { rowNumber: r + 1, headers: headers };
    }
  }
  return null;
}

/**
 * action: "submitVisit" — creates or updates one visit row (upsert by
 * client-generated visitId, so offline retries never duplicate a row).
 *
 * body: {
 *   token, visitId, storeId, journeyPlanId, checkInTime, status,
 *   availability: { sku: {available, cartonQty, pcsQty}, ... },
 *   stockTake: { sku: count, ... },
 *   shelfPhotos: [{ packtype, photo: {base64, mimeType} }, ...],
 *   secondaryDisplayCount: number,
 *   secondaryDisplayPhotos: [{base64, mimeType}, ...],
 * }
 */
function submitVisit_(auth, body) {
  if (!body.visitId || !body.storeId) {
    return { ok: false, error: 'visitId and storeId are required' };
  }

  const sheet = getSheet_(SHEET_NAMES.VISITS);
  const existing = findVisitRow_(sheet, body.visitId);

  function existingValue(field) {
    return existing ? sheet.getRange(existing.rowNumber, existing.headers.indexOf(field) + 1).getValue() : '';
  }

  const checkInTime = body.checkInTime || new Date().toISOString();
  const visitDateStr = checkInTime.slice(0, 10); // "2026-09-07" from an ISO string

  // Shelf photos: one per pack type. Re-saves only the ones sent with new
  // base64 data (offline retries of an already-synced visit won't resend
  // photo bytes), keeping any previously-saved URLs for the rest.
  let shelfPhotos = [];
  try {
    shelfPhotos = JSON.parse(existingValue('shelfPhotosJson') || '[]');
  } catch (e) {
    shelfPhotos = [];
  }
  if (Array.isArray(body.shelfPhotos)) {
    body.shelfPhotos.forEach((entry) => {
      if (!entry.photo || !entry.photo.base64) return;
      const url = savePhoto_(body.storeId, visitDateStr, body.visitId, entry.packtype, entry.photo.base64, entry.photo.mimeType);
      const idx = shelfPhotos.findIndex((p) => p.packtype === entry.packtype);
      const newEntry = { packtype: entry.packtype, photoUrl: url };
      if (idx === -1) shelfPhotos.push(newEntry);
      else shelfPhotos[idx] = newEntry;
    });
  }

  let secondaryDisplayPhotos = [];
  try {
    secondaryDisplayPhotos = JSON.parse(existingValue('secondaryDisplayPhotosJson') || '[]');
  } catch (e) {
    secondaryDisplayPhotos = [];
  }
  if (Array.isArray(body.secondaryDisplayPhotos) && body.secondaryDisplayPhotos.length > 0) {
    secondaryDisplayPhotos = body.secondaryDisplayPhotos.map((photo, i) =>
      photo && photo.base64
        ? savePhoto_(body.storeId, visitDateStr, body.visitId, 'secondary-' + (i + 1), photo.base64, photo.mimeType)
        : secondaryDisplayPhotos[i] || ''
    );
  }

  const rowValues = {
    visitId: body.visitId,
    merchandiserId: auth.userId,
    storeId: body.storeId,
    journeyPlanId: body.journeyPlanId || '',
    checkInTime: checkInTime,
    status: body.status || 'submitted',
    availabilityJson: JSON.stringify(body.availability || {}),
    stockTakeJson: JSON.stringify(body.stockTake || {}),
    primaryPhotoUrl: existingValue('primaryPhotoUrl'), // deprecated, untouched
    secondaryPhotoUrl: existingValue('secondaryPhotoUrl'), // deprecated, untouched
    syncedAt: new Date().toISOString(),
    shelfPhotosJson: JSON.stringify(shelfPhotos),
    secondaryDisplayCount: body.secondaryDisplayCount || 0,
    secondaryDisplayPhotosJson: JSON.stringify(secondaryDisplayPhotos),
  };

  if (existing) {
    writeRowByHeaders_(sheet, existing.rowNumber, rowValues);
  } else {
    appendRowByHeaders_(sheet, rowValues);
  }

  return { ok: true, visitId: body.visitId, shelfPhotos: shelfPhotos, secondaryDisplayPhotos: secondaryDisplayPhotos };
}
