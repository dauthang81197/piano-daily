---
title: Piano Daily - Design
status: final
created: 2026-09-27
updated: 2026-09-27
name: Ivory & Walnut
description: Warm, conservatory-elegant visual system for a self-curated piano sheet-music library — evokes piano wood casing, ivory keys, and brass hardware rather than a generic "app" or a cluttered ad-supported sheet site.
colors:
  surface: '#FAF6EF'
  surface-bright: '#FFFFFF'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#F5EFE4'
  surface-container: '#EFE7D8'
  surface-container-high: '#E6DCC8'
  on-surface: '#241B14'
  on-surface-variant: '#5B4A3A'
  outline: '#8A7860'
  outline-variant: '#D8CBB0'
  primary: '#5C3A21'
  on-primary: '#FFFFFF'
  secondary: '#A97D2F'
  on-secondary: '#FFFFFF'
  tertiary: '#7A2E2A'
  error: '#B3261E'
  on-error: '#FFFFFF'
  error-container: '#F9DEDC'
  on-error-container: '#601410'
  level-beginner: '#5E7856'
  level-intermediate: '#3E5C74'
  level-advanced: '#A97D2F'
  level-expert: '#7A2E2A'
  hot-accent: '#C9432E'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '500'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '500'
    lineHeight: '1.25'
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 22px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.08em
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.375rem
  md: 0.5rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  section-gap: 64px
components:
  button-primary:
    background: '{colors.primary}'
    text: '{colors.on-primary}'
    rounded: '{rounded.md}'
  button-secondary:
    background: 'transparent'
    text: '{colors.primary}'
    border: '1px solid {colors.outline}'
    rounded: '{rounded.md}'
  button-download:
    background: '{colors.secondary}'
    text: '{colors.on-secondary}'
    rounded: '{rounded.md}'
  badge-level-beginner:
    background: '{colors.level-beginner}'
    text: '#FFFFFF'
  badge-level-intermediate:
    background: '{colors.level-intermediate}'
    text: '#FFFFFF'
  badge-level-advanced:
    background: '{colors.level-advanced}'
    text: '#FFFFFF'
  badge-level-expert:
    background: '{colors.level-expert}'
    text: '#FFFFFF'
  badge-hot:
    background: '{colors.hot-accent}'
    text: '#FFFFFF'
  card-sheet:
    background: '{colors.surface-container-low}'
    border: '1px solid {colors.outline-variant}'
    rounded: '{rounded.md}'
  input:
    background: '{colors.surface-container-lowest}'
    border: '1px solid {colors.outline-variant}'
    border-focus: '2px solid {colors.secondary}'
    rounded: '{rounded.sm}'
  ad-slot:
    background: '{colors.surface-container}'
    border: '1px dashed {colors.outline-variant}'
    rounded: '{rounded.sm}'
  form-error:
    background: '{colors.error-container}'
    text: '{colors.error}'
    rounded: '{rounded.sm}'
  tag-genre:
    background: '{colors.surface-container}'
    text: '{colors.on-surface-variant}'
    text-selected: '{colors.on-secondary}'
    background-selected: '{colors.secondary}'
    rounded: '{rounded.sm}'
  payment-modal:
    background: '{colors.surface-container-lowest}'
    rounded: '{rounded.lg}'
---

## Brand & Style

Piano Daily thuộc trường phái **Conservatory Elegant** — cảm giác của một phòng nhạc gỗ ấm, không phải một "app" lạnh hay một site sheet nhạc chằng chịt quảng cáo. Lấy cảm hứng từ vật liệu thật của cây đàn piano: gỗ walnut (`{colors.primary}`), ngà voi của phím trắng (`{colors.surface}`), và ánh đồng của bàn đạp/bản lề (`{colors.secondary}`). Đây là điểm khác biệt hình ảnh trực tiếp so với PianoSnap (nguồn tham khảo layout) — nơi giao diện lạnh, dày đặc quảng cáo sặc sỡ chen giữa nội dung.

