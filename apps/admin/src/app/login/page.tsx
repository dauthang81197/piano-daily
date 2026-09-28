'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@piano-daily/shared';
import { Info } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-provider';
import { loginErrorMessage } from '@/lib/auth/messages';
import { PASSWORD_CHANGED_REASON, safeNextPath } from '@/lib/auth/redirect';

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const passwordChanged = params.get('reason') === PASSWORD_CHANGED_REASON;
  const { state, login, restore } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  // Không tới được API khi khôi phục phiên: vẫn hiện form (lỗi sẽ hiện khi gửi).
  const [restoreFailed, setRestoreFailed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  // Tải trang khi còn phiên (cookie refresh hợp lệ) -> vào thẳng khu quản trị.
  useEffect(() => {
    if (state.status !== 'unknown') return;
    restore().catch((err: unknown) => {
      setRestoreFailed(true);
      setFormError(loginErrorMessage(err));
    });
  }, [state.status, restore]);

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next);
  }, [state.status, router, next]);

  if (state.status === 'authenticated' || (state.status === 'unknown' && !restoreFailed)) return <LoadingScreen />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
    } catch (err) {
      setFormError(loginErrorMessage(err));
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-margin-mobile py-12">
      <Card className="w-full max-w-sm gap-6 py-8">
        <CardHeader className="px-8">
          <p className="text-label-caps uppercase text-secondary">Piano Daily</p>
          <h1 data-slot="card-title" className="font-heading text-headline-sm font-medium leading-snug">
            Đăng nhập quản trị
          </h1>
          <CardDescription>Dùng email và mật khẩu của tài khoản quản trị.</CardDescription>
        </CardHeader>
        <CardContent className="px-8">
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            {passwordChanged ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-sm bg-surface-container px-3 py-2.5 text-sm text-on-surface"
              >
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
                <p>Đã đổi mật khẩu. Vui lòng đăng nhập lại.</p>
              </div>
            ) : null}
            <FormError>{formError}</FormError>
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              error={errors.email?.message}
              {...register('email')}
            />
            <FormField
              id="password"
              label="Mật khẩu"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginScreen />
    </Suspense>
  );
}
