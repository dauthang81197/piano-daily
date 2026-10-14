'use client';

import {
  COURSE_DESCRIPTION_MAX,
  COURSE_LEVEL_PRESET_LABELS,
  COURSE_LEVEL_PRESETS,
  COURSE_TITLE_MAX,
  type CourseKind,
  type CourseLevelPreset,
} from '@piano-daily/shared';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { coursesApi } from '@/lib/api/courses';

export const COURSE_READ_ONLY_REASON = 'Chỉ SUPER_ADMIN được thay đổi khoá học.';

export const KIND_LABEL: Record<Exclude<CourseKind, 'lessons'>, string> = {
  tracks: 'nhánh',
  levels: 'level',
  sections: 'section',
};

type Values = { title: string; titleEn: string; description: string; descriptionEn: string; isPublished: boolean; preset: CourseLevelPreset | '' };
type FieldErrors = Partial<Record<keyof Values, string>>;
const FIELDS = ['title', 'titleEn', 'description', 'descriptionEn', 'isPublished', 'preset'] as const;
const EN_HINT = 'Để trống thì web tiếng Anh dùng bản tiếng Việt.';

/** Form tạo/sửa nhánh, level hoặc section (tiêu đề, mô tả, công khai). `parent` chỉ khi tạo cấp con. */
export function NodeForm({
  kind,
  item,
  parent,
  canWrite,
  onDone,
  onCancel,
}: {
  kind: Exclude<CourseKind, 'lessons'>;
  item: {
    id: string;
    title: string;
    titleEn: string | null;
    description: string;
    descriptionEn: string | null;
    isPublished: boolean;
    preset?: CourseLevelPreset | null;
  } | null;
  parent?: { key: 'trackId' | 'levelId'; id: string };
  canWrite: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const label = KIND_LABEL[kind];
  const [values, setValues] = useState<Values>({
    title: item?.title ?? '',
    titleEn: item?.titleEn ?? '',
    description: item?.description ?? '',
    descriptionEn: item?.descriptionEn ?? '',
    isPublished: item?.isPublished ?? false,
    // Level mới mặc định "Sơ cấp"; level cũ không có mức là "Khác" (tự đặt tên).
    preset: kind === 'levels' ? (item ? (item.preset ?? '') : 'BEGINNER') : '',
  });
  const usesPreset = kind === 'levels' && values.preset !== '';
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canWrite) return;
    const title = values.title.trim();
    if (!title && !usesPreset) {
      setErrors({ title: `Vui lòng nhập tên ${label}.` });
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body = {
        title,
        titleEn: values.titleEn.trim() || null,
        description: values.description,
        descriptionEn: values.descriptionEn.trim() || null,
        isPublished: values.isPublished,
        ...(kind === 'levels' ? { preset: values.preset || null } : {}),
        ...(parent && !item ? { [parent.key]: parent.id } : {}),
      };
      if (item) await coursesApi.update(kind, item.id, body);
      else await coursesApi.create(kind, body);
      onDone();
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setErrors((e) => ({ ...e, [field]: message }))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={`Form ${label}`}>
      <FormError>{formError}</FormError>
      {!canWrite && <p className="text-sm text-muted-foreground">{COURSE_READ_ONLY_REASON}</p>}
      {kind === 'levels' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="node-preset">Mức</Label>
          <select
            id="node-preset"
            value={values.preset}
            disabled={!canWrite}
            onChange={(e) => set('preset', e.target.value as Values['preset'])}
            className="h-8 w-fit rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {COURSE_LEVEL_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {COURSE_LEVEL_PRESET_LABELS[preset].vi} / {COURSE_LEVEL_PRESET_LABELS[preset].en}
              </option>
            ))}
            <option value="">Khác (tự đặt tên)</option>
          </select>
          <FormError size="sm">{errors.preset}</FormError>
        </div>
      )}
      {!usesPreset && (
        <>
          <FormField
            id={`node-title-${kind}`}
            label={`Tên ${label}`}
            value={values.title}
            maxLength={COURSE_TITLE_MAX}
            onChange={(e) => set('title', e.target.value)}
            error={errors.title}
            disabled={!canWrite}
          />
          <FormField
            id={`node-title-en-${kind}`}
            label={`Tên ${label} (English, tuỳ chọn)`}
            placeholder={EN_HINT}
            value={values.titleEn}
            maxLength={COURSE_TITLE_MAX}
            onChange={(e) => set('titleEn', e.target.value)}
            error={errors.titleEn}
            disabled={!canWrite}
          />
        </>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`node-desc-${kind}`}>Mô tả</Label>
        <Textarea
          id={`node-desc-${kind}`}
          rows={3}
          value={values.description}
          maxLength={COURSE_DESCRIPTION_MAX}
          onChange={(e) => set('description', e.target.value)}
          disabled={!canWrite}
        />
        <FormError size="sm">{errors.description}</FormError>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`node-desc-en-${kind}`}>Mô tả (English, tuỳ chọn)</Label>
        <Textarea
          id={`node-desc-en-${kind}`}
          rows={3}
          value={values.descriptionEn}
          maxLength={COURSE_DESCRIPTION_MAX}
          onChange={(e) => set('descriptionEn', e.target.value)}
          disabled={!canWrite}
        />
        <p className="text-caption text-muted-foreground">{EN_HINT}</p>
        <FormError size="sm">{errors.descriptionEn}</FormError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={values.isPublished} disabled={!canWrite} onChange={(e) => set('isPublished', e.target.checked)} />
        Công khai (hiện trên web)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {canWrite ? 'Huỷ' : 'Đóng'}
        </Button>
        {canWrite && (
          <Button type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        )}
      </div>
    </form>
  );
}
