'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSheetSchema,
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  Level,
  LEVEL_LABELS,
  type Sheet,
  SHEET_STATUS_LABELS,
} from '@piano-daily/shared';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Field, fieldAria } from '@/components/taxonomy/field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { useComposerOptions } from '@/components/taxonomy/use-composer-options';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { sheetsApi } from '@/lib/api/sheets';
import { MarkdownEditor } from './markdown-editor';
import { useGenreOptions, useSeriesOptions } from './use-catalog-options';
import { YoutubePreview } from './youtube-preview';

const S = createSheetSchema.shape;
const DIFFICULTY_ERROR = `Độ khó phải là số nguyên từ ${DIFFICULTY_MIN} đến ${DIFFICULTY_MAX}.`;

/** Schema của form: dùng lại DTO shared; ô độ khó là chuỗi (ô trống = không đặt). Output là body gửi API. */
export const sheetFormSchema = z.object({
  title: S.title,
  subtitle: S.subtitle,
  composerId: S.composerId,
  seriesId: S.seriesId,
  level: S.level,
  difficultyScore: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (!value) return null;
      const n = Number(value);
      if (!/^\d+$/.test(value) || n < DIFFICULTY_MIN || n > DIFFICULTY_MAX) {
        ctx.issues.push({ code: 'custom', message: DIFFICULTY_ERROR, input: value });
        return z.NEVER;
      }
      return n;
    }),
  difficultyNote: S.difficultyNote,
  description: S.description,
  lyricsChords: S.lyricsChords,
  youtubeUrl: S.youtubeUrl,
  genreIds: S.genreIds,
});

type FormInput = z.input<typeof sheetFormSchema>;

const FIELDS = [
  'title',
  'subtitle',
  'composerId',
  'seriesId',
  'level',
  'difficultyScore',
  'difficultyNote',
  'description',
  'lyricsChords',
  'youtubeUrl',
  'genreIds',
] as const;

const NO_SERIES = 'none';
const LEVEL_ITEMS = Object.values(Level).map((value) => ({ value, label: LEVEL_LABELS[value] }));

function defaults(sheet: Sheet | null): FormInput {
  return {
    title: sheet?.title ?? '',
    subtitle: sheet?.subtitle ?? '',
    composerId: sheet?.composer.id ?? '',
    seriesId: sheet?.series?.id ?? null,
    level: sheet?.level ?? ('' as Level),
    difficultyScore: sheet?.difficultyScore == null ? '' : String(sheet.difficultyScore),
    difficultyNote: sheet?.difficultyNote ?? '',
    description: sheet?.description ?? '',
    lyricsChords: sheet?.lyricsChords ?? '',
    youtubeUrl: sheet?.youtubeUrl ?? '',
    genreIds: sheet?.genres.map((g) => g.id) ?? [],
  };
}

/**
 * Form tạo/sửa thông tin Sheet (Draft). `sheet = null` là tạo mới.
 * Lỗi của trường hiện ngay dưới trường (client validate bằng DTO shared, lỗi server map theo `details.path`).
 */
