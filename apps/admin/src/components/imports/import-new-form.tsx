'use client';

import { IMPORT_MAX_FILES, Level, LEVEL_LABELS } from '@piano-daily/shared';
import { useRouter } from 'next/navigation';
import { type DragEvent, useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { validatePdfFile } from '@/components/sheets/pdf-uploader';
import { useGenreOptions } from '@/components/sheets/use-catalog-options';
import { useComposerOptions } from '@/components/taxonomy/use-composer-options';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isApiError } from '@/lib/api/client';
import { importsApi, uploadImportFile } from '@/lib/api/imports';
import { cn } from '@/lib/utils';

const DEFAULT_COMPOSER = 'default';
const LEVEL_ITEMS = Object.values(Level).map((value) => ({ value, label: LEVEL_LABELS[value] }));

type FileState = { id: number; file: File; status: 'queued' | 'uploading' | 'uploaded' | 'error'; progress: number; error: string | null };

const STATUS_TEXT: Record<FileState['status'], string> = {
  queued: 'Chờ tải lên',
  uploading: 'Đang tải lên',
  uploaded: 'Đã tải lên',
  error: 'Lỗi',
};

/** Tạo đợt import: chọn nhiều PDF + cấu hình mặc định; tải từng file lên rồi chuyển sang trang theo dõi (job chạy nền ở server). */
export function ImportNewForm() {
  const router = useRouter();
  const composers = useComposerOptions();
  const genres = useGenreOptions();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const [files, setFiles] = useState<FileState[]>([]);
  const [level, setLevel] = useState<string>('INTERMEDIATE');
  const [composerId, setComposerId] = useState(DEFAULT_COMPOSER);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function addFiles(list: FileList | File[]) {
    if (busy) return;
    const incoming = Array.from(list);
    const room = IMPORT_MAX_FILES - files.length;
    const added: FileState[] = [];
    const skipped: string[] = [];
    for (const file of incoming) {
      const invalid = validatePdfFile(file);
      if (invalid) skipped.push(`${file.name}: ${invalid}`);
      else if (added.length >= room) skipped.push(`${file.name}: vượt quá ${IMPORT_MAX_FILES} file mỗi đợt.`);
      else added.push({ id: nextId.current++, file, status: 'queued', progress: 0, error: null });
    }
    setFiles((current) => [...current, ...added]);
    setNotice(skipped.length ? `Bỏ qua ${skipped.length} file: ${skipped.slice(0, 3).join(' · ')}${skipped.length > 3 ? ' …' : ''}` : null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  const patch = (id: number, change: Partial<FileState>) => setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...change } : f)));

  async function submit() {
    if (busy || files.length === 0) return;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    let batchId: string | null = null;
    try {
      const batch = await importsApi.create({
        level: level as Level,
        composerId: composerId === DEFAULT_COMPOSER ? null : composerId,
        genreIds,
        publish,
      });
      batchId = batch.id;
      let uploaded = 0;
      for (const entry of files) {
        if (entry.status === 'uploaded') {
          uploaded += 1;
          continue;
        }
        patch(entry.id, { status: 'uploading', progress: 0, error: null });
        try {
          await uploadImportFile(batch.id, entry.file, (progress) => patch(entry.id, { progress }), controller.signal);
          patch(entry.id, { status: 'uploaded', progress: 100 });
          uploaded += 1;
        } catch (err) {
          if (controller.signal.aborted) return;
          patch(entry.id, { status: 'error', error: isApiError(err) ? err.message : 'Tải lên không thành công.' });
        }
      }
      if (uploaded > 0) router.push(`/imports/${batch.id}`);
      else setError('Không file nào được tải lên. Kiểm tra lỗi từng file bên dưới rồi thử lại.');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(isApiError(err) ? err.message : 'Không tạo được đợt import. Vui lòng thử lại.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
    void batchId;
  }

  const removeFile = (id: number) => setFiles((current) => current.filter((f) => f.id !== id));
  const toggleGenre = (id: string) => setGenreIds((current) => (current.includes(id) ? current.filter((g) => g !== id) : [...current, id]));

  return (
    <form
      className="flex max-w-3xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn('flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center', dragging ? 'border-primary bg-primary/5' : 'border-border')}
      >
        <p className="text-sm text-muted-foreground">Kéo thả nhiều file PDF vào đây (tối đa {IMPORT_MAX_FILES} file mỗi đợt)</p>
        <input
          ref={inputRef}
          id="import-files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <Button type="button" variant="outline" disabled={busy || files.length >= IMPORT_MAX_FILES} onClick={() => inputRef.current?.click()}>
          Chọn file PDF
        </Button>
      </div>
      <FormError>{notice}</FormError>

      {files.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="File sẽ import">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={f.file.name}>
                {f.file.name}
              </span>
              <span className={cn('shrink-0 text-xs', f.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {STATUS_TEXT[f.status]}
                {f.status === 'uploading' ? ` ${f.progress}%` : ''}
              </span>
              {f.error && <span className="text-xs text-destructive">{f.error}</span>}
              <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Bỏ ${f.file.name}`} onClick={() => removeFile(f.id)}>
                Bỏ
              </Button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="flex flex-col gap-4" disabled={busy}>
        <legend className="mb-1 text-sm font-medium">Mặc định cho mọi Sheet trong đợt</legend>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-level">Cấp độ</Label>
            <Select items={LEVEL_ITEMS} value={level} onValueChange={(v) => setLevel(v ?? 'INTERMEDIATE')}>
              <SelectTrigger id="import-level" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_ITEMS.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-composer">Composer</Label>
            <Select
              items={[{ value: DEFAULT_COMPOSER, label: 'Chưa rõ (mặc định)' }, ...composers.options]}
              value={composerId}
              onValueChange={(v) => setComposerId(v ?? DEFAULT_COMPOSER)}
            >
              <SelectTrigger id="import-composer" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_COMPOSER}>Chưa rõ (mặc định)</SelectItem>
                {composers.options.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {genres.options.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Genre (không bắt buộc)</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {genres.options.map(({ value, label }) => (
                <label key={value} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={genreIds.includes(value)} onChange={() => toggleGenre(value)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="inline-flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span>
            Đăng luôn
            <span className="block text-muted-foreground">Sheet được đăng công khai và miễn phí ngay khi xong. Để tắt thì Sheet ở bản nháp, bạn xem lại rồi đặt giá/đăng sau.</span>
          </span>
        </label>
      </fieldset>

      <FormError>{error}</FormError>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || files.length === 0}>
          {busy ? 'Đang tải lên…' : `Bắt đầu import${files.length ? ` (${files.length} file)` : ''}`}
        </Button>
        <p className="text-sm text-muted-foreground">Sau khi tải lên, việc chạy nền trên server; bạn có thể đóng trang.</p>
      </div>
    </form>
  );
}
