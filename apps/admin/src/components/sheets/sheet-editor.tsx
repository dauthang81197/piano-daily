'use client';

import { SHEET_STATUS_LABELS, SheetStatus, type Sheet } from '@piano-daily/shared';
import { ArrowLeft, Flame } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/client';
import { sheetsApi } from '@/lib/api/sheets';
import { MidiUploader } from './midi-uploader';
import { Mp3Uploader } from './mp3-uploader';
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
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function updateLifecycle(work: () => Promise<Sheet>) {
    setBusy(true);
    setError(null);
    try { setSheet(await work()); } catch (err) { setError(isApiError(err) ? err.message : 'Không thể cập nhật trạng thái Sheet. Vui lòng thử lại.'); } finally { setBusy(false); }
  }

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
      {sheet && <MidiUploader sheet={sheet} onUploaded={setSheet} />}
      {sheet && <Mp3Uploader sheet={sheet} onUploaded={setSheet} />}
      {sheet && <div className="flex flex-wrap items-center gap-2 rounded-md border p-4">
        <span className="mr-auto text-sm">Trạng thái: {SHEET_STATUS_LABELS[sheet.status]}</span>
        {Object.values(SheetStatus).filter((status) => status !== sheet.status).map((status) =>
          <Button key={status} type="button" variant="outline" disabled={busy} onClick={() => void updateLifecycle(() => sheetsApi.setStatus(sheet.id, status))}>
            {status === 'PUBLISHED' ? 'Publish' : status === 'ARCHIVED' ? 'Lưu trữ' : 'Chuyển về Draft'}
          </Button>)}
        <Button type="button" variant="outline" disabled={busy} onClick={() => void updateLifecycle(() => sheetsApi.setHot(sheet.id, !sheet.isHot))}>
          <Flame aria-hidden="true" className="size-4" /> {sheet.isHot ? 'Bỏ HOT' : 'Đánh dấu HOT'}
        </Button>
        <DeleteConfirm
          itemLabel={sheet.title}
          disabled={busy}
          onConfirm={async () => { await sheetsApi.remove(sheet.id); router.push('/sheets'); }}
          onError={(err) => setError(isApiError(err) ? err.message : 'Không thể xoá Sheet. Vui lòng thử lại.')}
        />
      </div>}
      {/* key: dựng lại form khi tải xong để defaultValues lấy dữ liệu của Sheet. */}
      {sheet && <SheetForm key={sheet.id} sheet={sheet} onSaved={setSheet} />}
    </section>
  );
}
