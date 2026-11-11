import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './session.jsx';
import { Spinner, cx } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import LogLead from './pages/LogLead.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';

// Agency-only screens load separately, so staff phones download less.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const AdData = lazy(() => import('./pages/AdData.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const NAV = {
  staff: [
    { to: '/', label: 'Log lead', icon: 'plus' },
    { to: '/leads', label: 'Leads', icon: 'list' },
  ],
  agency: [
    { to: '/', label: 'Dashboard', icon: 'chart' },
    { to: '/leads', label: 'Leads', icon: 'list' },
    { to: '/ad-data', label: 'Ad data', icon: 'money' },
    { to: '/settings', label: 'Settings', icon: 'gear' },
  ],
};

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M6 20V12M12 20V6M18 20v-5',
  money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Shell({ role, signOut, children }) {
  const items = NAV[role];
  return (
    <div className="min-h-dvh">
      {/* Laptop: top bar */}
      <header className="sticky top-0 z-30 hidden border-b border-line bg-page/95 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <span className="font-semibold">AVM Leads</span>
          <nav className="flex gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cx('rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:text-ink')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={signOut} className="ml-auto text-sm text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      </header>

      <main className={cx('mx-auto px-4 pb-28 pt-5 md:px-6 md:pb-12 md:pt-8', role === 'agency' ? 'max-w-5xl' : 'max-w-xl')}>
        {children}
      </main>

      {/* Phone: bottom bar */}
      <nav className="bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cx('flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const { loading, role, signOut } = useSession();
  if (loading) return <Spinner />;
  if (!role) return <Login />;

  return (
    <Shell role={role} signOut={signOut}>
      <Suspense fallback={<Spinner />}>
        <Routes>
          {role === 'staff' ? (
            <Route path="/" element={<LogLead />} />
          ) : (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log" element={<LogLead />} />
              <Route path="/ad-data" element={<AdData />} />
              <Route path="/settings" element={<Settings />} />
            </>
          )}
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
