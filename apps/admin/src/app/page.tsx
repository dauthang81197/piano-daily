import { Button } from '@/components/ui/button';

export default function AdminHomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-gutter px-margin-mobile">
      <p className="text-label-caps uppercase text-secondary">Khu quản trị</p>
      <h1 className="font-display text-headline-md text-primary">Piano Daily Admin</h1>
      <p className="text-body-md text-muted-foreground">Trang đăng nhập và bảng điều khiển sẽ có ở Story 1.3.</p>
      <div>
        <Button disabled>Đăng nhập (sắp có)</Button>
      </div>
    </main>
  );
}
