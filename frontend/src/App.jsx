import { useState } from 'react';
import Login from './pages/Login';
import JourneyPlan from './pages/JourneyPlan';
import VisitForm from './pages/VisitForm';
import SyncIndicator from './components/SyncIndicator';
import { getSession, clearSession } from './lib/api';

function App() {
  const [session, setSession] = useState(() => getSession());
  const [selectedVisit, setSelectedVisit] = useState(null);

  if (!session) {
    return <Login onLoggedIn={(user) => setSession({ user })} />;
  }

  return (
    <div style={{ maxWidth: 480, margin: '24px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>{session.user.name}</div>
          <div style={{ fontSize: 13, color: '#555' }}>{session.user.role}</div>
        </div>
        <button
          onClick={() => {
            clearSession();
            setSession(null);
          }}
          style={{ padding: '6px 12px' }}
        >
          Keluar
        </button>
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

export default App;
