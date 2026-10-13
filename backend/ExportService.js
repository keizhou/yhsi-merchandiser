/**
 * action: "exportMonth" — { token, month: "2026-10" }
 * Flattens one month of visits into three plain tables (no JSON cells) that
 * the app turns into CSV files:
 *   produk     one row per visit x SKU: available, cartons, pcs, expiry, facing, target
 *   foto       one row per shelf / secondary / competitor-activity photo, comments, skipped visits
 *   kompetitor one row per competitor name + price
 * Same area scoping as the Dashboard / Verifikasi. The month is judged on
 * the visit's local date (spreadsheet time zone), not UTC.
 */
function exportMonth_(auth, params) {
  requireManagementRole_(auth);
  const month = String(params.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must look like 2026-10');

  const tz = getSpreadsheet().getSpreadsheetTimeZone();
  const localDay = (iso) => Utilities.formatDate(new Date(iso), tz, 'yyyy-MM-dd');

  const stores = sheetToObjects_(getSheet_(SHEET_NAMES.STORES));
  const storeById = {};
  stores.forEach((s) => (storeById[s.storeId] = s));
  const productBySku = {};
  sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS)).forEach((p) => (productBySku[p.sku] = p));
  const userNameById = {};
  sheetToObjects_(getSheet_(SHEET_NAMES.USERS)).forEach((u) => (userNameById[u.userId] = u.name));
  const areaNameById = {};
  sheetToObjects_(getSheet_(SHEET_NAMES.AREAS)).forEach((a) => (areaNameById[a.areaId] = a.name));
  const verificationByVisitId = {};
  sheetToObjects_(getSheet_(SHEET_NAMES.VISIT_VERIFICATIONS)).forEach((v) => (verificationByVisitId[v.visitId] = v));

  let visits = sheetToObjects_(getSheet_(SHEET_NAMES.VISITS));
  visits = filterByScopedAreas_(visits, auth, storeById);
  visits = visits.filter((v) => v.checkInTime && localDay(v.checkInTime).slice(0, 7) === month);
  visits.sort((a, b) => (a.checkInTime > b.checkInTime ? 1 : -1));

  // The app stores photos as a Web App URL (?action=getPhoto&fileId=...), turn that into a plain Drive link.
  function driveLink(url) {
    const m = /fileId=([^&]+)/.exec(String(url || ''));
    return m ? 'https://drive.google.com/file/d/' + m[1] + '/view' : String(url || '');
  }
  function parse(json, fallback) {
    try {
      return JSON.parse(json || '') || fallback;
    } catch (e) {
      return fallback;
    }
  }

  const head = ['Tanggal', 'Merchandiser', 'Kode Toko', 'Nama Toko', 'Area', 'Status Verifikasi'];
  const produk = { headers: head.concat(['SKU', 'Pack', 'Tersedia', 'Carton', 'Pcs', 'Expired (Bulan-Tahun)', 'Facing', 'Target Facing']), rows: [] };
  const foto = { headers: head.concat(['Jenis', 'Nama', 'Link Foto', 'Komentar']), rows: [] };
  const kompetitor = { headers: head.concat(['Kompetitor', 'Harga (Rp)']), rows: [] };

  visits.forEach((v) => {
    const store = storeById[v.storeId] || {};
    const verification = verificationByVisitId[v.visitId];
    const statusText =
      v.status === 'not_visited'
        ? 'Tidak dikunjungi'
        : !verification
        ? 'Menunggu verifikasi'
        : verification.status === 'approved'
        ? 'Disetujui'
        : 'Perlu revisi';
    const base = [
      localDay(v.checkInTime),
      userNameById[v.merchandiserId] || v.merchandiserId,
      v.storeId,
      store.name || v.storeId,
      areaNameById[store.areaId] || store.areaId || '',
      statusText,
    ];

    if (v.status === 'not_visited') {
      foto.rows.push(base.concat(['Tidak dikunjungi', '', '', v.skipReason || '']));
      return;
    }

    // Products: every SKU the merchandiser reported, with its facing next to it.
    const availability = parse(v.availabilityJson, {});
    const stockTake = parse(v.stockTakeJson, {});
    const skus = Object.keys(availability);
    Object.keys(stockTake).forEach((sku) => {
      if (skus.indexOf(sku) === -1) skus.push(sku);
    });
    skus.forEach((sku) => {
      const a = availability[sku];
      const entry = typeof a === 'object' && a ? a : { available: !!a };
      const p = productBySku[sku] || {};
      const ed = entry.edMonth && entry.edYear ? entry.edMonth + '-' + entry.edYear : '';
      produk.rows.push(
        base.concat([
          p.name || sku,
          p.packtype || '',
          entry.available ? 'Ya' : 'Tidak',
          entry.available ? entry.cartonQty || 0 : '',
          entry.available ? entry.pcsQty || 0 : '',
          entry.available ? ed : '',
          stockTake[sku] === undefined ? '' : stockTake[sku],
          p.expectedFacing || '',
        ])
      );
    });

    // Photos + comments.
    parse(v.shelfPhotosJson, []).forEach((sp) =>
      foto.rows.push(base.concat(['Foto Rak', sp.packtype || '', driveLink(sp.photoUrl), '']))
    );
    parse(v.secondaryDisplayPhotosJson, []).forEach((url, i) =>
      foto.rows.push(base.concat(['Secondary Display', 'Secondary display #' + (i + 1), driveLink(url), '']))
    );
    parse(v.competitorActivitiesJson, []).forEach((act, i) =>
      foto.rows.push(base.concat(['Aktivitas Kompetitor', 'Aktivitas #' + (i + 1), driveLink(act.photoUrl), act.comment || '']))
    );
    [
      ['Komentar Ketersediaan', v.commentAvailability],
      ['Komentar Facing & Foto Rak', v.commentShelf],
      ['Komentar Secondary Display', v.commentSecondary],
    ].forEach((c) => {
      if (c[1]) foto.rows.push(base.concat([c[0], '', '', c[1]]));
    });

    // Competitor prices.
    parse(v.competitorPricesJson, []).forEach((c) => kompetitor.rows.push(base.concat([c.name || '', c.price || 0])));
  });

  return { ok: true, month: month, visitCount: visits.length, produk: produk, foto: foto, kompetitor: kompetitor };
}
