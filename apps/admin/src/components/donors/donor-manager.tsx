'use client';

import { DONOR_MESSAGE_MAX, DONOR_NAME_MAX, type Donor } from '@piano-daily/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isApiError } from '@/lib/api/client';
import { donorsApi } from '@/lib/api/donors';

type Draft = { name: string; amount: string; message: string; donatedAt: string; isVisible: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ name: '', amount: '', message: '', donatedAt: today(), isVisible: true });
const toDraft = (d: Donor): Draft => ({
  name: d.name,
  amount: d.amount === null ? '' : String(d.amount),
  message: d.message ?? '',
  donatedAt: d.donatedAt,
  isVisible: d.isVisible,
});
const money = new Intl.NumberFormat('vi-VN');
const errorText = (err: unknown, fallback: string) => (isApiError(err) ? err.message : fallback);

/** Thêm / sửa / ẩn / xoá người ủng hộ. */
export function DonorManager() {
  const [donors, setDonors] = useState<Donor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Donor | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setDonors(await donorsApi.list(signal));
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(errorText(err, 'Không tải được danh sách người ủng hộ.'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reset = () => {
    setEditing(null);
    setDraft(emptyDraft());
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amountText = draft.amount.replace(/[.,\s]/g, '');
    if (amountText !== '' && !/^\d+$/.test(amountText)) {
      setError('Số tiền chỉ gồm chữ số.');
      return;
    }
    const body = {
      name: draft.name,
      amount: amountText === '' ? null : Number(amountText),
      message: draft.message,
      donatedAt: draft.donatedAt,
      isVisible: draft.isVisible,
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await donorsApi.update(editing.id, body);
      else await donorsApi.create(body);
      reset();
      await load();
    } catch (err) {
      setError(errorText(err, 'Không lưu được. Hãy thử lại.'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(donor: Donor) {
    setError(null);
    try {
      await donorsApi.update(donor.id, { isVisible: !donor.isVisible });
      await load();
    } catch (err) {
      setError(errorText(err, 'Không đổi được trạng thái hiển thị.'));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={onSubmit} aria-label={editing ? 'Sửa người ủng hộ' : 'Thêm người ủng hộ'} className="flex max-w-2xl flex-col gap-4 rounded-lg border border-outline-variant p-4">
        <h2 className="font-display text-headline-sm text-primary">{editing ? 'Sửa người ủng hộ' : 'Thêm người ủng hộ'}</h2>
        <FormError>{error}</FormError>
        <FormField id="donor-name" label="Tên" maxLength={DONOR_NAME_MAX} value={draft.name} onChange={(e) => set('name', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="donor-amount"
            label="Số tiền (VND, không bắt buộc)"
            inputMode="numeric"
            placeholder="vd. 100000"
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
          <FormField id="donor-date" label="Ngày ủng hộ" type="date" value={draft.donatedAt} onChange={(e) => set('donatedAt', e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="donor-message">Lời nhắn (không bắt buộc)</Label>
          <Textarea id="donor-message" rows={3} maxLength={DONOR_MESSAGE_MAX} value={draft.message} onChange={(e) => set('message', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isVisible} onChange={(e) => set('isVisible', e.target.checked)} />
          Hiển thị công khai
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm'}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={reset}>
              Huỷ sửa
            </Button>
          )}
        </div>
      </form>

      {donors === null && !error && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      {donors && donors.length === 0 && <p className="text-sm text-muted-foreground">Chưa có người ủng hộ nào.</p>}
      {donors && donors.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Số tiền</TableHead>
              <TableHead>Ngày</TableHead>
              <TableHead>Lời nhắn</TableHead>
              <TableHead>Hiển thị</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donors.map((donor) => (
              <TableRow key={donor.id}>
                <TableCell className="font-medium">{donor.name}</TableCell>
                <TableCell>{donor.amount === null ? '—' : `${money.format(donor.amount)} ₫`}</TableCell>
                <TableCell>{donor.donatedAt}</TableCell>
                <TableCell className="max-w-xs whitespace-normal">{donor.message ?? '—'}</TableCell>
                <TableCell>{donor.isVisible ? 'Đang hiện' : 'Đã ẩn'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => void toggleVisible(donor)} aria-label={`${donor.isVisible ? 'Ẩn' : 'Hiện'} ${donor.name}`}>
                      {donor.isVisible ? 'Ẩn' : 'Hiện'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Sửa ${donor.name}`}
                      onClick={() => {
                        setEditing(donor);
                        setDraft(toDraft(donor));
                        setError(null);
                      }}
                    >
                      Sửa
                    </Button>
                    <DeleteConfirm
                      itemLabel={donor.name}
                      onConfirm={async () => {
                        await donorsApi.remove(donor.id);
                        if (editing?.id === donor.id) reset();
                        await load();
                      }}
                      onError={(err) => setError(errorText(err, 'Không xoá được.'))}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
