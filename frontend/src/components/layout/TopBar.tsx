import { useNavigate } from 'react-router-dom';
import { Breadcrumb } from './Breadcrumb';
import { RoleSwitcher } from './RoleSwitcher';
import { HelpButton } from './HelpButton';

export function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="text-lg font-semibold text-blue-800 hover:text-blue-900"
        >
          CRETA
        </button>
        <Breadcrumb />
      </div>
      <div className="flex items-center gap-3">
        <HelpButton />
        <RoleSwitcher />
      </div>
    </header>
  );
}
