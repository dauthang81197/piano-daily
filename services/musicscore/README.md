# music-core

Lõi (không có giao diện) để: **nhập PDF bản nhạc → ra khuông nhạc → chỉnh sửa → xuất MIDI / PDF**.

```
PDF ──Audiveris──▶ MusicXML ──▶ Score ──Editor──▶ Score ──▶ MIDI
                                  │                  └────▶ PDF (Verovio)
                                  └── tìm kiếm ("12", "5-9", "p3", "rA")
```

## Hệ điều hành hỗ trợ

| | Chạy app | Nhận dạng PDF (Audiveris) | Kiểm thử |
|---|---|---|---|
| Windows 10/11 | ✅ đã chạy thử | ✅ đã chạy thử với Audiveris 5.11 | ✅ |
| macOS (Intel và Apple Silicon) | viết sẵn, **chưa chạy trên máy Mac thật** | cần cài Audiveris cho Mac, **chưa thử** | CI chạy trên `macos-latest` |
| Linux | viết sẵn | cần cài Audiveris, **chưa thử** | CI chạy trên `ubuntu-latest` |

Những gì đã làm riêng cho macOS: phím **⌘** thay cho Ctrl (gợi ý trong app tự đổi), **thanh menu** (cần có để ⌘C/⌘V hoạt động trong ô nhập chữ),
ứng dụng ở lại trong Dock khi đóng cửa sổ, và tự tìm Audiveris ở `/Applications/Audiveris.app` (hộp thoại chọn cho phép chọn thẳng file `.app`).
Trên Mac, **⌘+bấm** là thêm/bớt nốt vào vùng chọn (Ctrl+bấm trên Mac là bấm chuột phải).

Trên máy Mac:

```
brew install node        # cần Node 22.18 trở lên
npm install
npm start                # hoặc: npm start -- bai-hat.pdf
```

Thư mục `.github/workflows/ci.yml` chạy kiểm tra kiểu, test lõi và test giao diện (mở app thật, bấm chuột, gõ phím, dùng menu kiểu Mac)
trên Windows, macOS và Linux mỗi khi đẩy code lên GitHub. Đó là cách kiểm chứng phần macOS khi không có máy Mac.

## Cài đặt

