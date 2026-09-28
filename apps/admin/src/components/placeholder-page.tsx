/** Trang giữ chỗ cho các mục chưa làm (nội dung thật ở các story sau). */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-display text-headline-md text-primary">{title}</h1>
      <p className="text-body-md text-muted-foreground">Sắp có ở story sau.</p>
    </section>
  );
}
