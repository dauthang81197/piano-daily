'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordRequestSchema } from '@piano-daily/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-provider';
import { changePasswordErrorMessage } from '@/lib/auth/messages';

/**
 * Schema form = `changePasswordRequestSchema` (giữ nguyên mọi ràng buộc của hợp đồng API) + ô nhập lại mật khẩu mới,
 * để gõ nhầm mật khẩu mới không khoá founder khỏi tài khoản duy nhất.
 */
const changePasswordFormSchema = changePasswordRequestSchema
  .safeExtend({ confirmPassword: z.string() })
  .refine((body) => body.confirmPassword === body.newPassword, {
    path: ['confirmPassword'],
    error: 'Mật khẩu nhập lại không khớp với mật khẩu mới.',
  });

export default function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      // Thành công: phiên bị xoá, AuthGate đưa về /login kèm thông báo.
      await changePassword({ currentPassword, newPassword });
    } catch (err) {
      setFormError(changePasswordErrorMessage(err));
    }
  });

  return (
    <section className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Đổi mật khẩu</h1>
        <p className="text-body-md text-muted-foreground">
          Mật khẩu mới cần ít nhất 12 ký tự. Sau khi đổi, mọi phiên đăng nhập sẽ kết thúc và bạn cần đăng nhập lại.
        </p>
      </div>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError>{formError}</FormError>
        <FormField
          id="currentPassword"
          label="Mật khẩu hiện tại"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <FormField
          id="newPassword"
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <FormField
          id="confirmPassword"
          label="Nhập lại mật khẩu mới"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <div>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </Button>
        </div>
      </form>
    </section>
  );
}
