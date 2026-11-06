declare module 'pdfjs-dist/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerPort: Worker | null };
  export const getDocument: unknown;
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline' {
  const W: new () => Worker;
  export default W;
}
declare module 'pdfjs-dist/legacy/build/pdf.mjs';
