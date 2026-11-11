import { useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../session.jsx';
import { Button, Card, ErrorNote, Input } from '../components/ui.jsx';

export default function Login() {
  const { reload, offline } = useSession();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(offline ? 'Could not reach the server. Check your connection.' : '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!pin) return setError('Enter your PIN');
    setBusy(true);
    setError('');
    try {
      await api('/login', { method: 'POST', body: { pin } });
      await reload();
    } catch (err) {
      setError(err.message);
      setPin('');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">AVM Leads</h1>
            <p className="mt-1 text-sm text-muted">Enter your PIN to continue.</p>
          </div>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            placeholder="PIN"
            aria-label="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-[0.4em]"
            autoFocus
          />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" busy={busy} className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    </div>
  );
}
