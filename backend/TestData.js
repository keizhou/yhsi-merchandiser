/**
 * Seeds a few sample stores and a journey plan for the "admin" test user,
 * just so the Journey Plan screen has something real to show while we
 * build the rest of the app. Replace with your real store list before
 * going live, this is throwaway test data.
 */
function seedTestJourneyPlan() {
  const storesSheet = getSheet_(SHEET_NAMES.STORES);
  const stores = [
    ['STORE-001', 'Toko Sumber Rejeki', 'Jl. Merdeka No. 12, Jakarta', 'General Trade', 'Can,Tetra,PET'],
    ['STORE-002', 'Indomaret Jl. Sudirman', 'Jl. Sudirman No. 45, Jakarta', 'Modern Trade', 'Can,Tetra'],
    ['STORE-003', 'Alfamart Jl. Gatot Subroto', 'Jl. Gatot Subroto No. 8, Jakarta', 'Modern Trade', 'Can,PET'],
  ];
  storesSheet.getRange(2, 1, stores.length, stores[0].length).setValues(stores);

  const usersSheet = getSheet_(SHEET_NAMES.USERS);
  const users = usersSheet.getDataRange().getValues();
  const headers = users[0];
  const usernameIdx = headers.indexOf('username');
  const userIdIdx = headers.indexOf('userId');
  const adminRow = users.find((row, i) => i > 0 && row[usernameIdx] === 'admin');
  if (!adminRow) {
    throw new Error('Run createTestUser() first.');
  }
  const merchandiserId = adminRow[userIdIdx];

  const today = new Date();
  const week = Utilities.formatDate(today, Session.getScriptTimeZone(), 'YYYY-\'W\'ww');

  const plansSheet = getSheet_(SHEET_NAMES.JOURNEY_PLANS);
  const plans = stores.map((store, i) => {
    const plannedDate = new Date(today);
    plannedDate.setDate(today.getDate() + i);
    return [
      Utilities.getUuid(),
      merchandiserId,
      week,
      store[0],
      Utilities.formatDate(plannedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    ];
  });
  plansSheet.getRange(2, 1, plans.length, plans[0].length).setValues(plans);

  Logger.log('Seeded %s stores and %s journey plan entries for admin.', stores.length, plans.length);
}
