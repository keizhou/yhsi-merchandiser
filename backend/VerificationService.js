/**
 * Supervisor verification workflow: reviewing each visit against Stock
 * Availability/OOS, Facing vs. target, Planogram, POSM, and Eye Level,
 * with photo evidence per pack-type shelf photo. One VisitVerifications
 * row per visit, upserted by visitId (same pattern as Visits itself).
 */

function findVerificationRow_(sheet, visitId) {
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
 * action: "getVisitsForVerification" — { token, startDate?, endDate?, storeId? }
 * Returns visits (scoped to the caller's areas) in the given range, each
 * joined with its store name, product facing targets, and existing
 * verification row if one exists.
 */
function getVisitsForVerification_(auth, params) {
  requireManagementRole_(auth);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));

  const productsSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  const products = sheetToObjects_(productsSheet);
  const productBySku = {};
  products.forEach((p) => (productBySku[p.sku] = p));

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  let visits = sheetToObjects_(visitsSheet);
  visits = filterByScopedAreas_(visits, auth, storeById);

  if (params.storeId) visits = visits.filter((v) => v.storeId === params.storeId);
  if (params.startDate) visits = visits.filter((v) => v.checkInTime >= params.startDate);
  if (params.endDate) visits = visits.filter((v) => v.checkInTime < params.endDate + 'T23:59:59.999Z');

  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const verifications = sheetToObjects_(verificationsSheet);
  const verificationByVisitId = {};
  verifications.forEach((v) => (verificationByVisitId[v.visitId] = v));

  const result = visits
    .sort((a, b) => (a.checkInTime > b.checkInTime ? -1 : 1))
    .map((v) => {
      let availability = {};
      let stockTake = {};
      let shelfPhotos = [];
      let secondaryDisplayPhotos = [];
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
      try {
        secondaryDisplayPhotos = JSON.parse(v.secondaryDisplayPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }

      const facing = Object.keys(stockTake).map((sku) => ({
        sku: sku,
        name: productBySku[sku] ? productBySku[sku].name : sku,
        facing: stockTake[sku],
        target: (productBySku[sku] && productBySku[sku].expectedFacing) || 1,
      }));

      // Detailed per-SKU availability, not just a count, so a supervisor
      // can see exactly which products were OOS, not just "8 of 24".
      const availabilityDetail = Object.keys(availability).map((sku) => {
        const entry = availability[sku];
        const isAvailable = typeof entry === 'object' ? entry.available : !!entry;
        return {
          sku: sku,
          name: productBySku[sku] ? productBySku[sku].name : sku,
          available: isAvailable,
          cartonQty: typeof entry === 'object' ? entry.cartonQty : '',
          pcsQty: typeof entry === 'object' ? entry.pcsQty : '',
        };
      });

      return {
        visitId: v.visitId,
        storeId: v.storeId,
        storeName: storeById[v.storeId] ? storeById[v.storeId].name : v.storeId,
        checkInTime: v.checkInTime,
        availability: availability,
        availabilityDetail: availabilityDetail,
        facing: facing,
        shelfPhotos: shelfPhotos,
        secondaryDisplayCount: v.secondaryDisplayCount || 0,
        secondaryDisplayPhotos: secondaryDisplayPhotos,
        verification: verificationByVisitId[v.visitId] || null,
      };
    });

  return { ok: true, visits: result };
}

/**
 * action: "submitVerification" — { token, visitId, planogram, posm, eyeLevel, notes, status }
 * Upserts one VisitVerifications row by visitId.
 *
 * OOS and Facing are plain information for the supervisor (nothing to
 * approve or revise there, see AdminService.js's file header), so this
 * doesn't collect anything structured for them, any issue found goes in
 * the free-text `notes` instead. The oosStatus/facingRevisionsJson columns
 * stay in the sheet (unused going forward) rather than doing a destructive
 * schema change.
 */
function submitVerification_(auth, body) {
  requireManagementRole_(auth);
  if (!body.visitId) {
    return { ok: false, error: 'visitId is required' };
  }

  const sheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const existing = findVerificationRow_(sheet, body.visitId);

  const rowValues = {
    verificationId: existing ? sheet.getRange(existing.rowNumber, existing.headers.indexOf('verificationId') + 1).getValue() : Utilities.getUuid(),
    visitId: body.visitId,
    verifiedBy: auth.userId,
    verifiedAt: new Date().toISOString(),
    planogramJson: JSON.stringify(body.planogram || {}),
    posmJson: JSON.stringify(body.posm || {}),
    eyeLevelJson: JSON.stringify(body.eyeLevel || {}),
    notes: body.notes || '',
    status: body.status || 'approved',
  };

  if (existing) {
    writeRowByHeaders_(sheet, existing.rowNumber, rowValues);
  } else {
    appendRowByHeaders_(sheet, rowValues);
  }

  return { ok: true, visitId: body.visitId, verificationId: rowValues.verificationId };
}

/**
 * action: "getVisitsForRsmReview" — { token, startDate?, endDate?, storeId? }
 * Same shape as getVisitsForVerification_, but restricted to RSM roles
 * (manager/headoffice/admin, see requireRsmRole_), scoped to the caller's
 * whole region (getScopedAreaIds_ expands a manager's region into every
 * area within it), and only includes visits a supervisor has already
 * verified, an RSM reviews completed supervisor work, not raw visits.
 */
function getVisitsForRsmReview_(auth, params) {
  requireRsmRole_(auth);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  let visits = sheetToObjects_(visitsSheet);
  visits = filterByScopedAreas_(visits, auth, storeById);

  if (params.storeId) visits = visits.filter((v) => v.storeId === params.storeId);
  if (params.startDate) visits = visits.filter((v) => v.checkInTime >= params.startDate);
  if (params.endDate) visits = visits.filter((v) => v.checkInTime < params.endDate + 'T23:59:59.999Z');

  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const verificationByVisitId = {};
  sheetToObjects_(verificationsSheet).forEach((v) => (verificationByVisitId[v.visitId] = v));

  // Only visits the supervisor has actually verified belong in an RSM's queue.
  visits = visits.filter((v) => verificationByVisitId[v.visitId]);

  const result = visits
    .sort((a, b) => (a.checkInTime > b.checkInTime ? -1 : 1))
    .map((v) => {
      let shelfPhotos = [];
      let secondaryDisplayPhotos = [];
      try {
        shelfPhotos = JSON.parse(v.shelfPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }
      try {
        secondaryDisplayPhotos = JSON.parse(v.secondaryDisplayPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }

      const verification = verificationByVisitId[v.visitId];
      let planogram = {};
      let posm = {};
      let eyeLevel = {};
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

      return {
        visitId: v.visitId,
        storeId: v.storeId,
        storeName: storeById[v.storeId] ? storeById[v.storeId].name : v.storeId,
        checkInTime: v.checkInTime,
        secondaryDisplayCount: v.secondaryDisplayCount || 0,
        secondaryDisplayPhotos: secondaryDisplayPhotos,
        shelfPhotos: shelfPhotos.map((sp) => ({
          packtype: sp.packtype,
          photoUrl: sp.photoUrl,
          planogram: typeof planogram[sp.packtype] === 'boolean' ? planogram[sp.packtype] : null,
          posm: typeof posm[sp.packtype] === 'boolean' ? posm[sp.packtype] : null,
          eyeLevel: typeof eyeLevel[sp.packtype] === 'boolean' ? eyeLevel[sp.packtype] : null,
        })),
        supervisorStatus: verification.status,
        supervisorNotes: verification.notes || '',
        rsmStatus: verification.rsmStatus || 'pending',
        rsmNotes: verification.rsmNotes || '',
      };
    });

  return { ok: true, visits: result };
}

/**
 * action: "submitRsmReview" — { token, visitId, rsmStatus, rsmNotes }
 * Updates the existing VisitVerifications row (must already exist, this
 * never creates one, an RSM only reviews already-supervisor-verified
 * visits).
 */
function submitRsmReview_(auth, body) {
  requireRsmRole_(auth);
  if (!body.visitId) {
    return { ok: false, error: 'visitId is required' };
  }

  const sheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const existing = findVerificationRow_(sheet, body.visitId);
  if (!existing) {
    return { ok: false, error: 'no supervisor verification exists yet for this visit' };
  }

  // Re-check the visit's store actually falls within this RSM's scoped region.
  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  const visit = sheetToObjects_(visitsSheet).find((v) => v.visitId === body.visitId);
  if (visit) {
    const storesSheet = getSheet_(SHEET_NAMES.STORES);
    const store = sheetToObjects_(storesSheet).find((s) => s.storeId === visit.storeId);
    const scoped = getScopedAreaIds_(auth);
    if (scoped !== null && (!store || scoped.indexOf(store.areaId) === -1)) {
      throw new AuthError_('unauthorized');
    }
  }

  const currentValues = sheet.getRange(existing.rowNumber, 1, 1, existing.headers.length).getValues()[0];
  const current = {};
  existing.headers.forEach((h, i) => (current[h] = currentValues[i]));

  const rowValues = Object.assign({}, current, {
    rsmStatus: body.rsmStatus || 'pending',
    rsmBy: auth.userId,
    rsmAt: new Date().toISOString(),
    rsmNotes: body.rsmNotes || '',
  });

  writeRowByHeaders_(sheet, existing.rowNumber, rowValues);

  return { ok: true, visitId: body.visitId };
}

/**
 * action: "getVisitsForHeadOfficeReview" — { token, startDate?, endDate?, storeId? }
 * Same shape as getVisitsForRsmReview_, but restricted to Head Office roles
 * (headoffice/admin, see requireHeadOfficeRole_), unscoped (they already
 * see every region), and only includes visits an RSM has already acted on
 * (rsmStatus is "approved" or "sent_back", not "pending"), Head Office
 * reviews completed RSM work, not raw supervisor-verified visits.
 */
function getVisitsForHeadOfficeReview_(auth, params) {
  requireHeadOfficeRole_(auth);

  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = sheetToObjects_(storesSheet);
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));

  const visitsSheet = getSheet_(SHEET_NAMES.VISITS);
  let visits = sheetToObjects_(visitsSheet);
  visits = filterByScopedAreas_(visits, auth, storeById);

  if (params.storeId) visits = visits.filter((v) => v.storeId === params.storeId);
  if (params.startDate) visits = visits.filter((v) => v.checkInTime >= params.startDate);
  if (params.endDate) visits = visits.filter((v) => v.checkInTime < params.endDate + 'T23:59:59.999Z');

  const verificationsSheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const verificationByVisitId = {};
  sheetToObjects_(verificationsSheet).forEach((v) => (verificationByVisitId[v.visitId] = v));

  // Only visits an RSM has actually acted on belong in a Head Office queue.
  visits = visits.filter((v) => {
    const verification = verificationByVisitId[v.visitId];
    return verification && (verification.rsmStatus === 'approved' || verification.rsmStatus === 'sent_back');
  });

  const result = visits
    .sort((a, b) => (a.checkInTime > b.checkInTime ? -1 : 1))
    .map((v) => {
      let shelfPhotos = [];
      let secondaryDisplayPhotos = [];
      try {
        shelfPhotos = JSON.parse(v.shelfPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }
      try {
        secondaryDisplayPhotos = JSON.parse(v.secondaryDisplayPhotosJson || '[]');
      } catch (e) {
        /* leave empty */
      }

      const verification = verificationByVisitId[v.visitId];
      let planogram = {};
      let posm = {};
      let eyeLevel = {};
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

      return {
        visitId: v.visitId,
        storeId: v.storeId,
        storeName: storeById[v.storeId] ? storeById[v.storeId].name : v.storeId,
        checkInTime: v.checkInTime,
        secondaryDisplayCount: v.secondaryDisplayCount || 0,
        secondaryDisplayPhotos: secondaryDisplayPhotos,
        shelfPhotos: shelfPhotos.map((sp) => ({
          packtype: sp.packtype,
          photoUrl: sp.photoUrl,
          planogram: typeof planogram[sp.packtype] === 'boolean' ? planogram[sp.packtype] : null,
          posm: typeof posm[sp.packtype] === 'boolean' ? posm[sp.packtype] : null,
          eyeLevel: typeof eyeLevel[sp.packtype] === 'boolean' ? eyeLevel[sp.packtype] : null,
        })),
        supervisorStatus: verification.status,
        supervisorNotes: verification.notes || '',
        rsmStatus: verification.rsmStatus,
        rsmNotes: verification.rsmNotes || '',
        headOfficeStatus: verification.headOfficeStatus || 'pending',
        headOfficeNotes: verification.headOfficeNotes || '',
      };
    });

  return { ok: true, visits: result };
}

/**
 * action: "submitHeadOfficeReview" — { token, visitId, headOfficeStatus, headOfficeNotes }
 * Updates the existing VisitVerifications row (must already have an RSM
 * decision, this never creates one and never acts before the RSM has).
 */
function submitHeadOfficeReview_(auth, body) {
  requireHeadOfficeRole_(auth);
  if (!body.visitId) {
    return { ok: false, error: 'visitId is required' };
  }

  const sheet = getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS);
  const existing = findVerificationRow_(sheet, body.visitId);
  if (!existing) {
    return { ok: false, error: 'no supervisor verification exists yet for this visit' };
  }

  const currentValues = sheet.getRange(existing.rowNumber, 1, 1, existing.headers.length).getValues()[0];
  const current = {};
  existing.headers.forEach((h, i) => (current[h] = currentValues[i]));

  if (current.rsmStatus !== 'approved' && current.rsmStatus !== 'sent_back') {
    return { ok: false, error: 'RSM has not reviewed this visit yet' };
  }

  const rowValues = Object.assign({}, current, {
    headOfficeStatus: body.headOfficeStatus || 'pending',
    headOfficeBy: auth.userId,
    headOfficeAt: new Date().toISOString(),
    headOfficeNotes: body.headOfficeNotes || '',
  });

  writeRowByHeaders_(sheet, existing.rowNumber, rowValues);

  return { ok: true, visitId: body.visitId };
}
