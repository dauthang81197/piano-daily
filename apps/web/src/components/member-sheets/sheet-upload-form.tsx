'use client';

import { type CreateMemberSheetRequest, MIDI_MAX_BYTES, MP3_MAX_BYTES, PDF_MAX_BYTES, type Sheet, type UpdateMemberSheetRequest } from '@piano-daily/shared';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { calloutCardClass } from '@/components/sheet/download-button-class';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { LEVELS } from '@/lib/levels';
import { ApiError } from '@/lib/public-api';
import { errorKey, type FieldErrors, fieldErrors } from './describe-error';
import { FileSlot, type SlotKind } from './file-slot';

const MB = 1024 * 1024;
const TYPE_OF: Record<SlotKind, 'PDF' | 'MIDI' | 'MP3'> = { pdf: 'PDF', midi: 'MIDI', mp3: 'MP3' };
const ORDER: SlotKind[] = ['pdf', 'midi', 'mp3'];
const ACCEPT: Record<SlotKind, string> = { pdf: '.pdf,application/pdf', midi: '.mid,.midi,audio/midi', mp3: '.mp3,audio/mpeg' };
const MAX: Record<SlotKind, number> = { pdf: PDF_MAX_BYTES, midi: MIDI_MAX_BYTES, mp3: MP3_MAX_BYTES };

type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export interface Option {
  id: string;
  name: string;
}

interface Values {
  title: string;
  subtitle: string;
  level: Level;
  difficultyScore: string;
  difficultyNote: string;
  composer: string;
  genreIds: string[];
  description: string;
  lyrics: string;
  youtube: string;
}

const EMPTY: Values = { title: '', subtitle: '', level: 'BEGINNER', difficultyScore: '', difficultyNote: '', composer: '', genreIds: [], description: '', lyrics: '', youtube: '' };

const fromSheet = (sheet: Sheet): Values => ({
  title: sheet.title,
  subtitle: sheet.subtitle ?? '',
  level: sheet.level as Level,
  difficultyScore: sheet.difficultyScore === null ? '' : String(sheet.difficultyScore),
  difficultyNote: sheet.difficultyNote ?? '',
  composer: sheet.composer.name,
  genreIds: sheet.genres.map((g) => g.id),
  description: sheet.description ?? '',
  lyrics: sheet.lyricsChords ?? '',
  youtube: sheet.youtubeUrl ?? '',
});

/** Tên khớp (không phân biệt hoa thường) một tác giả có sẵn thì gửi `composerId`, không thì gửi `composerName` (tạo mới). */
function composerPart(name: string, composers: Option[]): { composerId: string } | { composerName: string } {
  const trimmed = name.trim();
  const match = composers.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  return match ? { composerId: match.id } : { composerName: trimmed };
}

/** `clear`: ô trống gửi `null` (xoá giá trị cũ khi sửa); ngược lại bỏ khỏi yêu cầu (tạo mới). */
function buildBody(v: Values, clear: boolean) {
  const text = (value: string) => (value.trim() ? value.trim() : clear ? null : undefined);
  const score = v.difficultyScore.trim() === '' ? (clear ? null : undefined) : Number(v.difficultyScore);
  return {
    title: v.title.trim(),
    level: v.level,
    ...(text(v.subtitle) !== undefined ? { subtitle: text(v.subtitle) } : {}),
    ...(score !== undefined ? { difficultyScore: score } : {}),
    ...(text(v.difficultyNote) !== undefined ? { difficultyNote: text(v.difficultyNote) } : {}),
    ...(text(v.description) !== undefined ? { description: text(v.description) } : {}),
    ...(v.lyrics.trim() ? { lyricsChords: v.lyrics } : clear ? { lyricsChords: null } : {}),
    ...(text(v.youtube) !== undefined ? { youtubeUrl: text(v.youtube) } : {}),
    genreIds: v.genreIds,
  };
}

