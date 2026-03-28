import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

const CONTRACTS_DIR = path.resolve(process.cwd(), "uploads", "contracts");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface ContractData {
  // Company
  companyName: string;       // "Apatris Sp. z o.o."
  companyAddress: string;    // "ul. Chłodna 51, 00-867 Warszawa"
  companyNip: string;        // "5252828706"
  companyKrs: string;        // "0000849614"
  companyRegon: string;      // can be empty

  // POA / Signatory
  poaName: string;           // Person signing on behalf of the company
  poaPosition: string;       // "Prezes Zarządu" / "Pełnomocnik"

  // Worker
  workerName: string;
  workerPesel: string;
  workerAddress?: string;
  workerNationality?: string;
  workerPassportNumber?: string;

  // Contract
  contractType: "umowa_zlecenie" | "umowa_o_prace";
  startDate: string;         // YYYY-MM-DD
  endDate?: string;          // YYYY-MM-DD or undefined for indefinite
  hourlyRate?: number;       // PLN for zlecenie
  monthlySalary?: number;    // PLN for o_prace
  workLocation: string;
  jobDescription: string;

  // Language
  language: "pl" | "en" | "bilingual";
}

function formatDatePL(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
                   "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} r.`;
}

function formatDateEN(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fmtPLN(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " PLN";
}

// ── Generate Umowa Zlecenie ────────────────────────────────────────────────

function generateUmowaZlecenie(doc: InstanceType<typeof PDFDocument>, data: ContractData): void {
  const isBilingual = data.language === "bilingual";

  // Header
  doc.fontSize(16).fillColor("#C41E18").font("Helvetica-Bold")
    .text("UMOWA ZLECENIE", { align: "center" });
  if (isBilingual) {
    doc.fontSize(10).fillColor("#666666").font("Helvetica-Oblique")
      .text("CONTRACT OF MANDATE (Civil Law Agreement)", { align: "center" });
  }
  doc.moveDown(0.5);

  // Date and number
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`zawarta w dniu ${formatDatePL(data.startDate)} w Warszawie`, { align: "center" });
  if (isBilingual) {
    doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique")
      .text(`concluded on ${formatDateEN(data.startDate)} in Warsaw`, { align: "center" });
  }
  doc.moveDown(1);

  // Parties
  doc.fontSize(9).fillColor("#333333").font("Helvetica-Bold").text("§ 1. STRONY UMOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("PARTIES TO THE AGREEMENT");
  doc.moveDown(0.3);

  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`ZLECENIODAWCA (Ordering Party):`)
    .text(`${data.companyName}, ${data.companyAddress}`)
    .text(`NIP: ${data.companyNip}, KRS: ${data.companyKrs}`)
    .text(`reprezentowana przez: ${data.poaName} — ${data.poaPosition}`);
  doc.moveDown(0.5);

  doc.text(`ZLECENIOBIORCA (Contractor):`)
    .text(`${data.workerName}`)
    .text(`PESEL: ${data.workerPesel || "—"}${data.workerNationality ? `, Obywatelstwo: ${data.workerNationality}` : ""}`)
    .text(`${data.workerAddress || ""}`);
  doc.moveDown(1);

  // Subject
  doc.font("Helvetica-Bold").text("§ 2. PRZEDMIOT UMOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("SUBJECT OF THE AGREEMENT");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Zleceniodawca zleca, a Zleceniobiorca zobowiązuje się do wykonywania następujących czynności:`)
    .text(`${data.jobDescription}`, { indent: 20 })
    .text(`Miejsce wykonywania zlecenia: ${data.workLocation}`);
  doc.moveDown(1);

  // Duration
  doc.font("Helvetica-Bold").text("§ 3. CZAS TRWANIA");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("DURATION");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Umowa zostaje zawarta na czas ${data.endDate ? `określony od ${formatDatePL(data.startDate)} do ${formatDatePL(data.endDate)}` : "nieokreślony"}.`);
  doc.moveDown(1);

  // Remuneration
  doc.font("Helvetica-Bold").text("§ 4. WYNAGRODZENIE");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("REMUNERATION");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Za wykonanie zlecenia Zleceniobiorca otrzyma wynagrodzenie w wysokości:`)
    .text(`${fmtPLN(data.hourlyRate ?? 0)} brutto za godzinę pracy.`, { indent: 20 })
    .text(`Wynagrodzenie płatne do 10-go dnia następnego miesiąca na rachunek bankowy Zleceniobiorcy.`);
  doc.moveDown(1);

  // ZUS
  doc.font("Helvetica-Bold").text("§ 5. SKŁADKI ZUS");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("SOCIAL SECURITY CONTRIBUTIONS");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Zleceniodawca zobowiązuje się do odprowadzania składek na ubezpieczenia społeczne i zdrowotne zgodnie z obowiązującymi przepisami prawa.`)
    .text(`Zleceniobiorca podlega obowiązkowemu ubezpieczeniu emerytalnemu, rentowemu i zdrowotnemu.`);
  doc.moveDown(1);

  // Termination
  doc.font("Helvetica-Bold").text("§ 6. ROZWIĄZANIE UMOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("TERMINATION");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Każda ze stron może wypowiedzieć umowę z zachowaniem 14-dniowego okresu wypowiedzenia.`);
  doc.moveDown(1);

  // Final provisions
  doc.font("Helvetica-Bold").text("§ 7. POSTANOWIENIA KOŃCOWE");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("FINAL PROVISIONS");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`W sprawach nieuregulowanych niniejszą umową zastosowanie mają przepisy Kodeksu Cywilnego.`)
    .text(`Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.`);
  doc.moveDown(2);

  // Signature blocks
  const y = doc.y;
  doc.fontSize(9).fillColor("#333333");
  doc.text("_________________________", 60, y, { width: 200, align: "center" });
  doc.text("ZLECENIODAWCA", 60, y + 15, { width: 200, align: "center" });
  doc.text(`(${data.poaName})`, 60, y + 27, { width: 200, align: "center" });

  doc.text("_________________________", 340, y, { width: 200, align: "center" });
  doc.text("ZLECENIOBIORCA", 340, y + 15, { width: 200, align: "center" });
  doc.text(`(${data.workerName})`, 340, y + 27, { width: 200, align: "center" });
}

