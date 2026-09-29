'use client';

import type { Sheet } from '@piano-daily/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { isApiError } from '@/lib/api/client';
import { sheetsApi } from '@/lib/api/sheets';
import { PdfUploader } from './pdf-uploader';
import { SheetForm } from './sheet-form';

function BackLink() {
  return (
    <Link href="/sheets" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Danh sách Sheet
    </Link>
  );
}

/** Trang tạo Sheet: tạo xong chuyển sang trang sửa của Sheet vừa tạo. */
export function SheetCreatePage() {
  const router = useRouter();
  return (
    <section className="flex flex-col gap-6">
      <BackLink />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Tạo Sheet</h1>
        <p className="text-body-md text-muted-foreground">
          Sheet mới luôn ở trạng thái Draft. Upload file và publish làm ở các bước sau.
        </p>
      </div>
      <SheetForm sheet={null} onSaved={(created) => router.push(`/sheets/${created.id}`)} />
    </section>
  );
}

/** Trang sửa thông tin Sheet. */
export function SheetEditPage({ id }: { id: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    sheetsApi
      .get(id, controller.signal)
      .then(setSheet)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          isApiError(err) && err.code === 'NOT_FOUND'
            ? 'Không tìm thấy Sheet (có thể đường dẫn sai). Hãy quay lại danh sách.'
            : isApiError(err) && (err.code === 'NETWORK_ERROR' || err.status === 401)
              ? err.message
              : 'Không tải được Sheet. Vui lòng thử lại.',
        );
      });
    return () => controller.abort();
  }, [id]);

  return (
    <section className="flex flex-col gap-6">
      <BackLink />
      <h1 className="font-display text-headline-md text-primary">{sheet ? sheet.title : 'Sửa Sheet'}</h1>
      <FormError>{error}</FormError>
      {!sheet && !error && <p className="text-muted-foreground">Đang tải…</p>}
      {/* Upload xong chỉ cập nhật dữ liệu Sheet của trang; form giữ nguyên các trường đang sửa (không đổi key). */}
      {sheet && <PdfUploader sheet={sheet} onUploaded={setSheet} />}
      {/* key: dựng lại form khi tải xong để defaultValues lấy dữ liệu của Sheet. */}
      {sheet && <SheetForm key={sheet.id} sheet={sheet} onSaved={setSheet} />}
    </section>
  );
}
