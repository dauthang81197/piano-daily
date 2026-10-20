// Minimal declarations for the parts of Verovio and svg-to-pdfkit this project calls.

declare module "verovio/wasm" {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page: number): string;
    getVersion(): string;
  }
}

declare module "svg-to-pdfkit" {
  interface Options {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    fontCallback?: (family: string, bold: boolean, italic: boolean, fontOptions: unknown) => string;
  }
  export default function SVGtoPDF(doc: unknown, svg: string, x: number, y: number, options?: Options): void;
}
