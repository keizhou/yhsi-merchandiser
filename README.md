# Merchandiser App

A Progressive Web App for field merchandisers: login, journey plan, product
availability checklist, stock take, and primary/secondary shelf photos.
Built to run at $0 cost.

## Stack

- **Backend**: Google Apps Script (Web App) + Google Sheets (database) + Google Drive (shelf photos)
- **Frontend**: Vite + React, installable as a PWA, offline-first (IndexedDB queue for submissions made with no signal)
- **Hosting**: GitHub Pages

## Folders

- `backend/` — Apps Script project (push/deploy via [clasp](https://github.com/google/clasp))
- `frontend/` — the PWA (Vite + React)

## Backend setup (one-time)

1. `cd backend && clasp push`
2. In the Apps Script editor, run `initializeSheets`, then `createTestUser`, then `installPhotoCleanupTrigger` once each
3. `clasp deploy` to get a Web App URL, put it in `frontend/.env` as `VITE_APPS_SCRIPT_URL`

## Frontend dev

```
cd frontend
npm install
npm run dev
```

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`.
