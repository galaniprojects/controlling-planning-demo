import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * Converts **bold** markdown syntax into <strong> React elements.
 * Returns the plain string if no bold markers are found.
 */
export function renderMarkdownBold(text: string): ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
