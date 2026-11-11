import { cn } from '@/lib/utils';

// Both logos have white wordmarks, so they only go on ink surfaces.

export function AvmLogo({ className }) {
  return <img src="/brand/avm-logo.svg" alt="AVM for Printing" className={cn('h-10 w-auto self-start object-contain select-none', className)} draggable="false" />;
}

export function AvmMark({ className }) {
  return <img src="/brand/avm-mark.svg" alt="" aria-hidden="true" className={cn('h-8 w-auto select-none', className)} draggable="false" />;
}

/** `tone="dark"` on ink surfaces (full white wordmark); `tone="light"` shows the cube with text. */
export function BuiltBy({ className, tone = 'dark' }) {
  const light = tone === 'light';
  return (
    <a
      href="https://8pxstudio.com"
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group flex items-center gap-2 text-xs transition-colors',
        light ? 'text-muted-foreground hover:text-foreground' : 'text-ink-muted hover:text-ink-foreground',
        className,
      )}
    >
      <span>Built by</span>
      {light ? (
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <img src="/brand/8px-cube.svg" alt="" className="h-4 w-auto" draggable="false" />
          8px Studio
        </span>
      ) : (
        <img src="/brand/8px-logo.svg" alt="8px Studio" className="h-5 w-auto opacity-80 transition-opacity group-hover:opacity-100" draggable="false" />
      )}
    </a>
  );
}

/** Four-colour registration strip, AVM's CMYK as a quiet brand device. */
export function CmykBar({ className }) {
  return <div aria-hidden="true" className={cn('cmyk-bar h-1 w-full', className)} />;
}
