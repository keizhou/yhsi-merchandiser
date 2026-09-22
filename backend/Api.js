/**
 * Single Web App entry point. All requests are routed by an `action` field
 * so the deployed URL never has to change as we add endpoints.
 *
 * GET  ?action=ping                                  -> connectivity test, no auth
 * GET  ?action=getProducts&token=...                 -> product catalog
 * GET  ?action=getJourneyPlan&token=...&week=...      -> this merchandiser's visits
 * POST { action: "login", username, pin }             -> { token, user }
 * POST { action: "submitVisit", token, ... }           -> upsert one visit
 *
 * Management screens (supervisor/manager/headoffice/admin only):
 * GET  ?action=getAreas&token=...
 * GET  ?action=getStores&token=...
 * GET  ?action=getMerchandisers&token=...
 * GET  ?action=getStoreProducts&token=...&storeId=...
 * POST { action: "setStoreProducts", token, storeId, items }
 * POST { action: "createStore", token, name, address, channel, packTypes, areaId }
 * POST { action: "createPendingMerchandiser", token, name, areaId } (no login until admin activates it)
 * POST { action: "assignMerchandiserStores", token, userId, storeIds }
 * GET  ?action=getDashboardSummary&token=...&startDate=...&endDate=...&storeId=...
 * GET  ?action=getStorePackTypes&token=...&storeId=...
 * GET  ?action=getVisitsForVerification&token=...&startDate=...&endDate=...&storeId=...
 * POST { action: "submitVerification", token, visitId, ... }
 *
 * RSM approval (manager/headoffice/admin only):
 * GET  ?action=getVisitsForRsmReview&token=...&startDate=...&endDate=...&storeId=...
 * POST { action: "submitRsmReview", token, visitId, rsmStatus, rsmNotes }
 *
 * Head Office final approval (headoffice/admin only):
 * GET  ?action=getVisitsForHeadOfficeReview&token=...&startDate=...&endDate=...&storeId=...
 * POST { action: "submitHeadOfficeReview", token, visitId, headOfficeStatus, headOfficeNotes }
 *
 * GET  ?action=getPhoto&fileId=...  -> serves a Drive image directly (for <img> tags),
 *   no auth token, the underlying Drive file is already "anyone with link can view"
 */

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;

  try {
    if (action === 'getPhoto') {
      // Apps Script's doGet can only return TextOutput/HtmlOutput, raw
      // binary isn't a supported return type, so this returns a base64
      // data URI as JSON (same reliable pattern as every other endpoint),
      // and the frontend sets that directly as an <img> src.
      const blob = DriveApp.getFileById(params.fileId).getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      return jsonOutput_({ ok: true, dataUri: 'data:' + blob.getContentType() + ';base64,' + base64 });
    }
    if (action === 'ping') {
      return jsonOutput_({ ok: true, message: 'pong', time: new Date().toISOString() });
    }
    if (action === 'getProducts') {
      requireAuth_(params.token);
      return jsonOutput_(getProducts_());
    }
    if (action === 'getJourneyPlan') {
      const auth = requireAuth_(params.token);
      return jsonOutput_(getJourneyPlan_(auth, params));
    }
    if (action === 'getAreas') {
      return jsonOutput_(getAreas_(requireAuth_(params.token)));
    }
    if (action === 'getStores') {
      return jsonOutput_(getStores_(requireAuth_(params.token)));
    }
    if (action === 'getMerchandisers') {
      return jsonOutput_(getMerchandisers_(requireAuth_(params.token)));
    }
    if (action === 'getStoreProducts') {
      return jsonOutput_(getStoreProducts_(requireAuth_(params.token), params));
    }
    if (action === 'getDashboardSummary') {
      return jsonOutput_(getDashboardSummary_(requireAuth_(params.token), params));
    }
    if (action === 'getStorePackTypes') {
      requireAuth_(params.token);
      return jsonOutput_(getStorePackTypes_(params));
    }
    if (action === 'getVisitsForVerification') {
      return jsonOutput_(getVisitsForVerification_(requireAuth_(params.token), params));
    }
    if (action === 'getVisitsForRsmReview') {
      return jsonOutput_(getVisitsForRsmReview_(requireAuth_(params.token), params));
    }
    if (action === 'getVisitsForHeadOfficeReview') {
      return jsonOutput_(getVisitsForHeadOfficeReview_(requireAuth_(params.token), params));
    }
    return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return handleError_(err);
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'invalid JSON body' });
  }

  const action = body.action;

  try {
    if (action === 'login') {
      return jsonOutput_(handleLogin_(body));
    }
    if (action === 'submitVisit') {
      const auth = requireAuth_(body.token);
      // Serialize visit writes so concurrent submissions from different
      // merchandisers can't race on appendRow/row lookups.
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(submitVisit_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'setStoreProducts') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(setStoreProducts_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'submitVerification') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(submitVerification_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'submitRsmReview') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(submitRsmReview_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'submitHeadOfficeReview') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(submitHeadOfficeReview_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'createStore') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(createStore_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'createPendingMerchandiser') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(createPendingMerchandiser_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'assignMerchandiserStores') {
      const auth = requireAuth_(body.token);
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        return jsonOutput_(assignMerchandiserStores_(auth, body));
      } finally {
        lock.releaseLock();
      }
    }
    return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return handleError_(err);
  }
}

function handleError_(err) {
  if (err && err.name === 'AuthError') {
    return jsonOutput_({ ok: false, error: 'unauthorized' });
  }
  Logger.log('Unhandled error: %s', err && err.stack ? err.stack : err);
  return jsonOutput_({ ok: false, error: 'server error' });
}
