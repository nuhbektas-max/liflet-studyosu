import type { PdfJsLib } from './metinCikar';

let yuklu: Promise<PdfJsLib> | null = null;

/** pdf.js ve çalışanı yalnızca gerektiğinde yüklenir; çalışan paketin içindedir (internetsiz çalışır). */
export function pdfjsYukle(): Promise<PdfJsLib> {
  yuklu ??= (async () => {
    const lib = await import('pdfjs-dist/build/pdf.mjs');
    const Calisan = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline')).default;
    lib.GlobalWorkerOptions.workerPort = new Calisan();
    return lib as unknown as PdfJsLib;
  })();
  return yuklu;
}
