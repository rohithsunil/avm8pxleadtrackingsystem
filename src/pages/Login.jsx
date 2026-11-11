import { useState } from 'react';
import { ArrowRightIcon, LockKeyholeIcon } from 'lucide-react';
import { api } from '@/lib/api.js';
import { useSession } from '@/session.jsx';
import { AvmLogo, BuiltBy, CmykBar } from '@/components/brand.jsx';
import { ErrorAlert } from '@/components/app.jsx';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

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
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative flex flex-col overflow-hidden bg-ink text-ink-foreground">
        <CmykBar />
        <div className="flex flex-1 flex-col justify-between gap-10 px-6 pt-8 pb-8 md:px-14 md:pt-14 md:pb-12">
          <AvmLogo className="h-14 md:h-20" />
          <div>
            <h1 className="font-display text-[2.6rem] leading-[1.02] md:text-[4.2rem]">
              Every enquiry, <em className="text-brand-cyan">counted.</em>
            </h1>
            <p className="mt-4 max-w-md text-ink-muted md:text-lg">
              Log WhatsApp leads as they land, and see exactly what the ads bring in.
            </p>
          </div>
          <BuiltBy className="hidden md:flex" />
        </div>
        {/* Swoosh echo */}
        <img src="/brand/avm-mark.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-24 hidden h-[34rem] w-auto opacity-[0.07] md:block" />
      </section>

      {/* PIN form */}
      <section className="flex items-center justify-center px-6 py-10 md:px-14">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <div className="grid size-11 place-items-center rounded-xl border bg-card shadow-xs">
              <LockKeyholeIcon className="size-5" />
            </div>
            <h2 className="font-display text-4xl">Sign in</h2>
            <p className="text-muted-foreground">Enter the PIN you were given.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="pin">PIN</FieldLabel>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={12}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="h-14 rounded-xl text-center font-display text-3xl tracking-[0.5em] md:text-3xl"
              autoFocus
            />
            <FieldDescription>Staff and agency each have their own PIN.</FieldDescription>
          </Field>
          <ErrorAlert>{error}</ErrorAlert>
          <Button type="submit" size="lg" disabled={busy} className="h-12 w-full rounded-xl text-base">
            {busy ? <Spinner /> : null}
            Continue
            {!busy && <ArrowRightIcon data-icon="inline-end" />}
          </Button>
          <BuiltBy tone="light" className="justify-center md:hidden" />
        </form>
      </section>
    </div>
  );
}
