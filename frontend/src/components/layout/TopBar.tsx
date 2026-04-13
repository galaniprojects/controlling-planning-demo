import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Breadcrumb } from './Breadcrumb';
import { RoleSwitcher } from './RoleSwitcher';
import { HelpButton } from './HelpButton';
import { useTheme } from '@/contexts/ThemeContext';
import { BRANDING } from '@/config/branding';

export function TopBar() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-card px-6 flex items-center justify-between">
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
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <HelpButton />
        <RoleSwitcher />
      </div>
    </header>
  );
}
