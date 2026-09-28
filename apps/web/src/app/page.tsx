export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-gutter px-margin-mobile md:px-margin-desktop">
      <p className="font-sans text-label-caps uppercase text-secondary">Sắp ra mắt</p>
      <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">Piano Daily</h1>
      <p className="max-w-prose text-body-lg text-on-surface-variant">
        Thư viện sheet piano tuyển chọn — bản nhạc rõ ràng, phân cấp theo trình độ, tải về dễ dàng.
      </p>
    </main>
  );
}
