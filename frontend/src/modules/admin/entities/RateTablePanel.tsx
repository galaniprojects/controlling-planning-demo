import { useState, useEffect } from 'react';
import { Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { adminApi } from '@/api/endpoints';
import type { AdminRateEntry } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface EditedRate {
  new_rate: number;
  effective_date: string;
}

export function RateTablePanel() {
  const [rates, setRates] = useState<AdminRateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedRates, setEditedRates] = useState<Record<string, EditedRate>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchRates = () => {
    setLoading(true);
    adminApi
      .getRates()
      .then((res) => setRates(res.items))
      .catch(() => setRates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRates(); }, []);

  const rateKey = (r: AdminRateEntry) => `${r.role_type_id}/${r.competence_center_id}`;

  const handleRateChange = (entry: AdminRateEntry, value: string) => {
    const key = rateKey(entry);
    const existing = editedRates[key];
    setEditedRates((prev) => ({
      ...prev,
      [key]: {
        new_rate: parseFloat(value) || 0,
        effective_date: existing?.effective_date ?? '2026-04-01',
      },
    }));
  };

  const handleDateChange = (entry: AdminRateEntry, value: string) => {
    const key = rateKey(entry);
    const existing = editedRates[key];
    setEditedRates((prev) => ({
      ...prev,
      [key]: {
        new_rate: existing?.new_rate ?? entry.current_rate,
        effective_date: value,
      },
    }));
  };

  const hasChanges = Object.keys(editedRates).length > 0;

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const changes = Object.entries(editedRates).map(([key, val]) => {
        const [role_type_id, competence_center_id] = key.split('/');
        return {
          role_type_id,
          competence_center_id,
          new_rate: val.new_rate,
          effective_date: val.effective_date,
        };
      });
      await adminApi.updateRates(changes);
      setEditedRates({});
      setResult(`${changes.length} rate(s) updated successfully.`);
      fetchRates();
    } catch {
      setResult('Failed to update rates.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setEditedRates({});
    setResult(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Rate Tables</h2>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
              <Undo2 className="h-4 w-4 mr-1" />
              Discard
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          {result}
        </div>
      )}

      <div className="rounded-md border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Role</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[160px]">Competence Center</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[130px]">Current Rate</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[150px]">Effective Date</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[110px] text-right">Previous Rate</TableHead>
              <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground w-[120px]">Previous Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((entry) => {
              const key = rateKey(entry);
              const edited = editedRates[key];
              const isEdited = !!edited;
              return (
                <TableRow
                  key={key}
                  className={isEdited ? 'bg-amber-50 border-l-2 border-l-amber-400' : 'hover:bg-accent'}
                >
                  <TableCell className="px-3 py-2 text-sm font-medium text-foreground">
                    {entry.role_name}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                    {entry.competence_center_name}
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">€</span>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 w-[90px] text-sm"
                        value={edited ? edited.new_rate : entry.current_rate}
                        onChange={(e) => handleRateChange(entry, e.target.value)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-1.5">
                    <Input
                      type="date"
                      className="h-7 w-[135px] text-sm"
                      value={edited ? edited.effective_date : entry.effective_date}
                      onChange={(e) => handleDateChange(entry, e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground text-right">
                    {entry.previous_rate != null ? formatCurrency(entry.previous_rate) : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                    {entry.previous_effective_date ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {rates.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No rate entries found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