Phong cách: **trang trọng nhưng ấm**, không lạnh lùng kiểu "học thuật khô khan", cũng không quá mềm/pastel kiểu app trẻ em. Mọi tương tác nên chậm rãi, có chủ đích — không hiệu ứng giật gân; MIDI player và trải nghiệm nghe thử là "sân khấu" của trang, mọi thứ khác lùi lại làm nền.

## Colors

- **`{colors.surface}` (Ivory, #FAF6EF)** — nền chính toàn site, gợi màu phím đàn trắng đã ngả màu theo thời gian, ấm hơn trắng thuần, giảm chói khi đọc lâu (phù hợp trang chi tiết Sheet có nhiều text/nốt nhạc).
- **`{colors.primary}` (Walnut, #5C3A21)** — màu gỗ đàn, dùng cho tiêu đề lớn, logo, nút chính không phải nút tải (ví dụ nút điều hướng/CTA khám phá). Không dùng cho toàn bộ nền lớn — quá nặng nếu phủ diện rộng.
- **`{colors.secondary}` (Brass, #A97D2F)** — ánh đồng, dùng riêng cho **hành động tải/mua** (nút Download PDF/.mp3/.mid, nút xác nhận trong modal thanh toán) để tách biệt rõ "hành động tốn tiền hoặc dẫn tới tốn tiền" khỏi điều hướng thông thường.
- **`{colors.tertiary}` (Deep Burgundy, #7A2E2A)** — dùng cho badge Level EXPERT và các điểm nhấn hiếm, trang trọng (không dùng cho lỗi — xem `{colors.error}` riêng).
- **`{colors.hot-accent}` (#C9432E)** — chỉ dùng cho badge "HOT", tách biệt khỏi burgundy của EXPERT dù cùng vùng màu ấm, để hai loại badge không bị nhầm khi đứng cạnh nhau trên một thẻ Sheet.
- **Level badges** (`level-beginner` xanh rêu trầm, `level-intermediate` xanh lam trầm, `level-advanced` = brass, `level-expert` = burgundy) — cố tình chọn tông trầm/muted thay vì màu neon như bản gốc PianoSnap, để badge vẫn phân biệt được nhanh bằng mắt nhưng không phá vỡ tổng thể trang trọng.
- **`{colors.on-surface-variant}` (#5B4A3A)** — màu chữ phụ (caption: lượt xem, ngày cập nhật, tên Composer dưới tiêu đề thẻ Sheet) — nhạt hơn `{colors.on-surface}` để tạo phân cấp thị giác giữa thông tin chính và phụ.
- **`{colors.error}` / `{colors.error-container}` (#B3261E / #F9DEDC)** — chỉ dùng cho lỗi thật (thanh toán thất bại, upload lỗi, form invalid): nền `error-container` nhạt phía sau khối thông báo lỗi, chữ `error` đậm bên trên — không dùng cho cảnh báo nhẹ.
- Khối quảng cáo (AdSlot) không dùng bất kỳ màu thương hiệu nào ở trên — xem Components.

`[ASSUMPTION]` Toàn bộ palette trên là màu do mình chọn theo hướng "cổ điển/nhạc viện" bạn đã chốt, chưa qua bước xem trực quan (Fast path bỏ qua creative tool tạo bảng màu) — nếu không ưng khi lên khung nhìn thật, đây là chỗ dễ đổi nhất, không ảnh hưởng cấu trúc EXPERIENCE.md.

## Typography

- **`{typography.display-lg}` / `{typography.headline-md}` / `{typography.headline-sm}` — Playfair Display.** Font serif cổ điển cho mọi tiêu đề (tên site, H1 trang Level, tên bài trên trang chi tiết Sheet). Có hỗ trợ dấu tiếng Việt trong Google Fonts.
- **`{typography.body-lg}` / `{typography.body-md}` / `{typography.label-caps}` / `{typography.caption}` — Be Vietnam Pro.** Font sans-serif thiết kế riêng cho tiếng Việt, dùng cho toàn bộ phần đọc dài (mô tả, Lyrics & Chords) và mọi UI chức năng (nút, nhãn, menu, form) — đảm bảo dấu tiếng Việt hiển thị đẹp ở cỡ chữ nhỏ, nơi font serif dễ vỡ nét dấu.
- `label-caps` (viết hoa, letter-spacing rộng) dùng riêng cho nhãn Level trên badge và nhãn định dạng file ([Sheet][Chords][Mp4/Midi]) — tạo cảm giác "nhãn đóng dấu" trang trọng thay vì chip bo tròn kiểu app thường.

`[ASSUMPTION]` Cặp font Playfair Display + Be Vietnam Pro là lựa chọn của mình để vừa giữ tinh thần cổ điển vừa đảm bảo dấu tiếng Việt rõ nét — bạn có thể yêu cầu đổi nếu có gu font khác.

## Layout & Spacing

Lưới 12 cột trên desktop, biên ngoài rộng (`{spacing.margin-desktop}` = 64px) để tạo cảm giác "trang sách" thay vì nội dung tràn sát mép như bản PianoSnap. Trên mobile, biên `{spacing.margin-mobile}` = 16px, đủ hẹp để tối đa hoá không gian cho lưới thẻ Sheet nhưng vẫn có khoảng thở.

Khoảng cách giữa các khối nội dung lớn (hero → tag cloud → lưới Sheet; hoặc trang chi tiết Sheet → sidebar liên quan) dùng `{spacing.section-gap}` = 64px, tạo nhịp nghỉ rõ ràng giữa các "chương" của trang — tương tự cách một buổi hoà nhạc có khoảng lặng giữa các phần.

Lưới thẻ Sheet: 3 cột desktop / 2 cột tablet / 1 cột mobile (kế thừa layout tham khảo từ PianoSnap, không đổi vì đã chứng minh hiệu quả cho việc duyệt nhanh).

## Elevation & Depth

Không dùng shadow đậm/sắc — chiều sâu thể hiện qua **phân lớp tông màu** (`surface` → `surface-container-low` → `surface-container` → `surface-container-high`), giống cách gỗ đàn có nhiều lớp vecni chồng lên nhau. Khi cần shadow thật (modal thanh toán nổi lên trên nền), dùng shadow khuếch tán nhẹ, ngả màu ấm: `rgba(92, 58, 33, 0.12)`, blur lớn (24px+), không có shadow sắc cạnh.

Border khi cần thiết dùng 1px `{colors.outline-variant}` — viền mảnh, gần như "ẩn", chỉ đủ để phân tách card khỏi nền.

## Shapes

Bo góc nhẹ (`{rounded.sm}`–`{rounded.md}`, 0.25–0.5rem) cho hầu hết thành phần — đủ mềm để không lạnh lùng như hình chữ nhật sắc cạnh, nhưng không bo tròn nhiều (không dùng `{rounded.full}` ngoài avatar/icon tròn) vì bo tròn nhiều gợi cảm giác "app di động vui nhộn", lệch khỏi tinh thần trang trọng. Ảnh thumbnail Sheet và thẻ Sheet dùng `{rounded.md}`; input và badge dùng `{rounded.sm}`.

## Components

- **Button chính (điều hướng/CTA thường):** nền `{colors.primary}`, chữ trắng, `{rounded.md}`. Dùng cho các hành động không liên quan tiền (ví dụ "Xem thêm bài liên quan", "Play & Practice this piece").
- **Button tải/mua (`button-download`):** nền `{colors.secondary}` (brass), chữ trắng — cố tình khác màu với button chính để mắt người dùng nhận diện ngay "đây là hành động có thể dẫn tới thanh toán". Dùng cho mọi nút Download PDF/.mp3/.mid.
- **Nút PayPal:** render trực tiếp từ PayPal JS SDK bên trong modal, giữ nguyên giao diện gốc của PayPal (xanh dương/vàng) — không can thiệp style. Container quanh nó dùng `{colors.surface-container-lowest}` để nút PayPal nổi rõ, không lẫn vào nền ấm của site.
- **Badge Level:** hình chữ nhật bo `{rounded.sm}`, chữ `label-caps` viết hoa, màu theo `badge-level-{level}` — luôn đặt ở góc trên-trái ảnh thumbnail, không che mặt nhạc.
- **Badge HOT:** cùng hình dạng badge Level nhưng màu `{colors.hot-accent}`, đặt góc trên-phải để không đè lên Badge Level khi cả hai cùng xuất hiện.
- **Thẻ Sheet (`card-sheet`):** nền `{colors.surface-container-low}`, viền mảnh `{colors.outline-variant}`, ảnh thumbnail trên cùng, `headline-sm` cho tên bài, `caption` cho tên Composer + lượt xem, `label-caps` cho nhãn định dạng có sẵn. Hover: nâng nhẹ bằng shadow ấm (xem Elevation), không đổi màu nền.
- **Input (tìm kiếm, form admin, email checkout):** nền `{colors.surface-container-lowest}`, viền `{colors.outline-variant}`, khi focus viền đổi sang `{colors.secondary}` dày 2px — brass "sáng lên" khi người dùng tương tác, nhất quán với vai trò brass = hành động quan trọng.
- **Khối quảng cáo (`ad-slot`):** nền `{colors.surface-container}` trung tính, viền đứt nét (`dashed`) — cố tình *không* dùng bất kỳ màu thương hiệu nào và có viền khác biệt (đứt nét thay vì liền) để người dùng luôn phân biệt được đâu là nội dung Piano Daily, đâu là quảng cáo bên thứ ba.
- **MIDI player / phím đàn ảo:** phím trắng dùng `{colors.surface-bright}`, phím đen dùng `{colors.on-surface}`, nốt đang phát/nốt rơi highlight bằng `{colors.secondary}` (brass) — nhất quán vai trò "brass = điểm nhấn tương tác quan trọng".
- **Thông báo lỗi (`form-error`):** khối nền `{colors.error-container}` nhạt, chữ `{colors.error}` đậm, icon cảnh báo đi kèm (không chỉ dựa vào màu — xem EXPERIENCE.md Accessibility Floor). Dùng cho lỗi form (checkout email, upload file) và lỗi thanh toán trong modal.
- **Tag Genre (`tag-genre`):** dạng chip bo `{rounded.sm}` (không bo tròn — nhất quán với Do's and Don'ts), nền `{colors.surface-container}` khi chưa chọn, chuyển sang nền `{colors.secondary}` (brass) + chữ trắng khi đang được chọn để lọc.
- **Modal thanh toán (`payment-modal`):** nền `{colors.surface-container-lowest}` (trắng, nổi bật hẳn khỏi nền ivory phía sau), bo `{rounded.lg}`, che phủ bằng lớp overlay tối màu ấm (`rgba(36, 27, 20, 0.4)`) phía sau thay vì overlay xám/đen thuần.
- **Admin (bảng dữ liệu, uploader, form):** kế thừa mặc định của UI kit được chọn ở Architecture (shadcn/ui hoặc Ant Design — xem `addendum.md` §2); Piano Daily chỉ override 3 điểm bắt buộc để nhất quán thương hiệu: nút hành động chính dùng `{colors.primary}`, nút liên quan tiền (hoàn tiền, gia hạn token) dùng `{colors.secondary}`, thông báo lỗi dùng `form-error` ở trên thay vì màu đỏ mặc định của kit.

## Do's and Don'ts

- **Làm:** Dùng brass (`{colors.secondary}`) nhất quán cho *mọi* hành động tải/mua/thanh toán trên toàn site — đây là tín hiệu màu duy nhất cho "cái này liên quan tiền".
- **Làm:** Giữ khối quảng cáo luôn trung tính, viền đứt nét, tách biệt hình ảnh khỏi nội dung Sheet.
- **Không:** Không dùng burgundy (`{colors.tertiary}`) hay hot-accent cho nút hành động — hai màu này chỉ dành cho badge/nhãn trạng thái, không phải nút bấm, để tránh người dùng nhầm badge EXPERT/HOT với nút có thể bấm.
- **Không:** Không bo góc `{rounded.full}` cho card, button, hay modal — phá vỡ tinh thần trang trọng. Chỉ dùng cho phần tử tròn thực sự (avatar admin, icon play dạng nút tròn nhỏ).
- **Không:** Không thêm animation nảy/bounce hoặc màu neon vào MIDI player hay badge — mọi chuyển động nên mượt và có chủ đích, không "vui nhộn hoá" trải nghiệm nghe thử nghiêm túc.
