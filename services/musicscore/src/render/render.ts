import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

import type { Score } from "../model/score.ts";
import { writeMusicXml } from "../musicxml/write.ts";

export interface RenderOptions {
  pageSize?: "A4" | "Letter";
  /** Height of one five-line staff on paper, in millimetres. Default 7.2, Verovio's natural size. */
  staffHeightMm?: number;
  /** Page margin in millimetres. Default 12. */
  marginMm?: number;
  /**
   * Stretch a short final line to the full page width. Default true. Otherwise its staff lines stop
   * after the last measure, and OMR tools such as Audiveris may drop a staff that short when the PDF is re-imported.
   */
  justifyLastSystem?: boolean;
  /** Tag notes with ids that `parseNoteId` can decode (for interactive editing). */
  noteIds?: boolean;
}

/** Verovio engraves a staff 7.2 mm tall when one page unit is a tenth of a millimetre. */
const NATURAL_STAFF_MM = 7.2;

/** Page sizes in Verovio units (tenths of a millimetre) and in PDF points. */
const PAGES = {
  A4: { units: [2100, 2970], points: [595.28, 841.89] },
  Letter: { units: [2159, 2794], points: [612, 792] },
} as const;

/** Verovio's bundled notation fonts; text set in any of them is a SMuFL glyph. */
const MUSIC_FONTS = /leipzig|bravura|gootville|petaluma|leland/i;

/** Verovio's engine is a WASM module; start it once and share it. */
let verovio: Promise<InstanceType<typeof VerovioToolkit>> | undefined;
async function toolkit(): Promise<InstanceType<typeof VerovioToolkit>> {
  verovio ??= createVerovioModule().then((m) => new VerovioToolkit(m));
  return verovio;
}

/** Engrave a score to one SVG string per page. */
export async function renderSvg(score: Score, options: RenderOptions = {}): Promise<string[]> {
  const page = PAGES[options.pageSize ?? "A4"];
  const staffMm = options.staffHeightMm ?? NATURAL_STAFF_MM;
  if (!(staffMm >= 3 && staffMm <= 20)) throw new RangeError("staffHeightMm must be between 3 and 20");
  // Verovio's `scale` option only resizes the SVG and leaves the layout alone. To change the staff size
  // relative to the paper, lay the music out on a proportionally smaller page; the PDF then enlarges it to fit.
  const k = staffMm / NATURAL_STAFF_MM;
  const margin = Math.round(((options.marginMm ?? 12) * 10) / k);
  const tk = await toolkit();
  tk.setOptions({
    pageWidth: Math.round(page.units[0] / k),
    pageHeight: Math.round(page.units[1] / k),
    pageMarginLeft: margin,
    pageMarginRight: margin,
    pageMarginTop: margin,
    pageMarginBottom: margin,
    scale: 100,
    minLastJustification: options.justifyLastSystem === false ? 0.8 : 0,
    adjustPageHeight: false,
    footer: "none",
    svgViewBox: true,
  });
  if (!tk.loadData(writeMusicXml(score, { ids: options.noteIds }))) throw new Error("Verovio could not engrave this score");

  const pages: string[] = [];
  for (let i = 1; i <= tk.getPageCount(); i++) pages.push(tk.renderToSVG(i));
  return pages;
}

/**
 * Index of the first measure on each page, from the engraved layout. Page `i` (0-based)
 * holds measures `starts[i]` up to `starts[i + 1] - 1`. Feeds page search ("p3").
 */
export async function pageStarts(score: Score, options: RenderOptions = {}): Promise<number[]> {
  const starts: number[] = [];
  let seen = 0;
  for (const svg of await renderSvg(score, options)) {
    starts.push(seen);
    seen += svg.match(/class="measure"/g)?.length ?? 0;
  }
  return starts;
}

/** Engrave a score and lay each page out as a page of a PDF. */
export async function renderPdf(score: Score, options: RenderOptions = {}): Promise<Uint8Array> {
  const size = options.pageSize ?? "A4";
  const [w, h] = PAGES[size].points;
  const svgs = await renderSvg(score, options);

  const doc = new PDFDocument({ size: [w, h], margin: 0, autoFirstPage: false, info: { Title: score.title || "Score" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  // The built-in PDF fonts cannot show Vietnamese or most non-Latin titles, so embed a Unicode serif.
  const dir = join(dirname(createRequire(import.meta.url).resolve("dejavu-fonts-ttf/package.json")), "ttf");
  doc.registerFont("Body", join(dir, "DejaVuSerif.ttf"));
  doc.registerFont("Body-Bold", join(dir, "DejaVuSerif-Bold.ttf"));
  doc.registerFont("Body-Italic", join(dir, "DejaVuSerif-Italic.ttf"));
  doc.registerFont("Body-BoldItalic", join(dir, "DejaVuSerif-BoldItalic.ttf"));
  // Tempo marks and similar text use SMuFL music glyphs (private-use code points); Bravura supplies them.
  doc.registerFont("Music", join(dirname(createRequire(import.meta.url).resolve("@vexflow-fonts/bravura/package.json")), "bravura.otf"));

  for (const svg of svgs) {
    doc.addPage();
    SVGtoPDF(doc, inlineStrokes(svg), 0, 0, {
      width: w,
      height: h,
      preserveAspectRatio: "xMinYMin meet",
      fontCallback: (family: string, bold: boolean, italic: boolean) => {
        if (MUSIC_FONTS.test(family)) return "Music";
        return bold && italic ? "Body-BoldItalic" : bold ? "Body-Bold" : italic ? "Body-Italic" : "Body";
      },
    });
  }
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Verovio sets line colour with a CSS rule (`path, rect... { stroke: currentColor }`),
 * which svg-to-pdfkit ignores, leaving staff lines, stems and barlines invisible.
 * Put the stroke on each drawing element instead. Glyph definitions in <defs>
 * are filled shapes and are left alone.
 */
export function inlineStrokes(svg: string): string {
  const defsEnd = svg.lastIndexOf("</defs>");
  const split = defsEnd === -1 ? 0 : defsEnd + "</defs>".length;
  const head = svg.slice(0, split);
  const body = svg.slice(split).replace(/<(path|polyline|polygon|rect|line)\b([^>]*?)(\/?)>/g, (m, tag: string, attrs: string, close: string) =>
    /\sstroke\s*=/.test(attrs) ? m : `<${tag} stroke="#000000"${attrs}${close}>`,
  );
  return head + body;
}
