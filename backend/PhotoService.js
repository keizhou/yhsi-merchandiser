/**
 * Saves shelf photos to Drive and cleans up old ones so we don't blow
 * past the 15GB free quota on a personal Gmail account.
 *
 * Folder layout: MerchandiserPhotos / {Store Name} / {visit date} / photo files
 */

function getRootPhotoFolder_() {
  const root = DriveApp.getRootFolder();
  const it = root.getFoldersByName(PHOTO_FOLDER_NAME);
  if (it.hasNext()) {
    return it.next();
  }
  return root.createFolder(PHOTO_FOLDER_NAME);
}

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) {
    return it.next();
  }
  return parent.createFolder(name);
}

// Drive is fine with most characters in folder names, but strip the ones
// that read badly or hint at path separators, just to be safe.
function sanitizeFolderName_(name) {
  return String(name || 'Unknown').replace(/[\/\\:*?"<>|]/g, '-').trim() || 'Unknown';
}

function getStoreName_(storeId) {
  const sheet = getSheet_(SHEET_NAMES.STORES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('storeId');
  const nameIdx = headers.indexOf('name');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === storeId) {
      return data[r][nameIdx] || storeId;
    }
  }
  return storeId;
}

function getVisitPhotoFolder_(storeId, dateStr) {
  const root = getRootPhotoFolder_();
  const storeFolder = getOrCreateSubfolder_(root, sanitizeFolderName_(getStoreName_(storeId)));
  return getOrCreateSubfolder_(storeFolder, sanitizeFolderName_(dateStr));
}

/**
 * base64Data: raw base64 string (no "data:image/jpeg;base64," prefix)
 * mimeType: e.g. "image/jpeg"
 * dateStr: visit date, e.g. "2026-09-07" (used as the folder name)
 * Returns the file's shareable URL.
 */
function savePhoto_(storeId, dateStr, visitId, label, base64Data, mimeType) {
  const folder = getVisitPhotoFolder_(storeId, dateStr);
  const ext = mimeType && mimeType.indexOf('png') !== -1 ? 'png' : 'jpg';
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', visitId + '_' + label + '.' + ext);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/**
 * Scheduled cleanup: trashes shelf photos older than PHOTO_RETENTION_DAYS.
 * Install with installPhotoCleanupTrigger() (run once manually).
 */
function archiveOldPhotos() {
  const cutoff = new Date(Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const root = getRootPhotoFolder_();
  const storeFolders = root.getFolders();
  let trashedCount = 0;

  while (storeFolders.hasNext()) {
    const storeFolder = storeFolders.next();
    const dateFolders = storeFolder.getFolders();
    while (dateFolders.hasNext()) {
      const dateFolder = dateFolders.next();
      const files = dateFolder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        if (file.getDateCreated() < cutoff) {
          file.setTrashed(true);
          trashedCount++;
        }
      }
    }
  }
  Logger.log('Archived %s photo(s) older than %s days.', trashedCount, PHOTO_RETENTION_DAYS);
}

function installPhotoCleanupTrigger() {
  // Avoid duplicate triggers if this is run more than once.
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'archiveOldPhotos') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('archiveOldPhotos').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Installed daily photo cleanup trigger (runs ~3am).');
}
