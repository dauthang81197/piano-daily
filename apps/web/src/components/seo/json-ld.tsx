import { serializeJsonLd } from '@/lib/json-ld';

/** Một khối JSON-LD (`<script type="application/ld+json">`), serialize an toàn; không có dữ liệu thì không render. */
export function JsonLd({ data }: { data: unknown }) {
  if (data === undefined || data === null) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
