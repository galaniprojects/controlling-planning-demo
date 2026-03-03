export function ragBgColor(rag: string): string {
  switch (rag.toLowerCase()) {
    case 'green':
      return 'bg-green-100 text-green-700';
    case 'amber':
      return 'bg-amber-100 text-amber-700';
    case 'red':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'action':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'info':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}
