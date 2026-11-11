import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertCircleIcon } from 'lucide-react';
import { Badge } from '@/components/reui/badge';
import { Alert, AlertDescription } from '@/components/reui/alert';
import { Frame, FrameHeader, FramePanel, FrameTitle, FrameDescription } from '@/components/reui/frame';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// ---- Lead status ----

const STATUS_VARIANT = {
  New: 'invert-light',
  Quoted: 'warning-light',
  Won: 'success-light',
  Lost: 'destructive-light',
};

const STATUS_DOT = {
  New: 'bg-foreground/50',
  Quoted: 'bg-warning',
  Won: 'bg-success',
  Lost: 'bg-destructive',
};

export function StatusBadge({ status, className }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} size="lg" radius="full" className={cn('gap-1.5 px-2', className)}>
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {status}
    </Badge>
  );
}

// ---- Page header: serif title, quiet subtitle, optional action ----

export function PageHeader({ eyebrow, title, description, action, className }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>}
        <h1 className="font-display text-[2.5rem] leading-[1.05] md:text-5xl">{title}</h1>
        {description && <p className="mt-2 text-[0.95rem] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---- Section: ReUI Frame with a title bar and a content panel ----

export function Section({ title, description, action, children, className, panelClassName, flush }) {
  return (
    <Frame className={cn('min-w-0', className)}>
      {(title || action) && (
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <FrameTitle className="text-[0.95rem]">{title}</FrameTitle>}
            {description && <FrameDescription>{description}</FrameDescription>}
          </div>
          {action}
        </FrameHeader>
      )}
      <FramePanel className={cn(flush && 'p-0', panelClassName)}>{children}</FramePanel>
    </Frame>
  );
}

export function ErrorAlert({ children, className }) {
  if (!children) return null;
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircleIcon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function LoadingBlock({ rows = 3, className }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---- Confirm dialog: `const confirm = useConfirm(); if (await confirm({...}))` ----

const ConfirmContext = createContext(async () => false);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef();

  const confirm = useCallback((options) => {
    setState(options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (answer) => {
    resolver.current?.(answer);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!state} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state?.title}</AlertDialogTitle>
            {state?.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={state?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
