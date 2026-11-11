import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './lib/api.js';

const SessionContext = createContext(null);

// Holds the signed-in role and the form options (services, staff, campaigns).
export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, role: null, options: null });

  const load = useCallback(async () => {
    try {
      const { role } = await api('/me');
      if (!role) return setState({ loading: false, role: null, options: null });
      const options = await api('/options');
      setState({ loading: false, role, options });
    } catch {
      setState({ loading: false, role: null, options: null, offline: true });
    }
  }, []);

  useEffect(() => {
    load();
    const onSignedOut = () => setState({ loading: false, role: null, options: null });
    window.addEventListener('avm:signed-out', onSignedOut);
    return () => window.removeEventListener('avm:signed-out', onSignedOut);
  }, [load]);

  const refreshOptions = useCallback(async () => {
    const options = await api('/options');
    setState((s) => ({ ...s, options }));
  }, []);

  const signOut = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, role: null, options: null });
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, reload: load, refreshOptions, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
