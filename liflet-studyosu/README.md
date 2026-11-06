# Liflet Tasarım Stüdyosu

Tarım ve Orman Bakanlığı lifletleri için web tabanlı tasarım programı (internetsiz çalışır, veriler tarayıcıda saklanır).

- `npm run dev` geliştirme, `npm test` testler, `npm run build` web sürümü (`dist/`), `npm run build:tek` tek dosyalık sürüm (`dist-tek/index.html`).
- Şablon kilidi: `src/model/lock.ts`. Editör: `src/editor/`. PDF: `src/editor/pdfDisa.ts` (pdf-lib, gömülü Liberation fontları, TrimBox/BleedBox).
- Kurumsal kimlik: il bazlı profiller (`src/model/kimlik.ts`, `src/ui/KimlikEkrani.tsx`); logolar, müdürlük adı ve iletişim yeni lifletlere aktarılır.
- Liflet Deposu: hazır PDF'ler adıyla yüklenir (orijinal bayt bayt saklanır), pdf.js ile sütun sırasına göre metni çıkarılır, aranır, editörde "Depodan metin al" ile alanlara aktarılır (`src/depo/`).
- **Bodur Elma şablonu henüz yok**: kaynak PDF bekleniyor (`kaynak/OKU.md`). Şimdilik "DENEME şablonu" ile editör ve PDF sınanır; bu şablon Bakanlık tasarımı DEĞİLDİR.
