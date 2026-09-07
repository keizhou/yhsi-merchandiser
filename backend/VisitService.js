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
 *   availability: { sku: true|false, ... },
 *   stockTake: { sku: count, ... },
 *   primaryPhoto: { base64, mimeType } | null,
 *   secondaryPhoto: { base64, mimeType } | null,
 * }
 */
function submitVisit_(auth, body) {
  if (!body.visitId || !body.storeId) {
    return { ok: false, error: 'visitId and storeId are required' };
  }

  const sheet = getSheet_(SHEET_NAMES.VISITS);
  const existing = findVisitRow_(sheet, body.visitId);

  let primaryPhotoUrl = existing ? sheet.getRange(existing.rowNumber, existing.headers.indexOf('primaryPhotoUrl') + 1).getValue() : '';
  let secondaryPhotoUrl = existing ? sheet.getRange(existing.rowNumber, existing.headers.indexOf('secondaryPhotoUrl') + 1).getValue() : '';

  const checkInTime = body.checkInTime || new Date().toISOString();
  const visitDateStr = checkInTime.slice(0, 10); // "2026-09-07" from an ISO string

  if (body.primaryPhoto && body.primaryPhoto.base64) {
    primaryPhotoUrl = savePhoto_(body.storeId, visitDateStr, body.visitId, 'primary', body.primaryPhoto.base64, body.primaryPhoto.mimeType);
  }
  if (body.secondaryPhoto && body.secondaryPhoto.base64) {
    secondaryPhotoUrl = savePhoto_(body.storeId, visitDateStr, body.visitId, 'secondary', body.secondaryPhoto.base64, body.secondaryPhoto.mimeType);
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
    primaryPhotoUrl: primaryPhotoUrl,
    secondaryPhotoUrl: secondaryPhotoUrl,
    syncedAt: new Date().toISOString(),
  };

  const orderedValues = SHEET_HEADERS.Visits.map((h) => rowValues[h]);

  if (existing) {
    sheet.getRange(existing.rowNumber, 1, 1, orderedValues.length).setValues([orderedValues]);
  } else {
    sheet.appendRow(orderedValues);
  }

  return { ok: true, visitId: body.visitId, primaryPhotoUrl: primaryPhotoUrl, secondaryPhotoUrl: secondaryPhotoUrl };
}
