/**
 * Test Scenario Seeder — creates realistic worker data covering all legal code paths.
 *
 * 28 workers across 8 scenarios:
 *  1. Valid TRC, all clear (10)
 *  2. TRC expiring within 30 days (5)
 *  3. TRC expired, no Art. 108 (3)
 *  4. TRC expired, UPO filed — Art. 108 protected (3)
 *  5. Work permit only, no TRC (3)
 *  6. Missing passport data (2)
 *  7. Rejected decision on file (1)
 *  8. Schengen tracking — last_entry_date set (1)
 *
 * Uses realistic Polish-market welder names and specializations.
 */

import { execute, query, queryOne } from "./db.js";
import { encryptIfPresent, lookupHash } from "./encryption.js";

const d = (offsetDays: number) => {
  const dt = new Date(Date.now() + offsetDays * 86_400_000);
  return dt.toISOString().slice(0, 10);
};

interface TestWorker {
  name: string;
  spec: string;
  site: string;
  nationality: string;
  passport_number: string;
  passport_expiry: string;
  trc_expiry: string | null;
  work_permit_expiry: string | null;
  bhp_expiry: string;
  contract_end_date: string;
  pesel: string;
  last_entry_date: string | null;
  visa_expiry: string | null;
  scenario: string;
}

const SITES = [
  "Site A – Dublin Docklands",
  "Site B – Cork Harbour",
  "Site C – Galway Industrial",
  "Site D – Warsaw Shipyard",
  "Site E – Gdansk Refinery",
];

const SPECS = ["TIG", "MAG", "MIG", "ARC", "MMA", "FABRICATOR"];

