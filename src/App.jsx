import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ChartNoAxesColumnIcon, LogOutIcon, MegaphoneIcon, PlusIcon, SettingsIcon, UsersRoundIcon } from 'lucide-react';
import { useSession } from './session.jsx';
import { AvmLogo, AvmMark, BuiltBy, CmykBar } from '@/components/brand.jsx';
import { LoadingBlock } from '@/components/app.jsx';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/lib/useMediaQuery.js';
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
    { to: '/', label: 'Log lead', icon: PlusIcon },
    { to: '/leads', label: 'Leads', icon: UsersRoundIcon },
  ],
  agency: [
    { to: '/', label: 'Overview', icon: ChartNoAxesColumnIcon },
    { to: '/leads', label: 'Leads', icon: UsersRoundIcon },
    { to: '/ad-data', label: 'Ad data', icon: MegaphoneIcon },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ],
};

// On laptops staff work in the Leads table; the form stays one click away.
const SIDEBAR_NAV = {
  staff: [
    { to: '/leads', label: 'Leads', icon: UsersRoundIcon },
    { to: '/log', label: 'Log lead', icon: PlusIcon },
  ],
  agency: NAV.agency,
};

// Staff home: the table on laptops, the quick form on phones.
function StaffHome() {
  return useIsDesktop() ? <Navigate to="/leads" replace /> : <LogLead />;
}

function Sidebar({ role, signOut }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink text-ink-foreground md:flex">
      <CmykBar />
      <div className="px-6 pt-7 pb-8">
        <AvmLogo className="h-12" />
      </div>
      <p className="px-6 pb-2 text-[0.7rem] font-semibold tracking-[0.16em] text-ink-muted uppercase">
        {role === 'agency' ? 'Campaign desk' : 'Lead desk'}
      </p>
      <nav className="flex flex-col gap-0.5 px-3">
        {SIDEBAR_NAV[role].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors',
                isActive ? 'bg-sidebar-accent text-white' : 'text-ink-muted hover:bg-sidebar-accent/60 hover:text-ink-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand-cyan" />}
                <Icon className="size-[18px]" strokeWidth={1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-5 px-6 pb-6">
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink-foreground"
        >
          <LogOutIcon className="size-4" /> Sign out
        </button>
        <div className="border-t border-ink-line pt-5">
          <BuiltBy />
        </div>
      </div>
    </aside>
  );
}

function PhoneHeader({ signOut }) {
  return (
    <header className="sticky top-0 z-30 bg-ink text-ink-foreground md:hidden">
      <CmykBar />
      <div className="flex h-14 items-center justify-between px-4">
        <AvmMark className="h-8" />
        <span className="font-display text-xl italic">AVM Leads</span>
        <button type="button" onClick={signOut} aria-label="Sign out" className="grid size-9 place-items-center rounded-lg text-ink-muted hover:text-ink-foreground">
          <LogOutIcon className="size-[18px]" />
        </button>
      </div>
    </header>
  );
}

function BottomNav({ role }) {
  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur md:hidden">
      {NAV[role].map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn('flex flex-1 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold', isActive ? 'text-foreground' : 'text-muted-foreground')
          }
        >
          {({ isActive }) => (
            <>
              <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-foreground text-background')}>
                <Icon className="size-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const { loading, role, signOut } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }
  if (!role) return <Login />;

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={role} signOut={signOut} />
      <div className="min-w-0 flex-1">
        <PhoneHeader signOut={signOut} />
        <main
          key={location.pathname}
          className={cn(
            'mx-auto animate-in px-4 pt-6 pb-28 duration-300 fade-in slide-in-from-bottom-1 md:px-10 md:pt-10 md:pb-16',
            // The leads table uses the whole screen; forms stay narrow and readable.
            location.pathname === '/leads' ? 'max-w-none' : role === 'agency' && location.pathname !== '/log' ? 'max-w-6xl' : 'max-w-3xl',
          )}
        >
          <Suspense fallback={<LoadingBlock rows={4} />}>
            <Routes>
              <Route path="/log" element={<LogLead />} />
              {role === 'staff' ? (
                <Route path="/" element={<StaffHome />} />
              ) : (
                <>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ad-data" element={<AdData />} />
                  <Route path="/settings" element={<Settings />} />
                </>
              )}
              <Route path="/leads" element={<Leads />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <BottomNav role={role} />
    </div>
  );
}