const textarea =
  'w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-md font-semibold text-on-surface">
        {label}
      </label>
      {children}
      {hint ? <p className="text-caption text-on-surface-variant">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Form đăng/sửa bản nhạc của khách. Tạo: bản nháp → tải từng file (có % tải lên) → đăng công khai; bước lỗi giữ nguyên tiến độ
 * và "Thử lại" chạy tiếp từ bước dở (không tạo bản nháp thứ hai, không tải lại file đã xong). Sửa: lưu metadata, đổi/gỡ file tức thì,
 * đăng/gỡ về nháp, xoá.
 */
export function SheetUploadForm({ mode, sheetId, composers, genres }: { mode: 'create' | 'edit'; sheetId?: string; composers: Option[]; genres: Option[] }) {
  const t = useTranslations('MySheets');
  const nav = useTranslations('Nav');
  const auth = useCustomer();
  const router = useRouter();
  const uid = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loaded, setLoaded] = useState(mode === 'create');
  const [missing, setMissing] = useState(false);
  const [files, setFiles] = useState<Partial<Record<SlotKind, File>>>({});
  const [done, setDone] = useState<Partial<Record<SlotKind, true>>>({});
  const [progress, setProgress] = useState<Partial<Record<SlotKind, number>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<Partial<Record<SlotKind, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;

  const token = useCallback(async () => {
    const value = getToken ? await getToken() : null;
    if (!value) throw new ApiError(401, 'UNAUTHORIZED', 'no token');
    return value;
  }, [getToken]);

  // Chế độ sửa: tải bài của tôi (404 nếu không phải của mình).
  useEffect(() => {
    if (mode !== 'edit' || !sheetId || !customerId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loadedSheet = await customerApi.getMySheet(await token(), sheetId);
        if (cancelled) return;
        setSheet(loadedSheet);
        setValues(fromSheet(loadedSheet));
        setLoaded(true);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, sheetId, customerId, token]);

  if (!auth || auth.status === 'loading') return <Skeleton className="h-96 w-full rounded-xl" />;
  if (auth.status === 'anonymous' || !auth.customer) {
    return (
      <section aria-labelledby="mysheets-login" className={`${calloutCardClass} items-start`}>
        <h2 id="mysheets-login" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          <Lock aria-hidden="true" className="size-5" />
          {t('loginTitle')}
        </h2>
        <p className="text-body-md text-on-surface-variant">{t('loginBody')}</p>
        <Button onClick={() => auth.openAuth('login')}>{t('login')}</Button>
      </section>
    );
  }
  if (missing) {
    return (
      <p role="alert" className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-body-lg text-on-surface">
        {t('errors.notFound')}
      </p>
    );
  }
  if (!loaded) return <Skeleton className="h-96 w-full rounded-xl" />;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const slotLabel: Record<SlotKind, string> = { pdf: t('files.pdf'), midi: t('files.midi'), mp3: t('files.mp3') };
  const currentName: Record<SlotKind, string | null> = { pdf: sheet?.pdf?.originalName ?? (sheet?.pdf ? '' : null), midi: sheet?.midi?.originalName ?? (sheet?.midi ? '' : null), mp3: sheet?.mp3?.originalName ?? (sheet?.mp3 ? '' : null) };

  const fail = (err: unknown) => {
    setErrors(fieldErrors(err));
    setFormError(err instanceof ApiError && err.code === 'VALIDATION_FAILED' && Object.keys(fieldErrors(err)).length > 0 ? null : t(`errors.${errorKey(err)}`));
  };

  const uploadOne = async (id: string, kind: SlotKind, file: File): Promise<Sheet> => {
    setSlotError((prev) => ({ ...prev, [kind]: undefined }));
    setProgress((prev) => ({ ...prev, [kind]: 0 }));
    try {
      return await customerApi.uploadMySheetFile(await token(), id, TYPE_OF[kind], file, (fraction) => setProgress((prev) => ({ ...prev, [kind]: fraction })));
    } catch (err) {
      setSlotError((prev) => ({ ...prev, [kind]: t(`errors.${errorKey(err)}`) }));
      throw err;
    } finally {
      setProgress((prev) => ({ ...prev, [kind]: undefined }));
    }
  };

  const pickFile = (kind: SlotKind, file: File) => {
    setSlotError((prev) => ({ ...prev, [kind]: undefined }));
    if (file.size > MAX[kind]) return setSlotError((prev) => ({ ...prev, [kind]: t('errors.fileTooLarge') }));
    if (mode === 'create') {
      setFiles((prev) => ({ ...prev, [kind]: file }));
      setDone((prev) => ({ ...prev, [kind]: undefined }));
      return;
    }
    // Sửa: tải lên ngay.
    setBusy(true);
    void uploadOne(sheetId!, kind, file)
      .then((updated) => setSheet(updated))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const removeFile = (kind: SlotKind) => {
    if (mode !== 'edit' || !sheetId) return;
    setBusy(true);
    void (async () => {
      try {
        await customerApi.removeMySheetFile(await token(), sheetId, kind);
        setSheet(await customerApi.getMySheet(await token(), sheetId));
      } catch (err) {
        setSlotError((prev) => ({ ...prev, [kind]: t(`errors.${errorKey(err)}`) }));
      } finally {
        setBusy(false);
      }
    })();
  };

  /** Tạo: bản nháp → file → (đăng). Mỗi bước chỉ chạy nếu chưa xong, nên "Thử lại" tiếp tục từ chỗ dở. */
  const runCreate = async (publish: boolean) => {
    setErrors({});
    setFormError(null);
    if (publish && !files.pdf) return setSlotError((prev) => ({ ...prev, pdf: t('needPdf') }));
    setBusy(true);
    try {
      let current = sheet;
      if (!current) {
        current = await customerApi.createMySheet(await token(), { ...buildBody(values, false), ...composerPart(values.composer, composers) } as CreateMemberSheetRequest);
        setSheet(current);
      }
      for (const kind of ORDER) {
        const file = files[kind];
        if (!file || done[kind]) continue;
        current = await uploadOne(current.id, kind, file);
        setDone((prev) => ({ ...prev, [kind]: true }));
        setSheet(current);
      }
      if (publish) current = await customerApi.publishMySheet(await token(), current.id);
      router.push(publish ? `/sheet/${current.slug}` : '/my-sheets');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const runSave = async () => {
    if (!sheet) return;
    setErrors({});
    setFormError(null);
    setNotice(null);
    setBusy(true);
    try {
      const body: UpdateMemberSheetRequest = buildBody(values, true) as UpdateMemberSheetRequest;
      if (values.composer.trim() !== sheet.composer.name) Object.assign(body, composerPart(values.composer, composers));
      const updated = await customerApi.updateMySheet(await token(), sheet.id, body);
      setSheet(updated);
      setValues(fromSheet(updated));
      setNotice(t('saved'));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (action: 'publish' | 'unpublish') => {
    if (!sheet) return;
    setFormError(null);
    setNotice(null);
    setBusy(true);
    try {
      const updated = action === 'publish' ? await customerApi.publishMySheet(await token(), sheet.id) : await customerApi.unpublishMySheet(await token(), sheet.id);
      setSheet(updated);
    } catch (err) {
      setFormError(err instanceof ApiError && err.code === 'VALIDATION_FAILED' ? t('errors.needPublishPdf') : t(`errors.${errorKey(err)}`));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await customerApi.deleteMySheet(await token(), sheet.id);
      router.push('/my-sheets');
    } catch (err) {
      setFormError(t(`errors.${errorKey(err)}`));
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'create') void runCreate(true);
    else void runSave();
  };

  const status = sheet?.status;
  const removedByAdmin = status === 'ARCHIVED';
  const inFlight = busy || Object.values(progress).some((p) => p !== undefined);

  return (
    <Card className="p-5 md:p-8">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6" aria-busy={inFlight || undefined}>
        <p className="text-caption text-on-surface-variant">{t('noticeFree')}</p>

        {mode === 'edit' && status ? (
          <p className="flex flex-wrap items-center gap-3 text-body-md text-on-surface" data-testid="sheet-status">
            <span className="rounded-full bg-surface-container px-3 py-1 text-caption font-semibold">{t(`status.${status}`)}</span>
            {removedByAdmin ? <span className="text-on-surface-variant">{t('removedByAdmin')}</span> : null}
            {status === 'PUBLISHED' && sheet ? (
              <Link href={`/sheet/${sheet.slug}`} className="text-primary underline underline-offset-4">
                {t('view')}
              </Link>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <Field id={`${uid}-title`} label={t('fields.title')} error={errors.title}>
            <Input id={`${uid}-title`} value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={200} required />
          </Field>
          <Field id={`${uid}-subtitle`} label={t('fields.subtitle')} error={errors.subtitle}>
            <Input id={`${uid}-subtitle`} value={values.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={200} />
          </Field>
          <Field id={`${uid}-composer`} label={t('fields.composer')} hint={t('fields.composerHint')} error={errors.composerId ?? errors.composerName}>
            <Input id={`${uid}-composer`} list={`${uid}-composers`} value={values.composer} onChange={(e) => set('composer', e.target.value)} maxLength={100} required />
            <datalist id={`${uid}-composers`}>
              {composers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field id={`${uid}-level`} label={t('fields.level')} error={errors.level}>
            <select
              id={`${uid}-level`}
              value={values.level}
              onChange={(e) => set('level', e.target.value as Level)}
              className="min-h-11 w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level.toUpperCase()}>
                  {nav(`levels.${level}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${uid}-score`} label={t('fields.difficultyScore')} error={errors.difficultyScore}>
            <Input id={`${uid}-score`} type="number" min={0} max={100} step={1} value={values.difficultyScore} onChange={(e) => set('difficultyScore', e.target.value)} />
          </Field>
          <Field id={`${uid}-note`} label={t('fields.difficultyNote')} error={errors.difficultyNote}>
            <Input id={`${uid}-note`} value={values.difficultyNote} onChange={(e) => set('difficultyNote', e.target.value)} maxLength={500} />
          </Field>
        </div>

        {genres.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-md font-semibold text-on-surface">{t('fields.genres')}</legend>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => {
                const on = values.genreIds.includes(genre.id);
                return (
                  <label
                    key={genre.id}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-body-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary ${on ? 'border-secondary-strong bg-secondary-strong text-on-secondary' : 'border-outline-variant bg-surface-bright text-on-surface'}`}
                  >
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set('genreIds', on ? values.genreIds.filter((g) => g !== genre.id) : [...values.genreIds, genre.id])} />
                    {genre.name}
                  </label>
                );
              })}
            </div>
            {errors.genreIds ? <p role="alert" className="text-body-md text-error">{errors.genreIds}</p> : null}
          </fieldset>
        ) : null}

        <Field id={`${uid}-description`} label={t('fields.description')} error={errors.description}>
          <textarea id={`${uid}-description`} rows={3} className={textarea} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} />
        </Field>
        <Field id={`${uid}-youtube`} label={t('fields.youtube')} error={errors.youtubeUrl}>
          <Input id={`${uid}-youtube`} type="url" value={values.youtube} onChange={(e) => set('youtube', e.target.value)} maxLength={500} />
        </Field>
        <Field id={`${uid}-lyrics`} label={t('fields.lyrics')} error={errors.lyricsChords}>
          <textarea id={`${uid}-lyrics`} rows={5} className={textarea} value={values.lyrics} onChange={(e) => set('lyrics', e.target.value)} />
        </Field>

        <div className="grid gap-5">
          {ORDER.map((kind) => (
            <FileSlot
              key={kind}
              kind={kind}
              label={slotLabel[kind]}
              hint={t(`files.${kind}Hint`, { max: MAX[kind] / MB })}
              accept={ACCEPT[kind]}
              currentName={mode === 'edit' ? currentName[kind] : null}
              pending={mode === 'create' ? (files[kind] ?? null) : null}
              progress={progress[kind] ?? null}
              error={slotError[kind]}
              disabled={busy || removedByAdmin}
              onPick={(file) => pickFile(kind, file)}
              {...(mode === 'edit' ? { onRemove: () => removeFile(kind) } : {})}
            />
          ))}
        </div>

        {formError ? (
          <p role="alert" className="text-body-md text-error">
            {formError}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-body-md text-on-surface">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'create' ? (
            <>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? t('working') : sheet ? t('resume') : t('submit')}
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onClick={() => void runCreate(false)}>
                {t('saveDraft')}
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" size="lg" disabled={busy || removedByAdmin}>
                {busy ? t('working') : t('save')}
              </Button>
              {status === 'PUBLISHED' ? (
                <Button size="lg" variant="secondary" disabled={busy} onClick={() => void lifecycle('unpublish')}>
                  {t('unpublish')}
                </Button>
              ) : status === 'DRAFT' ? (
                <Button size="lg" variant="secondary" disabled={busy} onClick={() => void lifecycle('publish')}>
                  {t('publish')}
                </Button>
              ) : null}
              {confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2" role="alert">
                  <span className="text-body-md text-on-surface">{t('deleteConfirm')}</span>
                  <Button variant="primary" disabled={busy} onClick={() => void remove()}>
                    {t('deleteYes')}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    {t('cancel')}
                  </Button>
                </span>
              ) : (
                <Button size="lg" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  {t('delete')}
                </Button>
              )}
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
