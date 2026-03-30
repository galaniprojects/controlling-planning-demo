import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Globe } from 'lucide-react';
import { rolesApi, reportBuilderApi } from '@/api/endpoints';
import type { RoleInfo } from '@/types/api';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: number;
}

interface ShareEntry {
  userId: string;
  userName: string;
  selected: boolean;
  permission: 'view_only' | 'can_edit';
}

export function ShareReportDialog({ open, onOpenChange, reportId }: ShareReportDialogProps) {
  const [entries, setEntries] = useState<ShareEntry[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      rolesApi.getAll().then((res) => {
        const roles = res.items ?? res;
        setEntries(
          (roles as RoleInfo[]).map((r) => ({
            userId: r.id,
            userName: `${r.user_name} (${r.name})`,
            selected: false,
            permission: 'view_only' as const,
          })),
        );
        setLoaded(true);
      }).catch(() => {});
    }
  }, [open, loaded]);

  function toggleUser(userId: string) {
    setEntries((prev) =>
      prev.map((e) => (e.userId === userId ? { ...e, selected: !e.selected } : e)),
    );
  }

  function setPermission(userId: string, permission: 'view_only' | 'can_edit') {
    setEntries((prev) =>
      prev.map((e) => (e.userId === userId ? { ...e, permission } : e)),
    );
  }

  async function handleShare() {
    setIsSaving(true);
    try {
      const shares = entries
        .filter((e) => e.selected)
        .map((e) => ({ shared_with: e.userId, permission: e.permission }));
      await reportBuilderApi.shareSaved(reportId, { shares, is_published: isPublished });
      onOpenChange(false);
    } catch {
      // silent fail
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* User list */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Share with</label>
            <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.userId} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    checked={entry.selected}
                    onCheckedChange={() => toggleUser(entry.userId)}
                  />
                  <span className="text-sm flex-1 truncate">{entry.userName}</span>
                  {entry.selected && (
                    <select
                      value={entry.permission}
                      onChange={(e) => setPermission(entry.userId, e.target.value as 'view_only' | 'can_edit')}
                      className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
                    >
                      <option value="view_only">View only</option>
                      <option value="can_edit">Can edit</option>
                    </select>
                  )}
                </div>
              ))}
              {entries.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Loading users...
                </div>
              )}
            </div>
          </div>

          {/* Publish toggle */}
          <div className="flex items-center gap-3 pt-2">
            <Checkbox
              checked={isPublished}
              onCheckedChange={(v) => setIsPublished(!!v)}
            />
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Publish to Report Library</p>
                <p className="text-xs text-muted-foreground">
                  Make this report visible to all users in the Shared Reports section
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sharing...
              </>
            ) : (
              'Share'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
