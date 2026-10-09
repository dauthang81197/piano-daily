'use client';

import type { PurchasableFileType, Quote } from '@piano-daily/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchQuote } from '@/lib/public-api';
import { PaymentModal } from './payment-modal';

type PurchaseState = {
  /** Báo giá lúc mount trang; `null` khi chưa tải hoặc lỗi (khi đó nút vẫn bật, modal tự lấy lại báo giá). */
  quote: Quote | null;
  open: (type: PurchasableFileType, trigger: HTMLElement | null) => void;
};

const PurchaseContext = createContext<PurchaseState | null>(null);

export function usePurchase(): PurchaseState | null {
  return useContext(PurchaseContext);
}

/**
 * Giữ báo giá của trang chi tiết (lấy phía client khi mount để biết `paymentsEnabled`, `no-store`) và trạng thái modal
 * dùng chung cho mọi nhóm nút mua trong trang, để chỉ có một request báo giá và một modal.
 */
export function PurchaseProvider({ sheetId, title, children }: { sheetId: string; title: string; children: ReactNode }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [modalType, setModalType] = useState<PurchasableFileType | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchQuote(sheetId, controller.signal)
      .then(setQuote)
      .catch(() => undefined); // lỗi: giữ nút bật, modal sẽ báo lỗi và cho thử lại
    return () => controller.abort();
  }, [sheetId]);

  const open = useCallback((type: PurchasableFileType, el: HTMLElement | null) => {
    trigger.current = el;
    setModalType(type);
  }, []);

  const close = useCallback(() => {
    setModalType(null);
    const el = trigger.current;
    trigger.current = null;
    // Trả focus về nút đã mở modal sau khi modal đã gỡ khỏi DOM.
    queueMicrotask(() => el?.focus());
  }, []);

  const value = useMemo(() => ({ quote, open }), [quote, open]);

  return (
    <PurchaseContext.Provider value={value}>
      {children}
      {modalType ? <PaymentModal sheetId={sheetId} title={title} initialType={modalType} onClose={close} /> : null}
    </PurchaseContext.Provider>
  );
}