export function SheetForm({ sheet, onSaved }: { sheet: Sheet | null; onSaved: (sheet: Sheet) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** Tạo xong: giữ nút gửi bị khoá trong lúc chuyển trang (tránh tạo trùng Draft). */
  const [created, setCreated] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(sheetFormSchema),
    mode: 'onTouched',
    defaultValues: defaults(sheet),
  });

  const composerId = useWatch({ control, name: 'composerId' });
  const seriesId = useWatch({ control, name: 'seriesId' });
  const youtubeUrl = useWatch({ control, name: 'youtubeUrl' });

  const composers = useComposerOptions(sheet?.composer);
  const series = useSeriesOptions(
    composerId,
    sheet?.series ? { ...sheet.series, composerId: sheet.composer.id } : null,
  );
  const genres = useGenreOptions(sheet?.genres);

  // Đổi Composer: Series đang chọn không thuộc Composer mới (hoặc không tải được danh sách Series) thì bỏ chọn.
  useEffect(() => {
    if (!seriesId) return;
    const settled = series.loaded || series.error;
    if (!composerId || (settled && !series.options.some((o) => o.value === seriesId))) {
      setValue('seriesId', null, { shouldDirty: true });
    }
  }, [composerId, seriesId, series.loaded, series.error, series.options, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setSavedAt(null);
    try {
      const saved = sheet ? await sheetsApi.update(sheet.id, values) : await sheetsApi.create(values);
      if (sheet) {
        reset(defaults(saved));
        setSavedAt(Date.now());
      } else {
        setCreated(true);
      }
      onSaved(saved);
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));
    }
  });

  const composerError =
    errors.composerId?.message ?? (composers.error ? 'Không tải được danh sách Composer. Vui lòng thử lại.' : undefined);
  const seriesError =
    errors.seriesId?.message ?? (series.error ? 'Không tải được danh sách Series. Vui lòng thử lại.' : undefined);
  const genreError =
    errors.genreIds?.message ??
    errors.genreIds?.root?.message ??
    (genres.error ? 'Không tải được danh sách Genre. Vui lòng thử lại.' : undefined);
  const seriesItems = [{ value: NO_SERIES, label: 'Không thuộc Series' }, ...series.options];

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
      <FormError>{formError}</FormError>

      {sheet && (
        <p className="text-sm text-muted-foreground">
          #{sheet.publicId} · Trạng thái: {SHEET_STATUS_LABELS[sheet.status]} · Slug <code>{sheet.slug}</code>
        </p>
      )}

      <FormField id="sheet-title" label="Tiêu đề" error={errors.title?.message} {...register('title')} />
      <FormField
        id="sheet-subtitle"
        label="Tiêu đề phụ (không bắt buộc)"
        error={errors.subtitle?.message}
        {...register('subtitle')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="sheet-composer" label="Composer" error={composerError}>
          <Controller
            control={control}
            name="composerId"
            render={({ field }) => (
              <Select items={composers.options} value={field.value || null} onValueChange={(v) => field.onChange(v ?? '')}>
                <SelectTrigger className="w-full" onBlur={field.onBlur} {...fieldAria('sheet-composer', composerError)}>
                  <SelectValue placeholder={composers.loading ? 'Đang tải Composer…' : 'Chọn Composer'} />
                </SelectTrigger>
                <SelectContent>
                  {composers.options.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field id="sheet-series" label="Series (không bắt buộc)" error={seriesError}>
          <Controller
            control={control}
            name="seriesId"
            render={({ field }) => (
              <Select
                items={seriesItems}
                value={field.value ?? NO_SERIES}
                disabled={!composerId || series.loading || series.error}
                onValueChange={(v) => field.onChange(!v || v === NO_SERIES ? null : v)}
              >
                <SelectTrigger className="w-full" onBlur={field.onBlur} {...fieldAria('sheet-series', seriesError)}>
                  <SelectValue placeholder="Chọn Series" />
                </SelectTrigger>
                <SelectContent>
                  {seriesItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="sheet-level" label="Cấp độ" error={errors.level?.message}>
          <Controller
            control={control}
            name="level"
            render={({ field }) => (
              <Select items={LEVEL_ITEMS} value={field.value || null} onValueChange={(v) => field.onChange(v ?? '')}>
                <SelectTrigger className="w-full" onBlur={field.onBlur} {...fieldAria('sheet-level', errors.level?.message)}>
                  <SelectValue placeholder="Chọn cấp độ" />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_ITEMS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <FormField
          id="sheet-difficulty"
          label={`Độ khó ${DIFFICULTY_MIN}–${DIFFICULTY_MAX} (không bắt buộc)`}
          inputMode="numeric"
          error={errors.difficultyScore?.message}
          {...register('difficultyScore')}
        />
      </div>

      <FormField
        id="sheet-difficulty-note"
        label="Ghi chú độ khó (không bắt buộc)"
        error={errors.difficultyNote?.message}
        {...register('difficultyNote')}
      />

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={genreError ? 'sheet-genres-error' : undefined}
        aria-invalid={genreError ? true : undefined}
      >
        <legend className="mb-2 text-sm font-medium">Genre (không bắt buộc)</legend>
        {genres.loading && <p className="text-sm text-muted-foreground">Đang tải Genre…</p>}
        {!genres.loading && genres.options.length === 0 && !genres.error && (
          <p className="text-sm text-muted-foreground">Chưa có Genre nào.</p>
        )}
        <Controller
          control={control}
          name="genreIds"
          render={({ field }) => {
            const selected = field.value ?? [];
            return (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {genres.options.map(({ value, label }) => {
                  const checked = selected.includes(value);
                  return (
                    <label key={value} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() =>
                          field.onChange(checked ? selected.filter((id) => id !== value) : [...selected, value])
                        }
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            );
          }}
        />
        <FormError id="sheet-genres-error" size="sm">
          {genreError}
        </FormError>
      </fieldset>

      <Field id="sheet-description" label="Mô tả (không bắt buộc)" error={errors.description?.message}>
        <Textarea
          rows={4}
          {...fieldAria('sheet-description', errors.description?.message)}
          {...register('description')}
        />
      </Field>

      <Field id="sheet-lyrics" label="Lyrics & chords (markdown, không bắt buộc)" error={errors.lyricsChords?.message}>
        <Controller
          control={control}
          name="lyricsChords"
          render={({ field }) => (
            <MarkdownEditor
              id="sheet-lyrics"
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={Boolean(errors.lyricsChords)}
              describedBy={errors.lyricsChords ? 'sheet-lyrics-error' : undefined}
              placeholder="[C] Lời bài hát kèm hợp âm…"
            />
          )}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <FormField
          id="sheet-youtube"
          label="Link YouTube (không bắt buộc)"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          error={errors.youtubeUrl?.message}
          {...register('youtubeUrl')}
        />
        <YoutubePreview url={youtubeUrl} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <p role="status" className="text-sm text-muted-foreground">
          {savedAt && !isDirty ? 'Đã lưu.' : ''}
        </p>
        <Button type="submit" className="ml-auto" disabled={isSubmitting || created}>
          {isSubmitting || created ? 'Đang lưu…' : sheet ? 'Lưu' : 'Tạo Sheet'}
        </Button>
      </div>
    </form>
  );
}
