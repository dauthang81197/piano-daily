'use client';

import { useEffect, useRef } from 'react';
import { googleClientId } from '@/lib/public-env';

type GoogleId = {
  initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // cho phép thử lại lần mở modal sau
      reject(new Error('Không tải được Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Nút "Đăng nhập bằng Google" (Google Identity Services). Không render gì khi chưa cấu hình `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
 * Script chỉ nạp khi nút được mount (mở modal), không nằm trong bundle đầu trang.
 */
export function GoogleButton({ onCredential, onError }: { onCredential: (idToken: string) => void; onError: () => void }) {
  const clientId = googleClientId();
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const el = host.current;
        if (cancelled || !el || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) handlers.current.onCredential(response.credential);
            else handlers.current.onError();
          },
        });
        window.google.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', width: 320 });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onError();
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;
  return <div ref={host} data-testid="google-button" className="flex min-h-10 justify-center" />;
}
