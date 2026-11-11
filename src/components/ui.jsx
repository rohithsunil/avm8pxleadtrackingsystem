import { createContext, useCallback, useContext, useRef, useState } from 'react';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const buttonStyles = {
  primary: 'bg-accent text-white hover:bg-accent-dark disabled:bg-accent/50',
  secondary: 'bg-card text-ink border border-line hover:bg-page disabled:text-muted',
  ghost: 'text-accent hover:bg-accent/5 disabled:text-muted',
  danger: 'text-bad hover:bg-bad/5',
};

export function Button({ variant = 'primary', className, busy, children, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-4 font-medium transition-colors disabled:cursor-not-allowed',
        buttonStyles[variant],
        className,
      )}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className, flush, children, ...props }) {
  return (
    <div className={cx('rounded-xl border border-line bg-card', !flush && 'p-4', className)} {...props}>
      {children}
    </div>
  );
}

// `group` renders a div instead of a label, for fields made of several buttons
// (a label would send clicks on its empty space to the first button).
export function Field({ label, error, hint, optional, children, className, highlight, group }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      <div className={cx('rounded-[10px] transition-shadow duration-700', highlight && 'ring-4 ring-accent/25')}>
        {children}
      </div>
      {error ? (
        <span className="mt-1 block text-sm text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      ) : null}
    </Tag>
  );
}

export const inputClass =
  'block w-full min-h-12 rounded-[10px] border border-line bg-card px-3 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export function Input({ error, className, ...props }) {
  return <input className={cx(inputClass, error && 'border-bad', className)} {...props} />;
}

export function Select({ error, className, placeholder, options, ...props }) {
  return (
    <select className={cx(inputClass, 'select-chevron appearance-none pr-9', error && 'border-bad', className)} {...props}>
      <option value="">{placeholder ?? 'Choose…'}</option>
      {options.map((o) => {
        const value = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

const statusColours = {
  New: 'bg-new/10 text-new',
  Quoted: 'bg-warn/10 text-warn',
  Won: 'bg-good/10 text-good',
  Lost: 'bg-bad/10 text-bad',
};

export function StatusChip({ status }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium', statusColours[status])}>
      {status}
    </span>
  );
}

const pickerSelected = {
  New: 'border-new bg-new/10 text-new',
  Quoted: 'border-warn bg-warn/10 text-warn',
  Won: 'border-good bg-good/10 text-good',
  Lost: 'border-bad bg-bad/10 text-bad',
};

// Large side-by-side choices; status values get their own colour when picked.
export function ChoiceGroup({ options, value, onChange, coloured, columns, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o)}
            className={cx(
              'min-h-12 rounded-[10px] border px-2 text-sm font-medium transition-colors',
              selected
                ? coloured
                  ? pickerSelected[o]
                  : 'border-accent bg-accent/10 text-accent'
                : 'border-line bg-card text-ink hover:bg-page',
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ text, action }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-muted">{text}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-[10px] bg-bad/5 px-3 py-2 text-sm text-bad">{children}</p>;
}

export function PageTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{children}</h1>
      {action}
    </div>
  );
}

// ---- Toast: one short message at a time ----

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timer = useRef();
  const show = useCallback((text) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 2000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        {message && (
          <div className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-sm">{message}</div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
