import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import JourneyPlan from './pages/JourneyPlan';
import VisitForm from './pages/VisitForm';
import SyncIndicator from './components/SyncIndicator';
import NavShell from './components/NavShell';
import ThemeToggle from './components/ThemeToggle';
import Dashboard from './pages/Dashboard';
import Merchandisers from './pages/Merchandisers';
import Stores from './pages/Stores';
import StoreProfile from './pages/StoreProfile';
import Verification from './pages/Verification';
import RsmReview from './pages/RsmReview';
import HeadOfficeReview from './pages/HeadOfficeReview';
import { getSession, clearSession } from './lib/api';

function MerchandiserApp({ user, onLogout }) {
  const [selectedVisit, setSelectedVisit] = useState(null);

  return (
    <div style={{ maxWidth: 480, margin: '24px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>{user.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.role}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ThemeToggle />
          <button
            onClick={() => {
              clearSession();
              onLogout();
            }}
            style={{ padding: '6px 12px' }}
          >
            Keluar
          </button>
        </div>
      </div>

      <SyncIndicator />

      {selectedVisit ? (
        <div>
          <button onClick={() => setSelectedVisit(null)} style={{ marginBottom: 12 }}>
            &larr; Kembali ke rencana kunjungan
          </button>
          <VisitForm visit={selectedVisit} onDone={() => setSelectedVisit(null)} />
        </div>
      ) : (
        <JourneyPlan onSelectStore={setSelectedVisit} />
      )}
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => getSession());

  if (!session) {
    return <Login onLoggedIn={(user) => setSession({ user })} />;
  }

  if (session.user.role === 'merchandiser') {
    return <MerchandiserApp user={session.user} onLogout={() => setSession(null)} />;
  }

  // supervisor / manager / headoffice / admin get the management shell
  return (
    <HashRouter>
      <Routes>
        <Route element={<NavShell user={session.user} onLogout={() => setSession(null)} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/merchandisers" element={<Merchandisers />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/stores/:storeId" element={<StoreProfile />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/rsm-review" element={<RsmReview />} />
          <Route path="/head-office-review" element={<HeadOfficeReview />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
