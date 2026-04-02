import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Gem } from 'lucide-react';
import { Breadcrumb } from './Breadcrumb';
import { RoleSwitcher } from './RoleSwitcher';
import { HelpButton } from './HelpButton';
import { useTheme } from '@/contexts/ThemeContext';
import { BRANDING } from '@/config/branding';

const THEME_CYCLE = ['light', 'dark', 'liquid-glass'] as const;

export function TopBar() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(resolvedTheme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const themeIcon = resolvedTheme === 'dark'
    ? <Moon className="h-4 w-4" />
    : resolvedTheme === 'liquid-glass'
    ? <Gem className="h-4 w-4" />
    : <Sun className="h-4 w-4" />;

  const themeLabel = resolvedTheme === 'dark'
    ? 'Dark mode — click to switch'
    : resolvedTheme === 'liquid-glass'
    ? 'Liquid Glass — click to switch'
    : 'Light mode — click to switch';

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-card px-6 flex items-center justify-between glass-surface">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="text-lg font-semibold text-primary hover:text-primary/90"
        >
          {BRANDING.appName}
        </button>
        <Breadcrumb />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={cycleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={themeLabel}
        >
          {themeIcon}
        </button>
        <HelpButton />
        <RoleSwitcher />
      </div>
    </header>
  );
}
