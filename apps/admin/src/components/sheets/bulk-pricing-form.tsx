'use client';

import {
  BULK_PREVIEW_LIMIT,
  type BulkFreeMode,
  type BulkPriceApplyInput,
  type BulkPriceFilter,
  type BulkPricePreviewResponse,
  formatUsd,
  Level,
  LEVEL_LABELS,
  parseUsdToCents,
  SHEET_STATUS_LABELS,
  USD_INPUT_ERROR,
} from '@piano-daily/shared';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { useComposerOptions } from '@/components/taxonomy/use-composer-options';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isApiError } from '@/lib/api/client';
import { sheetsApi } from '@/lib/api/sheets';
import { useGenreOptions } from './use-catalog-options';

const ANY = 'any';
const PRICE_INPUTS = [
  { key: 'pricePdfCents', id: 'bulk-price-pdf', label: 'Giá PDF (USD)' },
  { key: 'priceMidiCents', id: 'bulk-price-midi', label: 'Giá MIDI (USD)' },
  { key: 'priceMp3Cents', id: 'bulk-price-mp3', label: 'Giá MP3 (USD)' },
  { key: 'priceBundleCents', id: 'bulk-price-bundle', label: 'Giá Bundle (USD)' },
] as const;
type PriceKey = (typeof PRICE_INPUTS)[number]['key'];

const FREE_MODES: { value: BulkFreeMode; label: string }[] = [
  { value: 'KEEP', label: 'Giữ nguyên' },
  { value: 'FREE', label: 'Miễn phí' },
  { value: 'PAID', label: 'Có giá' },
];

const money = (cents: number | null) => (cents === null ? '—' : formatUsd(cents));

