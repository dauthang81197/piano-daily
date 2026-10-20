'use client';

import type { ScoreConversion } from '@piano-daily/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';

/** Hỏi trạng thái mỗi 3 giây; bỏ cuộc sau ~12 phút (lâu hơn thời gian chờ tối đa của API). */
export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_MS = 12 * 60_000;

export type ConvertError =
  | { kind: 'daily-limit'; retryAfterSeconds: number | null }
  | { kind: 'active'; id: string | null }
  | { kind: 'unsupported' | 'too-large' | 'invalid' | 'disabled' | 'busy' | 'unverified' | 'network' | 'timeout' | 'generic' };

export type ConvertState =
  | { phase: 'idle' }
  /** `progress` = tỉ lệ đã tải lên (0..1). */
  | { phase: 'uploading'; progress: number }
  | { phase: 'running'; job: ScoreConversion }
  | { phase: 'done'; job: ScoreConversion }
  | { phase: 'failed'; job: ScoreConversion }
  | { phase: 'expired' }
  | { phase: 'error'; error: ConvertError };

export function toConvertError(err: unknown): ConvertError {
  if (!(err instanceof ApiError)) return { kind: 'generic' };
  const details = (err.details ?? {}) as { id?: unknown; retryAfterSeconds?: unknown };
  switch (err.code) {
    case 'SCORE_DAILY_LIMIT':
      return { kind: 'daily-limit', retryAfterSeconds: typeof details.retryAfterSeconds === 'number' ? details.retryAfterSeconds : null };
    case 'SCORE_ACTIVE_JOB':
      return { kind: 'active', id: typeof details.id === 'string' ? details.id : null };
    case 'UNSUPPORTED_FILE_TYPE':
      return { kind: 'unsupported' };
    case 'FILE_TOO_LARGE':
      return { kind: 'too-large' };
    case 'VALIDATION_FAILED':
      return { kind: 'invalid' };
    case 'FEATURE_DISABLED':
      return { kind: 'disabled' };
    case 'SERVICE_UNAVAILABLE':
      return { kind: 'busy' };
    case 'EMAIL_NOT_VERIFIED':
      return { kind: 'unverified' };
    case 'NETWORK_ERROR':
      return { kind: 'network' };
    default:
      return { kind: 'generic' };
  }
}

/** Đặt `?job=<id>` trên URL (không điều hướng) để tải lại trang vẫn tiếp tục theo dõi việc. */
function rememberJob(id: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('job', id);
    else url.searchParams.delete('job');
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // Không ghi được URL thì thôi: chỉ mất khả năng khôi phục khi tải lại.
  }
}

/**
 * Vòng đời một lần chuyển nhạc: tải lên → hỏi trạng thái → xong/lỗi. Chỉ chạy khi đã đăng nhập; dừng hỏi khi rời trang hoặc
 * đổi tài khoản. `initialId` (từ `?job=`) cho phép tiếp tục một việc đang có.
 */
export function useScoreJob(initialId: string | null) {
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  // `getToken` đổi danh tính theo phiên: giữ bản mới nhất trong ref để vòng hỏi trạng thái không bị khởi động lại giữa chừng.
  const getTokenRef = useRef(auth?.getToken);
  getTokenRef.current = auth?.getToken;
  const [state, setState] = useState<ConvertState>({ phase: 'idle' });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(
    (id: string, startedAt: number) => {
      const mine = generation.current;
      const tick = async () => {
        const getToken = getTokenRef.current;
        if (mine !== generation.current || !getToken) return;
        try {
          const token = await getToken();
          if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'no token');
          const job = await customerApi.getScore(token, id);
          if (mine !== generation.current) return;
          if (job.status === 'DONE') return setState({ phase: 'done', job });
          if (job.status === 'FAILED') return setState({ phase: 'failed', job });
          setState({ phase: 'running', job });
        } catch (err) {
          if (mine !== generation.current) return;
          if (err instanceof ApiError && err.status === 404) {
            rememberJob(null);
            return setState({ phase: 'expired' });
          }
          // Lỗi mạng tạm thời: thử lại ở lần hỏi sau (tới khi hết thời gian chờ).
        }
        if (Date.now() - startedAt > POLL_MAX_MS) return setState({ phase: 'error', error: { kind: 'timeout' } });
        timer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      };
      void tick();
    },
    [],
  );

  // Tiếp tục việc đang có (từ `?job=`) khi đã biết khách; đổi/đăng xuất thì dừng và xoá sạch.
  useEffect(() => {
    if (!customerId) {
      stop();
      setState({ phase: 'idle' });
      return;
    }
    if (initialId) poll(initialId, Date.now());
    return stop;
  }, [customerId, initialId, poll, stop]);

  const start = useCallback(
    async (file: File, transpose: number) => {
      const getToken = getTokenRef.current;
      if (!getToken) return;
      stop();
      setState({ phase: 'uploading', progress: 0 });
      // Chỉ cập nhật khi phần trăm nguyên đổi, tránh dựng lại giao diện hàng trăm lần mỗi giây.
      let lastPercent = 0;
      const onProgress = (fraction: number) => {
        const percent = Math.round(fraction * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        setState((prev) => (prev.phase === 'uploading' ? { phase: 'uploading', progress: fraction } : prev));
      };
      try {
        const token = await getToken();
        if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'no token');
        const job = await customerApi.createScore(token, file, transpose, onProgress);
        rememberJob(job.id);
        setState({ phase: 'running', job });
        poll(job.id, Date.now());
      } catch (err) {
        const error = toConvertError(err);
        // Đã có việc đang chạy: theo dõi việc đó thay vì báo lỗi.
        if (error.kind === 'active' && error.id) {
          rememberJob(error.id);
          poll(error.id, Date.now());
          return;
        }
        setState({ phase: 'error', error });
      }
    },
    [poll, stop],
  );

  const reset = useCallback(() => {
    stop();
    rememberJob(null);
    setState({ phase: 'idle' });
  }, [stop]);

  const remove = useCallback(async () => {
    const job = state.phase === 'done' || state.phase === 'failed' || state.phase === 'running' ? state.job : null;
    reset();
    const getToken = getTokenRef.current;
    if (!job || !getToken) return;
    try {
      const token = await getToken();
      if (token) await customerApi.deleteScore(token, job.id);
    } catch {
      // Xoá lỗi thì kết quả vẫn tự hết hạn.
    }
  }, [state, reset]);

  return { state, start, reset, remove };
}
