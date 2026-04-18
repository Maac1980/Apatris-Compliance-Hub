import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { exportLimiter } from "../lib/rate-limit.js";
import type { Tier } from "../lib/encryption.js";

const router = Router();

// ZUS rates (2026 Poland Umowa Zlecenie) — NEVER change the 160h × 31.40 = 3929.05 formula
const RATES = {
  emerytalne_emp: 0.0976,
  rentowe_emp: 0.015,
  chorobowe_emp: 0,         // voluntary, not included per 2026 standard
  emerytalne_empl: 0.0976,
  rentowe_empl: 0.065,
  wypadkowe_empl: 0.0167,
  fp_empl: 0.0245,          // Fundusz Pracy
  fgsp_empl: 0.001,         // FGŚP
  zdrowotne: 0.09,
};

function calcWorkerZUS(gross: number) {
  const empEmerytalne = gross * RATES.emerytalne_emp;
  const empRentowe = gross * RATES.rentowe_emp;
  const empChorobowe = gross * RATES.chorobowe_emp;
  const empTotal = empEmerytalne + empRentowe + empChorobowe;

  const healthBase = gross - empTotal;
  const zdrowotne = healthBase * RATES.zdrowotne;

  const emplEmerytalne = gross * RATES.emerytalne_empl;
  const emplRentowe = gross * RATES.rentowe_empl;
  const emplWypadkowe = gross * RATES.wypadkowe_empl;
  const emplFP = gross * RATES.fp_empl;
  const emplFGSP = gross * RATES.fgsp_empl;
  const emplTotal = emplEmerytalne + emplRentowe + emplWypadkowe + emplFP + emplFGSP;

  return {
    gross: r2(gross),
    emp_emerytalne: r2(empEmerytalne),
    emp_rentowe: r2(empRentowe),
    emp_chorobowe: r2(empChorobowe),
    emp_total: r2(empTotal),
    zdrowotne: r2(zdrowotne),
    empl_emerytalne: r2(emplEmerytalne),
    empl_rentowe: r2(emplRentowe),
    empl_wypadkowe: r2(emplWypadkowe),
    empl_fp: r2(emplFP),
    empl_fgsp: r2(emplFGSP),
    empl_total: r2(emplTotal),
    total_contributions: r2(empTotal + zdrowotne + emplTotal),
  };
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

function generateDraXml(filing: { month: number; year: number }, workers: Array<{ name: string; pesel: string; zus: ReturnType<typeof calcWorkerZUS> }>): string {
  const totals = workers.reduce((t, w) => ({
    emp_emerytalne: r2(t.emp_emerytalne + w.zus.emp_emerytalne),
    emp_rentowe: r2(t.emp_rentowe + w.zus.emp_rentowe),
    emp_chorobowe: r2(t.emp_chorobowe + w.zus.emp_chorobowe),
    zdrowotne: r2(t.zdrowotne + w.zus.zdrowotne),
    empl_emerytalne: r2(t.empl_emerytalne + w.zus.empl_emerytalne),
    empl_rentowe: r2(t.empl_rentowe + w.zus.empl_rentowe),
    empl_wypadkowe: r2(t.empl_wypadkowe + w.zus.empl_wypadkowe),
    empl_fp: r2(t.empl_fp + w.zus.empl_fp),
    empl_fgsp: r2(t.empl_fgsp + w.zus.empl_fgsp),
    total: r2(t.total + w.zus.total_contributions),
  }), { emp_emerytalne: 0, emp_rentowe: 0, emp_chorobowe: 0, zdrowotne: 0, empl_emerytalne: 0, empl_rentowe: 0, empl_wypadkowe: 0, empl_fp: 0, empl_fgsp: 0, total: 0 });

  const pad2 = (n: number) => String(n).padStart(2, "0");

  const workerBlocks = workers.map(w => `
    <Ubezpieczony>
      <DanePracownika>
        <ImieNazwisko>${escXml(w.name)}</ImieNazwisko>
        <PESEL>${escXml(w.pesel)}</PESEL>
      </DanePracownika>
      <SkladkiPracownika>
        <PodstawaWymiaru>${w.zus.gross.toFixed(2)}</PodstawaWymiaru>
        <Emerytalne>${w.zus.emp_emerytalne.toFixed(2)}</Emerytalne>
        <Rentowe>${w.zus.emp_rentowe.toFixed(2)}</Rentowe>
        <Chorobowe>${w.zus.emp_chorobowe.toFixed(2)}</Chorobowe>
        <Zdrowotne>${w.zus.zdrowotne.toFixed(2)}</Zdrowotne>
      </SkladkiPracownika>
      <SkladkiPracodawcy>
        <Emerytalne>${w.zus.empl_emerytalne.toFixed(2)}</Emerytalne>
        <Rentowe>${w.zus.empl_rentowe.toFixed(2)}</Rentowe>
        <Wypadkowe>${w.zus.empl_wypadkowe.toFixed(2)}</Wypadkowe>
        <FunduszPracy>${w.zus.empl_fp.toFixed(2)}</FunduszPracy>
        <FGSP>${w.zus.empl_fgsp.toFixed(2)}</FGSP>
      </SkladkiPracodawcy>
    </Ubezpieczony>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<DeklaracjaDRA xmlns="http://www.zus.pl/schema/dra/2026">
  <Naglowek>
    <KodFormularza>ZUS DRA</KodFormularza>
    <WariantFormularza>1</WariantFormularza>
    <OkresRozliczeniowy>
      <Miesiac>${pad2(filing.month)}</Miesiac>
      <Rok>${filing.year}</Rok>
    </OkresRozliczeniowy>
    <DataWytworzenia>${new Date().toISOString().slice(0, 10)}</DataWytworzenia>
  </Naglowek>
  <Platnik>
    <NIP>5252828706</NIP>
    <Nazwa>Apatris Sp. z o.o.</Nazwa>
    <Adres>ul. Chłodna 51, 00-867 Warszawa</Adres>
  </Platnik>
  <LiczbaUbezpieczonych>${workers.length}</LiczbaUbezpieczonych>
  <PodsumowanieSkladek>
    <EmerytalnePracownik>${totals.emp_emerytalne.toFixed(2)}</EmerytalnePracownik>
    <RentowePracownik>${totals.emp_rentowe.toFixed(2)}</RentowePracownik>
    <ChorobowePracownik>${totals.emp_chorobowe.toFixed(2)}</ChorobowePracownik>
    <Zdrowotne>${totals.zdrowotne.toFixed(2)}</Zdrowotne>
    <EmerytalnePracodawca>${totals.empl_emerytalne.toFixed(2)}</EmerytalnePracodawca>
    <RentowePracodawca>${totals.empl_rentowe.toFixed(2)}</RentowePracodawca>
    <Wypadkowe>${totals.empl_wypadkowe.toFixed(2)}</Wypadkowe>
    <FunduszPracy>${totals.empl_fp.toFixed(2)}</FunduszPracy>
    <FGSP>${totals.empl_fgsp.toFixed(2)}</FGSP>
    <RazemSkladki>${totals.total.toFixed(2)}</RazemSkladki>
  </PodsumowanieSkladek>
  <ListaUbezpieczonych>${workerBlocks}
  </ListaUbezpieczonych>
</DeklaracjaDRA>`;
}

function escXml(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// GET /api/zus/filings
router.get("/zus/filings", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM zus_filings WHERE tenant_id = $1 ORDER BY year DESC, month DESC",
      [req.tenantId!]
    );
    res.json({ filings: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/zus/filings/generate — generate DRA for a month
router.post("/zus/filings/generate", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { month, year } = req.body as { month?: number; year?: number };
    if (!month || !year) return res.status(400).json({ error: "month and year required" });

    // Check existing
    const existing = await queryOne(
      "SELECT id FROM zus_filings WHERE tenant_id = $1 AND month = $2 AND year = $3",
      [req.tenantId!, month, year]
    );
    if (existing) return res.status(409).json({ error: "Filing already exists for this period" });

    // Get active workers — admin route, role-aware mapping returns plaintext PESEL for ZUS XML
    const dbRows = await fetchAllWorkers(req.tenantId!);
    const allWorkers = dbRows.map((r) => mapRowToWorker(r, (req as any).user?.role as Tier));
    const activeWorkers = allWorkers.filter(w => {
      const rate = w.hourlyRate ?? 0;
      const hours = w.monthlyHours ?? 0;
      return rate > 0 && hours > 0;
    });

    const workerData = activeWorkers.map(w => {
      const gross = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0);
      return {
        name: w.name,
        pesel: w.pesel ?? "",
        zus: calcWorkerZUS(gross),
      };
    });

    const xmlData = generateDraXml({ month, year }, workerData);
    const totalContributions = workerData.reduce((s, w) => s + w.zus.total_contributions, 0);

    const row = await queryOne(
      `INSERT INTO zus_filings (tenant_id, month, year, status, generated_at, worker_count, total_contributions, xml_data)
       VALUES ($1,$2,$3,'generated',NOW(),$4,$5,$6) RETURNING *`,
      [req.tenantId!, month, year, workerData.length, r2(totalContributions), xmlData]
    );

    res.status(201).json({ filing: row, workerCount: workerData.length, totalContributions: r2(totalContributions) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// PATCH /api/zus/filings/:id/submit — mark as submitted
router.patch("/zus/filings/:id/submit", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const row = await queryOne(
      "UPDATE zus_filings SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Filing not found" });
    res.json({ filing: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/zus/filings/:id/download — download XML
router.get("/zus/filings/:id/download", requireAuth, exportLimiter, async (req, res) => {
  try {
    const row = await queryOne<Record<string, any>>(
      "SELECT * FROM zus_filings WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Filing not found" });
    if (!row.xml_data) return res.status(404).json({ error: "No XML data" });

    const filename = `ZUS_DRA_${row.year}_${String(row.month).padStart(2, "0")}.xml`;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: req.user?.name ?? "unknown",
      actorEmail: req.user?.email ?? "",
      action: "DATA_EXPORT",
      workerId: "—",
      workerName: "ALL",
      note: `ZUS DRA XML export: ${filename} — contains PESEL and ZUS contribution data`,
    });

    res.send(row.xml_data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Download failed" });
  }
});

export default router;