function CriteriaSelect({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => onChange(v ?? ANY)}>
        <SelectTrigger id={id} className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Vi phạm bất biến (422) mà API trả trong `details`. */
function violationMessages(err: unknown): string[] {
  if (!isApiError(err) || !Array.isArray(err.details)) return [];
  return (err.details as { message?: unknown }[]).flatMap((d) => (typeof d.message === 'string' ? [d.message] : []));
}

/** 422 do tiêu chí không khớp Sheet nào (`path: 'filter'`), không phải vi phạm bất biến giá. */
function filterMessage(err: unknown): string | null {
  if (!isApiError(err) || !Array.isArray(err.details)) return null;
  const hit = (err.details as { path?: unknown; message?: unknown }[]).find((d) => d.path === 'filter' && typeof d.message === 'string');
  return hit ? (hit.message as string) : null;
}

/**
 * Đặt giá hàng loạt (Story 3.10): tiêu chí -> xem trước -> xác nhận hai bước. Đổi bất kỳ ô nào sau khi
 * xem trước thì phải xem trước lại để số Sheet hiển thị luôn khớp `expectedCount` gửi đi.
 */
export function BulkPricingForm() {
  const composers = useComposerOptions();
  const genres = useGenreOptions();
  const [level, setLevel] = useState(ANY);
  const [composerId, setComposerId] = useState(ANY);
  const [genreId, setGenreId] = useState(ANY);
  const [prices, setPrices] = useState<Record<PriceKey, string>>({
    pricePdfCents: '',
    priceMidiCents: '',
    priceMp3Cents: '',
    priceBundleCents: '',
  });
  const [freeMode, setFreeMode] = useState<BulkFreeMode>('KEEP');
  const [priceErrors, setPriceErrors] = useState<Partial<Record<PriceKey, string>>>({});
  const [preview, setPreview] = useState<BulkPricePreviewResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [done, setDone] = useState<number | null>(null);

  const filter: Partial<BulkPriceFilter> = {
    ...(level !== ANY ? { level: level as Level } : {}),
    ...(composerId !== ANY ? { composerId } : {}),
    ...(genreId !== ANY ? { genreId } : {}),
  };
  const hasFilter = Object.keys(filter).length > 0;

  /** Mọi thay đổi đầu vào làm mất bản xem trước. */
  const touch = () => {
    setPreview(null);
    setConfirming(false);
    setDone(null);
    setViolations([]);
    setPriceErrors({});
    setError(null);
  };

  /** Đổi các ô giá thành cents; ô trống bị bỏ qua (giữ nguyên cột). `null` nếu có ô sai. */
  function parsePrices(): Partial<Record<PriceKey, number>> | null {
    const out: Partial<Record<PriceKey, number>> = {};
    const errors: Partial<Record<PriceKey, string>> = {};
    for (const { key } of PRICE_INPUTS) {
      const cents = parseUsdToCents(prices[key]);
      if (cents === undefined) errors[key] = USD_INPUT_ERROR;
      else if (cents !== null) out[key] = cents;
    }
    setPriceErrors(errors);
    return Object.keys(errors).length ? null : out;
  }

  async function runPreview() {
    setError(null);
    const parsed = parsePrices();
    if (!hasFilter) return setError('Cần chọn ít nhất một tiêu chí (Cấp độ, Composer hoặc Genre).');
    if (!parsed) return;
    if (freeMode === 'KEEP' && Object.keys(parsed).length === 0) {
      return setError('Hãy nhập ít nhất một giá hoặc chọn chế độ Miễn phí / Có giá.');
    }
    setBusy(true);
    setDone(null);
    setViolations([]);
    try {
      setPreview(await sheetsApi.bulkPricingPreview(filter as BulkPriceFilter));
      setConfirming(false);
    } catch (err) {
      setPreview(null);
      setError(isApiError(err) ? err.message : 'Không xem trước được. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    const parsed = parsePrices();
    if (!preview || !parsed) return;
    const body: BulkPriceApplyInput = {
      filter: filter as BulkPriceFilter,
      changes: { freeMode, ...parsed },
      expectedCount: preview.total,
    };
    setBusy(true);
    setError(null);
    setViolations([]);
    try {
      const result = await sheetsApi.bulkPricingApply(body);
      setDone(result.updated);
      setPreview(null);
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      if (isApiError(err) && err.code === 'BULK_COUNT_CHANGED') {
        setPreview(null);
        setError(err.message);
      } else if (isApiError(err) && err.status === 422 && filterMessage(err)) {
        setPreview(null);
        setError(filterMessage(err));
      } else if (isApiError(err) && err.status === 422) {
        setError('Không có gì được thay đổi. Một số Sheet đã publish sẽ không còn bán được, hoặc không có Sheet nào khớp:');
        setViolations(violationMessages(err));
      } else {
        setError(isApiError(err) ? err.message : 'Không áp dụng được. Vui lòng thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  const levelItems = [
    { value: ANY, label: 'Không lọc' },
    ...Object.values(Level).map((value) => ({ value, label: LEVEL_LABELS[value] })),
  ];
  const composerItems = [{ value: ANY, label: 'Không lọc' }, ...composers.options];
  const genreItems = [{ value: ANY, label: 'Không lọc' }, ...genres.options];

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Tiêu chí (kết hợp bằng VÀ, cần ít nhất một)</legend>
        <div className="flex flex-wrap gap-4">
          <CriteriaSelect id="bulk-level" label="Cấp độ" items={levelItems} value={level} onChange={(v) => { setLevel(v); touch(); }} />
          <CriteriaSelect id="bulk-composer" label="Composer" items={composerItems} value={composerId} onChange={(v) => { setComposerId(v); touch(); }} />
          <CriteriaSelect id="bulk-genre" label="Genre" items={genreItems} value={genreId} onChange={(v) => { setGenreId(v); touch(); }} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Giá mới (USD) — ô để trống giữ nguyên giá cũ</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRICE_INPUTS.map(({ key, id, label }) => (
            <FormField
              key={id}
              id={id}
              label={label}
              inputMode="decimal"
              placeholder="Ví dụ 4.99 (để trống nếu không đổi)"
              value={prices[key]}
              error={priceErrors[key]}
              onChange={(e) => {
                setPrices((p) => ({ ...p, [key]: e.target.value }));
                touch();
              }}
            />
          ))}
        </div>
        <div role="radiogroup" aria-label="Miễn phí" className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium">Miễn phí:</span>
          {FREE_MODES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="bulk-free-mode"
                className="size-4"
                checked={freeMode === value}
                onChange={() => {
                  setFreeMode(value);
                  touch();
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void runPreview()}>
          Xem trước
        </Button>
      </div>

      <FormError>{error}</FormError>
      {violations.length > 0 && (
        <ul aria-label="Sheet vi phạm" className="list-disc pl-6 text-sm text-error">
          {violations.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {done !== null && (
        <p role="status" className="text-sm font-medium">
          Đã cập nhật giá cho {done} Sheet.
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm font-medium">
            {preview.total} Sheet sẽ bị ảnh hưởng
            {preview.total > preview.items.length ? ` (hiển thị ${BULK_PREVIEW_LIMIT} Sheet đầu)` : ''}.
          </p>
          <Table aria-label="Sheet bị ảnh hưởng">
            <TableHeader>
              <TableRow>
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Cấp độ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Miễn phí</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead>MIDI</TableHead>
                <TableHead>MP3</TableHead>
                <TableHead>Bundle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.items.map((sheet) => (
                <TableRow key={sheet.id}>
                  <TableCell className="font-medium">{sheet.title}</TableCell>
                  <TableCell>{LEVEL_LABELS[sheet.level]}</TableCell>
                  <TableCell>{SHEET_STATUS_LABELS[sheet.status]}</TableCell>
                  <TableCell>{sheet.isFree ? 'Có' : 'Không'}</TableCell>
                  <TableCell>{money(sheet.pricePdfCents)}</TableCell>
                  <TableCell>{money(sheet.priceMidiCents)}</TableCell>
                  <TableCell>{money(sheet.priceMp3Cents)}</TableCell>
                  <TableCell>{money(sheet.priceBundleCents)}</TableCell>
                </TableRow>
              ))}
              {preview.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    Không có Sheet nào khớp tiêu chí.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {preview.total > 0 &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">Áp dụng giá mới cho {preview.total} Sheet?</span>
                <Button type="button" disabled={busy} onClick={() => void runApply()}>
                  {busy ? 'Đang áp dụng…' : 'Xác nhận áp dụng'}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  Huỷ
                </Button>
              </div>
            ) : (
              <div>
                <Button type="button" disabled={busy} onClick={() => setConfirming(true)}>
                  Áp dụng cho {preview.total} Sheet
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