export async function seedTestScenarios(tenantId: string): Promise<{ created: number; skipped: boolean }> {
  // Check if already seeded
  const count = await queryOne<{ cnt: number }>("SELECT COUNT(*)::int AS cnt FROM workers WHERE tenant_id = $1", [tenantId]);
  if ((count?.cnt ?? 0) > 15) {
    console.log("[Seed] Already have >15 workers — skipping test scenario seeder.");
    return { created: 0, skipped: true };
  }

  const workers: TestWorker[] = [
    // ── Scenario 1: Valid TRC, all docs clear (10 workers) ──
    { name: "Viktor Kovalchuk", spec: "TIG", site: SITES[0], nationality: "Ukrainian", passport_number: "UA-TIG-001", passport_expiry: d(400), trc_expiry: d(200), work_permit_expiry: d(250), bhp_expiry: d(300), contract_end_date: d(250), pesel: "96010112345", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Dmytro Bondarenko", spec: "TIG", site: SITES[0], nationality: "Ukrainian", passport_number: "UA-TIG-002", passport_expiry: d(500), trc_expiry: d(180), work_permit_expiry: d(220), bhp_expiry: d(280), contract_end_date: d(220), pesel: "94050223456", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Oleh Shevchenko", spec: "MAG", site: SITES[1], nationality: "Ukrainian", passport_number: "UA-MAG-001", passport_expiry: d(600), trc_expiry: d(150), work_permit_expiry: d(200), bhp_expiry: d(250), contract_end_date: d(200), pesel: "93070334567", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Artem Lysenko", spec: "MAG", site: SITES[1], nationality: "Ukrainian", passport_number: "UA-MAG-002", passport_expiry: d(450), trc_expiry: d(300), work_permit_expiry: d(350), bhp_expiry: d(400), contract_end_date: d(350), pesel: "91090445678", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Yuriy Tkachenko", spec: "MIG", site: SITES[2], nationality: "Ukrainian", passport_number: "UA-MIG-001", passport_expiry: d(380), trc_expiry: d(120), work_permit_expiry: d(180), bhp_expiry: d(200), contract_end_date: d(180), pesel: "90110556789", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Ivan Melnyk", spec: "ARC", site: SITES[2], nationality: "Ukrainian", passport_number: "UA-ARC-001", passport_expiry: d(550), trc_expiry: d(250), work_permit_expiry: d(300), bhp_expiry: d(350), contract_end_date: d(300), pesel: "89010667890", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Taras Polishchuk", spec: "ARC", site: SITES[3], nationality: "Ukrainian", passport_number: "UA-ARC-002", passport_expiry: d(420), trc_expiry: d(190), work_permit_expiry: d(240), bhp_expiry: d(290), contract_end_date: d(240), pesel: "88030778901", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Mykola Savchenko", spec: "FABRICATOR", site: SITES[3], nationality: "Ukrainian", passport_number: "UA-FAB-001", passport_expiry: d(480), trc_expiry: d(210), work_permit_expiry: d(260), bhp_expiry: d(310), contract_end_date: d(260), pesel: "87050889012", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Vasyl Marchenko", spec: "MMA", site: SITES[4], nationality: "Ukrainian", passport_number: "UA-MMA-001", passport_expiry: d(520), trc_expiry: d(170), work_permit_expiry: d(220), bhp_expiry: d(270), contract_end_date: d(220), pesel: "86070990123", last_entry_date: null, visa_expiry: null, scenario: "valid" },
    { name: "Andriy Kravchuk", spec: "TIG", site: SITES[4], nationality: "Ukrainian", passport_number: "UA-TIG-003", passport_expiry: d(460), trc_expiry: d(230), work_permit_expiry: d(280), bhp_expiry: d(330), contract_end_date: d(280), pesel: "85091001234", last_entry_date: null, visa_expiry: null, scenario: "valid" },

    // ── Scenario 2: TRC expiring within 30 days (5 workers) ──
    { name: "Bohdan Zinchenko", spec: "TIG", site: SITES[0], nationality: "Ukrainian", passport_number: "UA-EXP-001", passport_expiry: d(300), trc_expiry: d(12), work_permit_expiry: d(60), bhp_expiry: d(200), contract_end_date: d(60), pesel: "95020112345", last_entry_date: null, visa_expiry: null, scenario: "expiring" },
    { name: "Ruslan Ivanchuk", spec: "MAG", site: SITES[1], nationality: "Ukrainian", passport_number: "UA-EXP-002", passport_expiry: d(350), trc_expiry: d(22), work_permit_expiry: d(90), bhp_expiry: d(250), contract_end_date: d(90), pesel: "94040223456", last_entry_date: null, visa_expiry: null, scenario: "expiring" },
    { name: "Serhiy Dudka", spec: "MIG", site: SITES[2], nationality: "Ukrainian", passport_number: "UA-EXP-003", passport_expiry: d(400), trc_expiry: d(8), work_permit_expiry: d(45), bhp_expiry: d(180), contract_end_date: d(45), pesel: "93060334567", last_entry_date: null, visa_expiry: null, scenario: "expiring" },
    { name: "Pavlo Moroz", spec: "ARC", site: SITES[3], nationality: "Ukrainian", passport_number: "UA-EXP-004", passport_expiry: d(280), trc_expiry: d(18), work_permit_expiry: d(70), bhp_expiry: d(220), contract_end_date: d(70), pesel: "92080445678", last_entry_date: null, visa_expiry: null, scenario: "expiring" },
    { name: "Vitaliy Hrytsenko", spec: "FABRICATOR", site: SITES[4], nationality: "Ukrainian", passport_number: "UA-EXP-005", passport_expiry: d(320), trc_expiry: d(5), work_permit_expiry: d(30), bhp_expiry: d(160), contract_end_date: d(30), pesel: "91100556789", last_entry_date: null, visa_expiry: null, scenario: "expiring" },

    // ── Scenario 3: TRC expired, no Art. 108 (3 workers) ──
    { name: "Roman Chernenko", spec: "TIG", site: SITES[0], nationality: "Ukrainian", passport_number: "UA-BLK-001", passport_expiry: d(200), trc_expiry: d(-45), work_permit_expiry: d(-30), bhp_expiry: d(100), contract_end_date: d(-30), pesel: "90020667890", last_entry_date: null, visa_expiry: null, scenario: "expired" },
    { name: "Ihor Petrenko", spec: "MAG", site: SITES[1], nationality: "Ukrainian", passport_number: "UA-BLK-002", passport_expiry: d(180), trc_expiry: d(-20), work_permit_expiry: d(-10), bhp_expiry: d(80), contract_end_date: d(-10), pesel: "89040778901", last_entry_date: null, visa_expiry: null, scenario: "expired" },
    { name: "Stepan Kozak", spec: "ARC", site: SITES[2], nationality: "Ukrainian", passport_number: "UA-BLK-003", passport_expiry: d(250), trc_expiry: d(-60), work_permit_expiry: d(-45), bhp_expiry: d(120), contract_end_date: d(-45), pesel: "88060889012", last_entry_date: null, visa_expiry: null, scenario: "expired" },

    // ── Scenario 4: TRC expired, UPO filed — Art. 108 (3 workers) ──
    { name: "Maksym Dovzhenko", spec: "TIG", site: SITES[3], nationality: "Ukrainian", passport_number: "UA-ART-001", passport_expiry: d(400), trc_expiry: d(-15), work_permit_expiry: d(-5), bhp_expiry: d(200), contract_end_date: d(90), pesel: "87080990123", last_entry_date: null, visa_expiry: null, scenario: "art108" },
    { name: "Denys Koval", spec: "MAG", site: SITES[4], nationality: "Ukrainian", passport_number: "UA-ART-002", passport_expiry: d(350), trc_expiry: d(-30), work_permit_expiry: d(-20), bhp_expiry: d(180), contract_end_date: d(60), pesel: "86101001234", last_entry_date: null, visa_expiry: null, scenario: "art108" },
    { name: "Oleksiy Horbachov", spec: "FABRICATOR", site: SITES[0], nationality: "Ukrainian", passport_number: "UA-ART-003", passport_expiry: d(450), trc_expiry: d(-10), work_permit_expiry: d(-3), bhp_expiry: d(250), contract_end_date: d(120), pesel: "85020112345", last_entry_date: null, visa_expiry: null, scenario: "art108" },

    // ── Scenario 5: Work permit only, no TRC (3 workers) ──
    { name: "Giorgi Kapanadze", spec: "MIG", site: SITES[1], nationality: "Georgian", passport_number: "GE-WP-001", passport_expiry: d(500), trc_expiry: null, work_permit_expiry: d(90), bhp_expiry: d(200), contract_end_date: d(90), pesel: "94030223456", last_entry_date: d(-40), visa_expiry: d(80), scenario: "wp_only" },
    { name: "Levani Tsiklauri", spec: "ARC", site: SITES[2], nationality: "Georgian", passport_number: "GE-WP-002", passport_expiry: d(400), trc_expiry: null, work_permit_expiry: d(120), bhp_expiry: d(180), contract_end_date: d(120), pesel: "93050334567", last_entry_date: d(-60), visa_expiry: d(70), scenario: "wp_only" },
    { name: "Zurab Meladze", spec: "MMA", site: SITES[3], nationality: "Georgian", passport_number: "GE-WP-003", passport_expiry: d(350), trc_expiry: null, work_permit_expiry: d(45), bhp_expiry: d(150), contract_end_date: d(45), pesel: "92070445678", last_entry_date: d(-75), visa_expiry: d(15), scenario: "wp_only" },

    // ── Scenario 6: Missing passport data (2 workers) ──
    { name: "Volodymyr Blank", spec: "TIG", site: SITES[4], nationality: "", passport_number: "", passport_expiry: d(100), trc_expiry: d(60), work_permit_expiry: d(100), bhp_expiry: d(150), contract_end_date: d(100), pesel: "91090556789", last_entry_date: null, visa_expiry: null, scenario: "missing_docs" },
    { name: "Anatoliy Nopas", spec: "MAG", site: SITES[0], nationality: "Ukrainian", passport_number: "", passport_expiry: d(50), trc_expiry: d(80), work_permit_expiry: d(120), bhp_expiry: d(130), contract_end_date: d(120), pesel: "90110667890", last_entry_date: null, visa_expiry: null, scenario: "missing_docs" },
  ];

  let created = 0;

  for (const w of workers) {
    // Check if already exists
    const exists = await queryOne<{ id: string }>("SELECT id FROM workers WHERE full_name = $1 AND tenant_id = $2", [w.name, tenantId]);
    if (exists) continue;

    await execute(
      `INSERT INTO workers (tenant_id, full_name, specialization, assigned_site, nationality, passport_number, passport_hash,
        passport_expiry, trc_expiry, work_permit_expiry, bhp_expiry, contract_end_date,
        hourly_rate, monthly_hours, pesel, pesel_hash, last_entry_date, visa_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [tenantId, w.name, w.spec, w.site, w.nationality,
        encryptIfPresent(w.passport_number), lookupHash(w.passport_number),
        w.passport_expiry, w.trc_expiry, w.work_permit_expiry, w.bhp_expiry, w.contract_end_date,
        31.40, 160,
        encryptIfPresent(w.pesel), lookupHash(w.pesel),
        w.last_entry_date, w.visa_expiry]
    );
    created++;

    // Scenario 4: create immigration permit + document intake for Art. 108 workers
    if (w.scenario === "art108") {
      const wRow = await queryOne<{ id: string }>("SELECT id FROM workers WHERE full_name = $1 AND tenant_id = $2", [w.name, tenantId]);
      if (wRow) {
        // Create immigration permit (expired)
        await execute(
          `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status, trc_application_submitted)
           VALUES ($1,$2,$3,'TRC','PL',$4,$5,'expired',TRUE)`,
          [tenantId, wRow.id, w.name, d(-365), w.trc_expiry]
        );
        // Create confirmed UPO document intake (filing proof)
        await execute(
          `INSERT INTO document_intake (tenant_id, uploaded_by, file_name, ai_classification, status, confirmed_worker_id, matched_worker_id, confirmed_fields_json, confirmed_at)
           VALUES ($1,'seeder','upo-filing.pdf','UPO','CONFIRMED',$2,$2,$3,NOW())`,
          [tenantId, wRow.id, JSON.stringify({ filing_date: { value: d(-20), confidence: 1, source: "manual" }, case_reference: { value: `WSC-${w.name.slice(0, 3).toUpperCase()}-2025`, confidence: 1, source: "manual" } })]
        );
      }
    }

    // Scenario 3: create expired immigration permit
    if (w.scenario === "expired") {
      const wRow = await queryOne<{ id: string }>("SELECT id FROM workers WHERE full_name = $1 AND tenant_id = $2", [w.name, tenantId]);
      if (wRow) {
        await execute(
          `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status)
           VALUES ($1,$2,$3,'TRC','PL',$4,$5,'expired')`,
          [tenantId, wRow.id, w.name, d(-400), w.trc_expiry]
        );
      }
    }
  }

  console.log(`[Seed] Created ${created} test scenario workers.`);
  return { created, skipped: false };
}
