/**
 * useScrollRestoration — save/restore scrollY by search-param hash.
 * Used so "back" from a detail view restores scroll position.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useScrollRestoration(containerRef: React.RefObject<HTMLElement>) {
  const [params] = useSearchParams();
  const savedScrollRef = useRef<number>(0);
  const paramKey = params.toString();

  // Save scroll position on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      savedScrollRef.current = container.scrollTop;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);

  // Restore scroll position on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Small timeout to let content render before restoring
    const id = window.setTimeout(() => {
      container.scrollTop = savedScrollRef.current;
    }, 50);
    return () => clearTimeout(id);
    // Only run on param key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey]);
}
