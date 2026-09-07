/**
 * Single Web App entry point. All requests are routed by an `action` field
 * so the deployed URL never has to change as we add endpoints.
 *
 * GET  ?action=ping                                  -> connectivity test, no auth
 * GET  ?action=getProducts&token=...                 -> product catalog
 * GET  ?action=getJourneyPlan&token=...&week=...      -> this merchandiser's visits
 * POST { action: "login", username, pin }             -> { token, user }
 * POST { action: "submitVisit", token, ... }           -> upsert one visit
 */

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action;

  try {
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