// ── Generate Umowa o Pracę ─────────────────────────────────────────────────

function generateUmowaOPrace(doc: InstanceType<typeof PDFDocument>, data: ContractData): void {
  const isBilingual = data.language === "bilingual";

  // Header
  doc.fontSize(16).fillColor("#C41E18").font("Helvetica-Bold")
    .text("UMOWA O PRACĘ", { align: "center" });
  if (isBilingual) {
    doc.fontSize(10).fillColor("#666666").font("Helvetica-Oblique")
      .text("EMPLOYMENT CONTRACT", { align: "center" });
  }
  doc.moveDown(0.5);

  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`zawarta w dniu ${formatDatePL(data.startDate)} w Warszawie`, { align: "center" });
  if (isBilingual) {
    doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique")
      .text(`concluded on ${formatDateEN(data.startDate)} in Warsaw`, { align: "center" });
  }
  doc.moveDown(1);

  // Parties
  doc.fontSize(9).fillColor("#333333").font("Helvetica-Bold").text("§ 1. STRONY UMOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("PARTIES");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`PRACODAWCA (Employer):`)
    .text(`${data.companyName}, ${data.companyAddress}`)
    .text(`NIP: ${data.companyNip}, KRS: ${data.companyKrs}`)
    .text(`reprezentowany przez: ${data.poaName} — ${data.poaPosition}`);
  doc.moveDown(0.5);
  doc.text(`PRACOWNIK (Employee):`)
    .text(`${data.workerName}`)
    .text(`PESEL: ${data.workerPesel || "—"}${data.workerNationality ? `, Obywatelstwo: ${data.workerNationality}` : ""}`)
    .text(`${data.workerAddress || ""}`);
  doc.moveDown(1);

  // Type and Duration
  doc.font("Helvetica-Bold").text("§ 2. RODZAJ I CZAS TRWANIA");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("TYPE AND DURATION");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Strony zawierają umowę o pracę na czas ${data.endDate ? `określony od ${formatDatePL(data.startDate)} do ${formatDatePL(data.endDate)}` : "nieokreślony"}.`)
    .text(`Dzień rozpoczęcia pracy: ${formatDatePL(data.startDate)}.`);
  doc.moveDown(1);

  // Work conditions
  doc.font("Helvetica-Bold").text("§ 3. WARUNKI PRACY I PŁACY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("WORKING CONDITIONS AND SALARY");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Rodzaj pracy: ${data.jobDescription}`)
    .text(`Miejsce pracy: ${data.workLocation}`)
    .text(`Wymiar czasu pracy: pełny etat (40 godzin tygodniowo)`)
    .text(`Wynagrodzenie zasadnicze: ${fmtPLN(data.monthlySalary ?? 0)} brutto miesięcznie`);
  doc.moveDown(1);

  // Payment
  doc.font("Helvetica-Bold").text("§ 4. WYPŁATA WYNAGRODZENIA");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("SALARY PAYMENT");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Wynagrodzenie płatne z dołu, do 10-go dnia następnego miesiąca, przelewem na rachunek bankowy Pracownika.`);
  doc.moveDown(1);

  // Leave
  doc.font("Helvetica-Bold").text("§ 5. URLOP WYPOCZYNKOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("ANNUAL LEAVE");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Pracownikowi przysługuje urlop wypoczynkowy w wymiarze zgodnym z Kodeksem Pracy (20 lub 26 dni roboczych w zależności od stażu pracy).`);
  doc.moveDown(1);

  // Termination
  doc.font("Helvetica-Bold").text("§ 6. ROZWIĄZANIE UMOWY");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("TERMINATION");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`Umowa może być rozwiązana za porozumieniem stron, z zachowaniem okresu wypowiedzenia zgodnie z art. 36 Kodeksu Pracy, lub bez wypowiedzenia w przypadkach przewidzianych prawem.`);
  doc.moveDown(1);

  // Final
  doc.font("Helvetica-Bold").text("§ 7. POSTANOWIENIA KOŃCOWE");
  if (isBilingual) doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text("FINAL PROVISIONS");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#333333").font("Helvetica")
    .text(`W sprawach nieuregulowanych niniejszą umową mają zastosowanie przepisy Kodeksu Pracy.`)
    .text(`Umowę sporządzono w dwóch jednobrzmiących egzemplarzach.`);
  doc.moveDown(2);

  // Signatures
  const y = doc.y;
  doc.fontSize(9).fillColor("#333333");
  doc.text("_________________________", 60, y, { width: 200, align: "center" });
  doc.text("PRACODAWCA", 60, y + 15, { width: 200, align: "center" });
  doc.text(`(${data.poaName})`, 60, y + 27, { width: 200, align: "center" });

  doc.text("_________________________", 340, y, { width: 200, align: "center" });
  doc.text("PRACOWNIK", 340, y + 15, { width: 200, align: "center" });
  doc.text(`(${data.workerName})`, 340, y + 27, { width: 200, align: "center" });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a contract PDF and save to disk. Returns the file path.
 */
