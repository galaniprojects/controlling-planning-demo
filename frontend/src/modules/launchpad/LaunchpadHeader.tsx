import { Badge } from '@/components/ui/badge';

interface Props {
  userName: string;
  role: string;
}

const CRETA_WORDS = [
  { letter: 'C', rest: 'ontrolling' },
  { letter: 'R', rest: 'eporting' },
  { letter: 'E', rest: 'stimation' },
  { letter: 'T', rest: 'racking' },
  { letter: 'A', rest: 'llocations' },
];

const ROLE_LABELS: Record<string, string> = {
  controller: 'Controller',
  cost_center_owner: 'Cost Centre Owner',
  project_lead: 'Project Lead',
  executive: 'Executive',
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

export function LaunchpadHeader({ userName, role }: Props) {
  return (
    <div className="text-center py-6">
      {/* CRETA Acronym */}
      <div className="flex items-center justify-center gap-0 text-lg tracking-wide mb-3">
        {CRETA_WORDS.map((word, i) => (
          <span key={word.letter} className="inline-flex items-center">
            {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
            <span className="text-blue-800 font-bold">{word.letter}</span>
            <span className="text-slate-400">{word.rest}</span>
          </span>
        ))}
      </div>

      {/* Greeting */}
      <p className="text-xl text-slate-700 mb-2">
        {getGreeting()}, {getFirstName(userName)}
      </p>

      {/* Role Badge */}
      <Badge variant="secondary" className="text-xs font-medium">
        {ROLE_LABELS[role] || role}
      </Badge>
    </div>
  );
}
