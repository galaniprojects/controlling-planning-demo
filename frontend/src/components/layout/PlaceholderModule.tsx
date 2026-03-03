export function PlaceholderModule({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h1 className="text-2xl font-semibold text-slate-700">{name}</h1>
      <p className="mt-2 text-sm text-slate-500">
        This module is under construction.
      </p>
    </div>
  );
}