export function generateContractPDF(data: ContractData, tenantId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tenantDir = path.join(CONTRACTS_DIR, tenantId);
    ensureDir(tenantDir);

    const safeWorker = data.workerName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const typeLabel = data.contractType === "umowa_zlecenie" ? "zlecenie" : "o_prace";
    const timestamp = Date.now();
    const fileName = `${typeLabel}_${safeWorker}_${timestamp}.pdf`;
    const filePath = path.join(tenantDir, fileName);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Company header bar
    doc.rect(0, 0, 595, 45).fill("#1e293b");
    doc.fontSize(11).fillColor("#ffffff").font("Helvetica-Bold")
      .text(data.companyName.toUpperCase(), 50, 14, { continued: true })
      .fontSize(8).fillColor("#94a3b8").font("Helvetica")
      .text(`   •   NIP: ${data.companyNip}   •   KRS: ${data.companyKrs}`, { continued: false });
    doc.moveDown(1.5);

    if (data.contractType === "umowa_zlecenie") {
      generateUmowaZlecenie(doc, data);
    } else {
      generateUmowaOPrace(doc, data);
    }

    // Footer
    const pageHeight = 842; // A4
    doc.fontSize(7).fillColor("#aaaaaa").font("Helvetica")
      .text(
        `${data.companyName} • ${data.companyAddress} • NIP: ${data.companyNip}`,
        50, pageHeight - 40, { width: 495, align: "center" }
      );

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

/**
 * Generate a contract PDF and stream directly to an Express response.
 */
export function streamContractPDF(data: ContractData, res: import("express").Response): void {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  const typeLabel = data.contractType === "umowa_zlecenie" ? "Umowa_Zlecenie" : "Umowa_o_Prace";
  const safeWorker = data.workerName.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `${typeLabel}_${safeWorker}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  doc.pipe(res);

  // Company header bar
  doc.rect(0, 0, 595, 45).fill("#1e293b");
  doc.fontSize(11).fillColor("#ffffff").font("Helvetica-Bold")
    .text(data.companyName.toUpperCase(), 50, 14, { continued: true })
    .fontSize(8).fillColor("#94a3b8").font("Helvetica")
    .text(`   •   NIP: ${data.companyNip}   •   KRS: ${data.companyKrs}`, { continued: false });
  doc.moveDown(1.5);

  if (data.contractType === "umowa_zlecenie") {
    generateUmowaZlecenie(doc, data);
  } else {
    generateUmowaOPrace(doc, data);
  }

  // Footer
  doc.fontSize(7).fillColor("#aaaaaa").font("Helvetica")
    .text(
      `${data.companyName} • ${data.companyAddress} • NIP: ${data.companyNip}`,
      50, 802, { width: 495, align: "center" }
    );

  doc.end();
}
