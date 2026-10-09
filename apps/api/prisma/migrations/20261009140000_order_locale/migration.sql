-- Ngôn ngữ của người mua để gửi email link tải đúng locale (Story 3.7). Nullable; đơn cũ mặc định 'vi'.
ALTER TABLE "orders" ADD COLUMN "locale" TEXT DEFAULT 'vi';
ALTER TABLE "orders" ADD CONSTRAINT "orders_locale_check" CHECK ("locale" IN ('vi', 'en'));
