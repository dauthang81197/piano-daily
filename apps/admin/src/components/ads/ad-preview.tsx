'use client';

/**
 * Preview `html_code` trong iframe sandbox: script chạy được nhưng KHÔNG có `allow-same-origin`
 * nên không chạm được DOM, cookie hay token của admin. HTML chỉ đi qua `srcDoc`, không bao giờ vào DOM admin.
 */
export function AdPreview({ html }: { html: string }) {
  return (
    <iframe
      title="Xem trước quảng cáo"
      sandbox="allow-scripts allow-popups"
      srcDoc={html}
      referrerPolicy="no-referrer"
      className="h-40 w-full rounded-sm border border-dashed bg-white"
    />
  );
}
