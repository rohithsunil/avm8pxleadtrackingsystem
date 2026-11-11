import { useEffect, useState } from 'react';

// True while the media query matches; follows window resizes.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tailwind's md breakpoint: laptops and tablets in landscape. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
