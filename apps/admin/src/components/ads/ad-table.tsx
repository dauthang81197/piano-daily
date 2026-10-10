'use client';

import type { AdSlot } from '@piano-daily/shared';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adsApi } from '@/lib/api/ads';
import { useAuth } from '@/lib/auth/auth-provider';
import { AdForm } from './ad-form';
import { POSITION_LABELS, POSITION_ORDER, READ_ONLY_REASON } from './ad-labels';

type DialogState = { open: false } | { open: true; item: AdSlot | null };

const kindOf = (s: AdSlot) => (s.htmlCode ? 'Mã HTML' : 'Ảnh + link');
const messageOf = (err: unknown) => applyServerError(err, [] as const, () => undefined);

/** Trang Quảng cáo (Story 4.5): slot theo vị trí, tạo/sửa trong dialog, bật/tắt, xoá. */
export function AdTable() {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [slots, setSlots] = useState<AdSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adsApi
      .list(controller.signal)
      .then((list) => {
        setSlots([...list].sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position)));
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const done = useCallback(() => {
    setDialog({ open: false });
    reload();
  }, [reload]);

  const toggle = async (slot: AdSlot, isActive: boolean) => {
    setBusyId(slot.id);
    setActionError(null);
    try {
      await adsApi.setActive(slot.id, isActive);
      reload();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (slot: AdSlot) => {
    setActionError(null);
    await adsApi.remove(slot.id);
    reload();
  };

  const taken = (slots ?? []).map((s) => s.position);
  const full = taken.length >= POSITION_ORDER.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!canWrite && <p className="text-sm text-muted-foreground">{READ_ONLY_REASON}</p>}
        <Button
          className="ml-auto"
          disabled={!canWrite || full || slots === null}
          title={!canWrite ? READ_ONLY_REASON : full ? 'Mọi vị trí đã có quảng cáo.' : undefined}
          onClick={() => setDialog({ open: true, item: null })}
        >
          <Plus aria-hidden="true" />
          Tạo mới
        </Button>
      </div>

      <FormError>{error}</FormError>
      <FormError>{actionError}</FormError>

      <Table aria-label="Danh sách quảng cáo">
        <TableHeader>
          <TableRow>
            <TableHead>Vị trí</TableHead>
            <TableHead>Nội dung</TableHead>
            <TableHead>Bật</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots?.map((slot) => (
            <TableRow key={slot.id}>
              <TableCell>{POSITION_LABELS[slot.position]}</TableCell>
              <TableCell>{kindOf(slot)}</TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={slot.isActive}
                    disabled={!canWrite || busyId === slot.id}
                    title={!canWrite ? READ_ONLY_REASON : undefined}
                    aria-label={`Bật ${POSITION_LABELS[slot.position]}`}
                    onChange={(e) => toggle(slot, e.target.checked)}
                  />
                  {slot.isActive ? 'Đang bật' : 'Đang tắt'}
                </label>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${canWrite ? 'Sửa' : 'Xem'} ${POSITION_LABELS[slot.position]}`}
                    onClick={() => setDialog({ open: true, item: slot })}
                  >
                    {canWrite ? 'Sửa' : 'Xem'}
                  </Button>
                  {canWrite && (
                    <DeleteConfirm
                      itemLabel={POSITION_LABELS[slot.position]}
                      onConfirm={() => remove(slot)}
                      onError={(err) => setActionError(messageOf(err))}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {slots && slots.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                Chưa có quảng cáo nào. Bấm “Tạo mới” để thêm.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false })}>
        <DialogContent className="sm:max-w-xl">
          {dialog.open && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.item ? 'Sửa quảng cáo' : 'Tạo quảng cáo'}</DialogTitle>
                <DialogDescription>
                  Cần mã HTML, hoặc cả ảnh và link (URL https). Mỗi vị trí có tối đa một quảng cáo.
                </DialogDescription>
              </DialogHeader>
              <AdForm
                item={dialog.item}
                takenPositions={taken}
                onDone={done}
                onCancel={() => setDialog({ open: false })}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
