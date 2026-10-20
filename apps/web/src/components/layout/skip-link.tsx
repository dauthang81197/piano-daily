import { useTranslations } from 'next-intl';

/** Link đầu tiên của trang: người dùng bàn phím nhảy thẳng tới nội dung, bỏ qua header. Chỉ hiện khi nhận focus. */
export function SkipLink() {
  const t = useTranslations('Nav');
  return (
    <a
      href="#main-content"
      className="skip-link rounded-md bg-primary px-4 py-2 text-body-md font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      {t('skipToContent')}
    </a>
  );
}