Cần Node ≥ 22.18. Nhận dạng PDF cần thêm [Audiveris](https://github.com/Audiveris/audiveris/releases) (bản cài đã kèm Java: Windows `.msi`, macOS `.dmg`, Linux `.deb`).

```
npm install
npm test            # test lõi; thêm một bài chạy Audiveris thật nếu đặt biến AUDIVERIS
npm run typecheck
```

Trỏ tới Audiveris bằng biến môi trường `AUDIVERIS` (đường dẫn `Audiveris.exe`) hoặc tuỳ chọn `executable`.

## Chạy ứng dụng (Electron)

```
npm install
npm start                      # build rồi mở app
npm start -- bai-hat.pdf       # mở thẳng một file (PDF, ảnh, MusicXML)
```

Trong app: **Ví dụ** mở sẵn một bài để thử; **Mở…** (hoặc kéo-thả file vào cửa sổ) nhập PDF/ảnh/MusicXML.
Nhập PDF cần Audiveris: app tự tìm ở `C:\Program Files\Audiveris\Audiveris.exe`, biến môi trường `AUDIVERIS`,
hoặc sẽ hỏi bạn chọn `Audiveris.exe` (và nhớ lại cho lần sau).

Bố cục giống MuseScore: thanh nhập nốt (trường độ, dấu hoá, luyến, tam liên, chép/dán), **bảng ký hiệu** bên trái
(sắc thái, dấu nhấn, luyến, nhắc lại và ô 1./2., tam liên, lời hát), bản nhạc ở giữa, **thuộc tính** bên phải
(điệu, nhịp, tempo, khoá, dấu tập, ô nhịp, dịch giọng, bè/nhạc cụ). Phím F1 trong app liệt kê đầy đủ phím tắt.

| Thao tác | Việc |
|---|---|
| Bấm nốt / `Shift`+bấm / `Ctrl`+bấm | chọn một / chọn dải / thêm bớt |
| Kéo khung trên vùng trống, `Ctrl+A` | chọn nhiều nốt; chọn tất cả |
| Bấm vùng trống của ô nhịp (`Shift` để chọn nhiều ô) | chọn ô nhịp |
| Kéo nốt lên/xuống | đổi cao độ (cả vùng chọn nếu nốt đó đang được chọn) |
| `N`, rồi bấm lên khuông | nhập nốt bằng chuột (cao độ theo vị trí chuột và khoá nhạc) |
| `A`–`G`, `Shift`+`A`–`G` | đặt nốt trên dấu lặng / đổi nốt; thêm vào hợp âm |
| `↑ ↓`, `Ctrl+↑ ↓`, `1`–`7`, `.`, `0`, `Delete` | cao độ, quãng tám, trường độ, chấm dôi, dấu lặng, xoá — áp dụng cho cả vùng chọn |
| `T`, `S`, `Ctrl+3` | nối luyến, luyến phrase, tam liên |
| `Ctrl+C / X / V`, `Ctrl+Z / Y` | chép, cắt, dán; hoàn tác (cả loạt thao tác chỉ một lần) |
| `Ctrl+L` | gõ lời hát (`Space` sang nốt kế, `-` nối chữ) |
| `Space` | phát thử, theo dấu nhắc lại; ô nhịp đang phát được tô sáng |
| `Ctrl+F` | tìm: `12`, `5-9`, `p2`, `rA` |

Thanh trên: Lưu (MusicXML), Xuất MIDI, Xuất PDF.

Kiểm thử tự động giao diện (mở app thật, bấm và gõ phím, chụp ảnh):

```
npm run test:ui                                 # sửa bằng chuột/phím, nhập nốt, chép dán, ký hiệu, menu kiểu Mac…; kết quả kiểm tra trong file MusicXML đã lưu
npm run smoke                                   # luồng mở → sửa → lưu/xuất, dùng bài ví dụ
AUDIVERIS="…\Audiveris.exe" node scripts/ui-smoke.mjs out bai-hat.pdf   # đi qua nhận dạng PDF
```

## Dùng thử bằng CLI

```
npm run cli -- bai-hat.pdf --transpose 2 --midi out.mid --pdf out.pdf --musicxml out.musicxml
npm run cli -- bai-hat.musicxml --pdf out.pdf        # không cần Audiveris
```

## Dùng như thư viện

```ts
import { recognizeScore, Editor, writeMidi, renderPdf } from "./src/index.ts";

const { score } = await recognizeScore("bai-hat.pdf");
const ed = new Editor(score);

ed.setPitch({ part: 0, measure: 0, voice: 0, index: 2 }, 0, { step: "G", alter: 0, octave: 4 });
ed.setTimeSignature(0, { beats: 3, beatType: 4 }, { force: true });
ed.transposeScore(-2);
ed.undo();

await writeFile("out.mid", writeMidi(ed.score));
await writeFile("out.pdf", await renderPdf(ed.score));
```

## Cấu trúc

| Thư mục | Việc |
|---|---|
| `src/model` | Mô hình bản nhạc (thời gian tính bằng tick, 480/nốt đen), cao độ, kiểm tra cấu trúc |
| `src/musicxml` | Đọc/ghi MusicXML, kể cả `.mxl` |
| `src/edit` | `Editor`: sửa nốt, trường độ, ô nhịp, nhịp, điệu, khoá, tempo, khuông, part; có undo/redo; mỗi thao tác là nguyên tử (lỗi thì không đổi gì) |
| `src/midi` | Ghi MIDI chuẩn (format 1) |
| `src/render` | Verovio dàn trang → SVG → PDF (nhúng font Unicode + Bravura) |
| `src/omr` | Gọi Audiveris |
| `src/search` | Ô "Find / Go to" theo kiểu MuseScore |
| `app/` | Ứng dụng Electron: `main.ts` (giữ `Editor`, gọi core), `preload.ts` (cầu nối an toàn), `renderer/` (giao diện) |

## Giới hạn đã biết

- **Nhận dạng không hoàn hảo.** Chỉ đã kiểm chứng trên PDF sạch do chính core tạo ra. Bản scan/ảnh chụp thật cần được kiểm tra và sửa tay.
- **Audiveris bỏ qua dòng khuông cuối nếu quá ngắn** (chỉ một ô nhịp): core đã căng đều dòng cuối khi xuất PDF để tránh việc này (tắt bằng `justifyLastSystem: false`), nhưng PDF từ nơi khác có thể gặp.
- **Chữ in trên bản nhạc** (tên bài, `♩ = 100`, tên bè) chỉ có khi Audiveris có dữ liệu OCR (Tesseract); khi có, core lấy chữ lớn ở ô nhịp đầu làm tên bài và `♩ = n` làm tempo. OCR cũng có thể đọc nhầm (ví dụ nhận chữ thành lời hát hoặc sắc thái), nên hãy đối chiếu với bản gốc.
- **Chưa có trong mô hình** (sẽ mất khi nhập, có cảnh báo): crescendo/diminuendo, chữ chỉ dẫn (rit., dolce), nốt hoa mỹ, 8va, đổi nhịp/tempo giữa ô nhịp, luyến lồng nhau.
- **Fermata** hiển thị và xuất PDF nhưng không kéo dài âm khi phát/MIDI.
- **Chưa sửa được:** tạo thêm voice, kéo-thả nốt sang khuông khác.
- **Phát thử** chỉ là bộ tổng hợp sóng đơn giản để nghe kiểm tra, không phải âm thanh nhạc cụ thật (xuất MIDI để nghe bằng phần mềm khác).
- **Chưa đóng gói** thành file cài đặt (`.exe`); hiện chạy bằng `npm start`.

## API (PDF → MIDI) trên server

`src/server.ts` là một HTTP server nhỏ, không cần Electron. Chạy trong Docker, xem `Dockerfile` và `docker-compose.prod.yml`;
CI/CD ở `.github/workflows/musicscore.yml` (gốc monorepo).

```
curl -X POST "http://piano-musicscore:3000/midi?transpose=0" \
  -H "Content-Type: application/pdf" \
  --data-binary @bai-hat.pdf -o bai-hat.mid
```

- Body thô: `application/pdf`, `image/png`, `image/jpeg`, `image/tiff` hoặc MusicXML (`application/xml`, `application/vnd.recordare.musicxml+xml`).
- Mã trả về: `200` MIDI; `401` sai khoá (chỉ khi đặt `API_KEY`); `413` file quá lớn (`MAX_UPLOAD_MB`, mặc định 25); `415` sai loại file; `422` Audiveris không đọc được; `503` đang bận (`MAX_JOBS`, mặc định 2), thử lại sau.
- `GET /health` không cần khoá. Mặc định API không đòi khoá vì chỉ chạy trong mạng nội bộ; đặt `API_KEY` nếu muốn bật header `X-API-Key`. Nhận dạng một bản nhạc mất từ vài chục giây đến vài phút, nên đặt timeout phía gọi đủ dài (≥ 10 phút).
- Biến môi trường: `API_KEY` (tuỳ chọn), `PORT`, `MAX_UPLOAD_MB`, `MAX_JOBS`, `JOB_TIMEOUT_MS`, `AUDIVERIS`.
