import { query, queryOne, execute } from "./db.js";
import { getDefaultTenantId } from "./tenant.js";

/**
 * Seeds realistic demo data for dashboard modules that are currently empty.
 * Only runs in non-production. All demo records use "[DEMO]" prefix or tag
 * so they can be identified and removed later.
 *
 * DELETE FROM clients WHERE name LIKE '[DEMO]%';
 * DELETE FROM job_postings WHERE title LIKE '[DEMO]%';
 * DELETE FROM job_applications WHERE notes LIKE '[DEMO]%';
 * DELETE FROM hours_log WHERE note LIKE '[DEMO]%';
 * DELETE FROM posting_assignments WHERE notes LIKE '[DEMO]%';
 * DELETE FROM consent_records WHERE ip_address = 'demo-seed';
 */
export async function seedModuleDemoData(force = false): Promise<void> {
  if (!force && process.env.NODE_ENV === "production") return;

  const tenantId = getDefaultTenantId();
  if (!tenantId) { console.log("[seed-modules] No tenant — skipping."); return; }

  // Guard: skip if already seeded (check clients + trc_cases)
  const clientCount = parseInt((await query<{ count: string }>("SELECT COUNT(*) AS count FROM clients"))[0]?.count ?? "0");
  const trcCount = parseInt((await query<{ count: string }>("SELECT COUNT(*) AS count FROM trc_cases WHERE tenant_id = $1", [tenantId]))[0]?.count ?? "0");
  if (clientCount > 3 && trcCount > 3) {
    console.log("[seed-modules] Modules + TRC already have data — skipping.");
    return;
  }
  // If clients exist but TRC doesn't, skip to TRC section
  const skipModules = clientCount > 3;

  console.log("[seed-modules] Seeding demo data for dashboard modules…");

  if (!skipModules) {
  // ═══ 1. CLIENTS (20 records) ═══════════════════════════════════════════
  const clients = [
    { name: "[DEMO] Heerema Marine Contractors", contact: "Jan van der Berg", email: "j.vanderberg@heerema.com", phone: "+31 70 123 4567", nip: "NL123456789B01", rate: 45.00 },
    { name: "[DEMO] Damen Shipyards Group", contact: "Pieter de Vries", email: "p.devries@damen.com", phone: "+31 78 234 5678", nip: "NL234567890B01", rate: 42.00 },
    { name: "[DEMO] BESIX Group", contact: "Marc Dubois", email: "m.dubois@besix.com", phone: "+32 2 345 6789", nip: "BE0456789012", rate: 48.00 },
    { name: "[DEMO] Jan De Nul Group", contact: "Sophie Claes", email: "s.claes@jandenul.com", phone: "+32 3 456 7890", nip: "BE0567890123", rate: 50.00 },
    { name: "[DEMO] Remontowa Shiprepair Yard", contact: "Tomasz Mazur", email: "t.mazur@remontowa.pl", phone: "+48 58 567 8901", nip: "5830003108", rate: 35.00 },
    { name: "[DEMO] Energomontaż Północ", contact: "Krzysztof Nowak", email: "k.nowak@energomontaz.pl", phone: "+48 58 678 9012", nip: "5830004219", rate: 33.00 },
    { name: "[DEMO] PGNiG Termika", contact: "Anna Wiśniewska", email: "a.wisniewska@pgnig.pl", phone: "+48 22 789 0123", nip: "5260300854", rate: 38.00 },
    { name: "[DEMO] Allseas Engineering", contact: "Erik Jansen", email: "e.jansen@allseas.com", phone: "+31 15 890 1234", nip: "NL345678901B01", rate: 52.00 },
    { name: "[DEMO] Saipem SpA", contact: "Marco Rossi", email: "m.rossi@saipem.com", phone: "+39 02 901 2345", nip: "IT12345678901", rate: 55.00 },
    { name: "[DEMO] Keppel FELS", contact: "Wei Lin Tan", email: "w.tan@keppelfels.com", phone: "+65 6890 2345", nip: "SG200012345K", rate: 60.00 },
    { name: "[DEMO] Gdańsk Shipyard", contact: "Piotr Kowalski", email: "p.kowalski@gdanskshipyard.pl", phone: "+48 58 345 1234", nip: "5840001234", rate: 32.00 },
    { name: "[DEMO] Crist SA", contact: "Marek Lewandowski", email: "m.lewandowski@crist.com.pl", phone: "+48 58 456 2345", nip: "5840002345", rate: 34.00 },
    { name: "[DEMO] Nauta Shiprepair Yard", contact: "Andrzej Zieliński", email: "a.zielinski@nauta.pl", phone: "+48 58 567 3456", nip: "5840003456", rate: 31.00 },
    { name: "[DEMO] Baltic Operator", contact: "Jakub Wójcik", email: "j.wojcik@balticop.pl", phone: "+48 58 678 4567", nip: "5840004567", rate: 30.00 },
    { name: "[DEMO] Mostostal Zabrze", contact: "Grzegorz Kamiński", email: "g.kaminski@mostostal.pl", phone: "+48 32 789 5678", nip: "6480001234", rate: 36.00 },
    { name: "[DEMO] Polimex Mostostal", contact: "Robert Szymański", email: "r.szymanski@polimex.pl", phone: "+48 22 890 6789", nip: "5260201234", rate: 37.00 },
    { name: "[DEMO] Stocznia Szczecińska", contact: "Michał Dąbrowski", email: "m.dabrowski@stocznia.pl", phone: "+48 91 901 7890", nip: "8510001234", rate: 29.00 },
    { name: "[DEMO] Royal IHC", contact: "Thomas Bakker", email: "t.bakker@royalihc.com", phone: "+31 78 012 8901", nip: "NL456789012B01", rate: 47.00 },
    { name: "[DEMO] SBM Offshore", contact: "Henk Mulder", email: "h.mulder@sbmoffshore.com", phone: "+31 20 123 9012", nip: "NL567890123B01", rate: 53.00 },
    { name: "[DEMO] TechnipFMC Kraków", contact: "Paweł Grabowski", email: "p.grabowski@technipfmc.com", phone: "+48 12 234 0123", nip: "6790001234", rate: 44.00 },
  ];

  for (const c of clients) {
    // Check by name to avoid duplicates on re-seed
    const exists = await queryOne<{ id: string }>("SELECT id FROM clients WHERE name = $1", [c.name]);
    if (!exists) {
      await execute(
        "INSERT INTO clients (name, contact_person, email, phone, nip, billing_rate) VALUES ($1,$2,$3,$4,$5,$6)",
        [c.name, c.contact, c.email, c.phone, c.nip, c.rate]
      );
    }
  }
  console.log(`[seed-modules] Clients: ${clients.length} records`);

  // ═══ 2. JOB POSTINGS (15 records) ══════════════════════════════════════
  const jobs = [
    { title: "[DEMO] TIG Welder — Offshore Platform", desc: "Experienced TIG welder for offshore platform maintenance in the North Sea. EN ISO 9606-1 certified.", req: "5+ years TIG, EN ISO 9606-1, offshore safety cert, valid medical", loc: "Rotterdam, NL", min: 28, max: 38, type: "Umowa Zlecenie", published: true, close: "2026-05-15" },
    { title: "[DEMO] MIG/MAG Welder — Shipyard", desc: "MIG/MAG welder for new vessel construction at Gdańsk shipyard.", req: "3+ years MIG/MAG, BHP cert, EU work permit", loc: "Gdańsk, PL", min: 25, max: 33, type: "Umowa Zlecenie", published: true, close: "2026-05-01" },
    { title: "[DEMO] Pipe Fitter — Refinery", desc: "Pipe fitter for refinery turnaround project. Must read isometric drawings.", req: "Pipe fitting cert, isometric reading, confined space cert", loc: "Antwerp, BE", min: 30, max: 40, type: "Umowa Zlecenie", published: true, close: "2026-04-30" },
    { title: "[DEMO] Structural Welder — Wind Farm", desc: "Structural welder for onshore wind farm foundation fabrication.", req: "FCAW cert, working at height cert, EN 1090", loc: "Szczecin, PL", min: 26, max: 34, type: "Umowa o Pracę", published: true, close: "2026-06-01" },
    { title: "[DEMO] Senior Fabricator", desc: "Lead fabricator for complex steel structures. Supervisory experience required.", req: "10+ years fabrication, team lead experience, EN 1090-2 EXC3", loc: "Amsterdam, NL", min: 35, max: 48, type: "B2B", published: true, close: "2026-05-20" },
    { title: "[DEMO] ARC Welder — Construction", desc: "ARC/electrode welder for structural steel construction project.", req: "ARC welding cert, construction safety, physical fitness", loc: "Warsaw, PL", min: 24, max: 30, type: "Umowa Zlecenie", published: true, close: "2026-04-25" },
    { title: "[DEMO] Welding Inspector", desc: "CWI/CSWIP certified welding inspector for quality control.", req: "CSWIP 3.1 or CWI, NDE experience, report writing", loc: "Brussels, BE", min: 40, max: 55, type: "B2B", published: true, close: "2026-06-15" },
    { title: "[DEMO] Orbital Welder", desc: "Orbital TIG welder for pharmaceutical piping systems.", req: "Orbital welding cert, cleanroom experience, stainless steel", loc: "Kraków, PL", min: 32, max: 42, type: "Umowa Zlecenie", published: false, close: "2026-07-01" },
    { title: "[DEMO] Maintenance Welder", desc: "General maintenance welder for ongoing facility repairs.", req: "Multi-process welding, maintenance background, flexibility", loc: "Vilnius, LT", min: 22, max: 28, type: "Umowa Zlecenie", published: true, close: "2026-05-10" },
    { title: "[DEMO] Underwater Welder", desc: "Commercial diver/welder for underwater repair work.", req: "Commercial diving cert, hyperbaric welding, medical clearance", loc: "Stavanger, NO", min: 50, max: 75, type: "B2B", published: false, close: "2026-08-01" },
    { title: "[DEMO] Aluminium Welder", desc: "Specialist aluminium TIG welder for marine vessels.", req: "Aluminium TIG cert, EN ISO 9606-2, marine experience", loc: "Rotterdam, NL", min: 30, max: 40, type: "Umowa Zlecenie", published: true, close: "2026-05-25" },
    { title: "[DEMO] Robotic Welding Operator", desc: "Operator for robotic welding cells in automotive manufacturing.", req: "CNC/PLC basics, robotic welding experience, quality systems", loc: "Poznań, PL", min: 27, max: 35, type: "Umowa o Pracę", published: true, close: "2026-06-10" },
    { title: "[DEMO] Boilermaker", desc: "Boilermaker for pressure vessel fabrication and repair.", req: "Boilermaker cert, ASME code, NDT awareness", loc: "Gdynia, PL", min: 28, max: 36, type: "Umowa Zlecenie", published: true, close: "2026-05-30" },
    { title: "[DEMO] Welder Trainer", desc: "Experienced welder to train new recruits at our Warsaw training centre.", req: "15+ years welding, teaching experience, Polish language", loc: "Warsaw, PL", min: 30, max: 38, type: "Umowa o Pracę", published: false, close: "2026-07-15" },
    { title: "[DEMO] Emergency Repair Welder", desc: "On-call welder for emergency repair deployments across EU sites.", req: "Multi-process, EU driving licence, passport ready, flexible", loc: "EU-wide", min: 35, max: 50, type: "Umowa Zlecenie", published: true, close: "2026-12-31" },
  ];

  const jobIds: string[] = [];
  for (const j of jobs) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO job_postings (title, description, requirements, location, salary_min, salary_max, contract_type, is_published, closing_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [j.title, j.desc, j.req, j.loc, j.min, j.max, j.type, j.published, j.close]
    );
    if (row) jobIds.push(row.id);
  }
  console.log(`[seed-modules] Job Postings: ${jobs.length} records`);

  // ═══ 3. JOB APPLICATIONS (20 records) ══════════════════════════════════
  const applicants = [
    { name: "Rajesh Kumar", email: "rajesh.k@gmail.com" },
    { name: "Oleksandr Petrov", email: "o.petrov@ukr.net" },
    { name: "Ram Bahadur Tamang", email: "ram.tamang@gmail.com" },
    { name: "Ion Moldovan", email: "ion.mold@yahoo.ro" },
    { name: "Priya Sharma", email: "priya.s@hotmail.com" },
    { name: "Dmytro Shevchenko", email: "d.shevchenko@gmail.com" },
    { name: "Arjun Patel", email: "arjun.p@gmail.com" },
    { name: "Vasile Dumitru", email: "v.dumitru@gmail.com" },
    { name: "Serhii Bondarenko", email: "s.bondarenko@ukr.net" },
    { name: "Bikash Rai", email: "bikash.rai@gmail.com" },
    { name: "Gheorghe Popescu", email: "g.popescu@yahoo.ro" },
    { name: "Vijay Singh", email: "vijay.s@hotmail.com" },
    { name: "Andriy Kovalenko", email: "a.kovalenko@gmail.com" },
    { name: "Suresh Thapa", email: "suresh.t@gmail.com" },
    { name: "Marian Ionescu", email: "m.ionescu@yahoo.ro" },
    { name: "Deepak Gurung", email: "d.gurung@gmail.com" },
    { name: "Petro Sydorenko", email: "p.sydorenko@ukr.net" },
    { name: "Ravi Chaudhary", email: "ravi.c@gmail.com" },
    { name: "Adrian Radu", email: "a.radu@yahoo.ro" },
    { name: "Santosh Limbu", email: "s.limbu@gmail.com" },
  ];
  const stages = ["New", "New", "New", "Reviewed", "Reviewed", "Contacted", "Contacted", "New", "Reviewed", "New"];

  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i];
    const jobId = jobIds[i % jobIds.length] ?? null;
    const score = Math.round((40 + Math.random() * 55) * 10) / 10;
    await execute(
      `INSERT INTO job_applications (job_id, worker_name, worker_email, stage, match_score, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [jobId, a.name, a.email, stages[i % stages.length], score, "[DEMO] Auto-seeded test application"]
    );
  }
  console.log(`[seed-modules] Applications: ${applicants.length} records`);

  // ═══ 4. HOURS LOG (20 records) ═════════════════════════════════════════
  const workerNames = [
    "Rajesh Kumar", "Oleksandr Petrov", "Ram Bahadur Tamang", "Ion Moldovan",
    "Priya Sharma", "Dmytro Shevchenko", "Arjun Patel", "Vasile Dumitru",
    "Serhii Bondarenko", "Bikash Rai",
  ];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
  const statuses = ["submitted", "submitted", "approved", "approved", "rejected"];

  for (let i = 0; i < 20; i++) {
    const wn = workerNames[i % workerNames.length];
    const m = months[i % months.length];
    const h = 140 + Math.round(Math.random() * 40);
    const st = statuses[i % statuses.length];
    await execute(
      "INSERT INTO hours_log (worker_name, month, hours, note, status) VALUES ($1,$2,$3,$4,$5)",
      [wn, m, h, "[DEMO] Auto-seeded test hours", st]
    );
  }
  console.log("[seed-modules] Hours: 20 records");

  // ═══ 5. POSTED WORKERS — a1_certificates + posting_assignments (15 each) ═══
  // Get real worker IDs to link to
  const workers = await query<{ id: string; full_name: string }>(
    "SELECT id, full_name FROM workers WHERE tenant_id = $1 LIMIT 15", [tenantId]
  );

  if (workers.length > 0) {
    const hostCountries = ["NL", "BE", "DE", "LT", "SK", "CZ"];
    const hostCities = ["Rotterdam", "Antwerp", "Hamburg", "Vilnius", "Bratislava", "Prague"];

    for (let i = 0; i < Math.min(15, workers.length); i++) {
      const w = workers[i % workers.length];
      const hc = hostCountries[i % hostCountries.length];
      const city = hostCities[i % hostCities.length];
      const validFrom = `2026-0${1 + (i % 6)}-01`;
      const validTo = `2027-0${1 + (i % 6)}-01`;

      // A1 certificate
      const cert = await queryOne<{ id: string }>(
        `INSERT INTO a1_certificates (tenant_id, worker_id, worker_name, home_country, host_country, certificate_number, issued_by, valid_from, valid_to, status)
         VALUES ($1,$2,$3,'PL',$4,$5,'ZUS',$6,$7,$8) RETURNING id`,
        [tenantId, w.id, w.full_name, hc, `A1/${hc}/2026/${String(i + 1).padStart(4, "0")}`, "ZUS Oddział Warszawa", validFrom, validTo, i < 12 ? "active" : "expired"]
      );

      // Posting assignment
      await execute(
        `INSERT INTO posting_assignments (tenant_id, worker_id, worker_name, home_country, host_country, host_city, client_company, start_date, end_date, a1_certificate_id, status, notes)
         VALUES ($1,$2,$3,'PL',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId, w.id, w.full_name, hc, city, clients[i % clients.length].name.replace("[DEMO] ", ""),
         validFrom, validTo, cert?.id ?? null, i < 12 ? "active" : "completed", "[DEMO] Auto-seeded posting"]
      );
    }
    console.log(`[seed-modules] A1 Certificates: ${Math.min(15, workers.length)} records`);
    console.log(`[seed-modules] Posting Assignments: ${Math.min(15, workers.length)} records`);

    // ═══ 6. GDPR CONSENT RECORDS (20 records) ════════════════════════════
    const consentTypes = ["data_processing", "biometric_data", "payroll_sharing", "document_storage", "communication"];

    for (let i = 0; i < Math.min(20, workers.length * consentTypes.length); i++) {
      const w = workers[i % workers.length];
      const ct = consentTypes[i % consentTypes.length];
      const granted = i % 5 !== 4; // 80% granted, 20% revoked
      await execute(
        `INSERT INTO consent_records (tenant_id, worker_id, worker_name, consent_type, granted, granted_at, ip_address, version)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,'1.0') ON CONFLICT DO NOTHING`,
        [tenantId, w.id, w.full_name, ct, granted, "demo-seed"]
      );
    }
    console.log("[seed-modules] GDPR Consents: 20 records");

    // ═══ 7. DOCUMENT WORKFLOWS (10 records) ════════════════════════════
    const docTypes = ["BHP Certificate", "TRC Renewal", "Medical Exam", "Passport Scan", "Work Permit", "Safety Training", "UDT Certificate", "Contract Copy", "A1 Certificate", "PESEL Registration"];
    const docStatuses = ["uploaded", "under_review", "approved", "approved", "under_review", "rejected", "approved", "uploaded", "under_review", "approved"];
    const dwCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM document_workflows WHERE tenant_id = $1", [tenantId]);
    if (parseInt(dwCount[0]?.count ?? "0") < 5) {
      for (let i = 0; i < Math.min(10, workers.length); i++) {
        const w = workers[i % workers.length];
        await execute(
          `INSERT INTO document_workflows (tenant_id, worker_id, worker_name, document_type, status, file_name, uploaded_by, version, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenantId, w.id, w.full_name, docTypes[i], docStatuses[i], `[DEMO] ${docTypes[i].toLowerCase().replace(/ /g, "_")}_${w.full_name.split(" ")[1]?.toLowerCase() ?? "doc"}.pdf`, "Admin", 1, "[DEMO] Auto-seeded document workflow"]
        );
      }
      console.log("[seed-modules] Document Workflows: 10 records");
    }

    // ═══ 8. CONTRACTS (10 records) ═════════════════════════════════════
    const contractTypes = ["umowa_zlecenie", "umowa_zlecenie", "umowa_o_prace", "umowa_zlecenie", "b2b", "umowa_zlecenie", "umowa_o_prace", "umowa_zlecenie", "b2b", "umowa_zlecenie"];
    const contractStatuses = ["active", "active", "active", "pending_signature", "active", "draft", "active", "active", "pending_signature", "terminated"];
    const cCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM contracts WHERE tenant_id = $1", [tenantId]);
    if (parseInt(cCount[0]?.count ?? "0") < 5) {
      for (let i = 0; i < Math.min(10, workers.length); i++) {
        const w = workers[i % workers.length];
        await execute(
          `INSERT INTO contracts (tenant_id, worker_id, worker_name, contract_type, status, start_date, end_date, hourly_rate, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenantId, w.id, w.full_name, contractTypes[i], contractStatuses[i], "2026-01-01", "2026-12-31", 28 + i * 1.5, "[DEMO] Auto-seeded contract"]
        );
      }
      console.log("[seed-modules] Contracts: 10 records");
    }

    // ═══ 9. GENERATED CONTRACTS — AI templates (6 records) ═════════════
    const gcCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM generated_contracts WHERE tenant_id = $1", [tenantId]);
    if (parseInt(gcCount[0]?.count ?? "0") < 3) {
      const templates = [
        { type: "Umowa Zlecenie", worker: workers[0], company: "Remontowa Shiprepair Yard" },
        { type: "Umowa o Pracę", worker: workers[1], company: "Energomontaż Północ" },
        { type: "B2B", worker: workers[2], company: "Heerema Marine Contractors" },
        { type: "Umowa Zlecenie", worker: workers[3 % workers.length], company: "BESIX Group" },
        { type: "Umowa o Pracę", worker: workers[4 % workers.length], company: "Damen Shipyards" },
        { type: "Umowa Zlecenie", worker: workers[5 % workers.length], company: "Jan De Nul Group" },
      ];
      for (const t of templates) {
        const html = `<html><body><h1>[DEMO] ${t.type}</h1><p>Worker: ${t.worker.full_name}</p><p>Company: ${t.company}</p><p>Rate: 32.00 PLN/h</p><p>Period: 01.01.2026 – 31.12.2026</p><p>This is a demo contract template generated for testing purposes.</p></body></html>`;
        await execute(
          `INSERT INTO generated_contracts (tenant_id, worker_id, worker_name, company_name, contract_type, status, contract_html)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, t.worker.id, t.worker.full_name, t.company, t.type, "draft", html]
        );
      }
      console.log("[seed-modules] Generated Contracts: 6 records");
    }

    // ═══ 10. PAYROLL SNAPSHOTS (if none exist for these workers) ══════
    const psCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM payroll_snapshots WHERE tenant_id = $1", [tenantId]);
    if (parseInt(psCount[0]?.count ?? "0") < 5) {
      const months = ["2026-01", "2026-02", "2026-03"];
      for (let i = 0; i < Math.min(10, workers.length); i++) {
        const w = workers[i];
        for (const month of months) {
          const hours = 150 + Math.round(Math.random() * 20);
          const rate = 28 + i * 1.2;
          const gross = Math.round(hours * rate * 100) / 100;
          const zus = Math.round(gross * 0.1126 * 100) / 100;
          const health = Math.round((gross - zus) * 0.09 * 100) / 100;
          const pit = Math.max(0, Math.round((gross - zus) * 0.8 * 0.12 - 300));
          const netto = Math.round((gross - zus - health - pit) * 100) / 100;
          await execute(
            `INSERT INTO payroll_snapshots (month, worker_id, worker_name, site, hours, hourly_rate, gross, employee_zus, health_ins, est_pit, advance, penalties, netto, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12)`,
            [month, w.id, w.full_name, w.assigned_site ?? "Warsaw", hours, rate, gross, zus, health, pit, netto, tenantId]
          );
        }
      }
      console.log("[seed-modules] Payroll Snapshots: 30 records (10 workers × 3 months)");
    }

  } else {
    console.log("[seed-modules] No workers found — skipping posted workers and GDPR data.");
  }
  } // end skipModules

  // ═══════════════════════════════════════════════════════════════════════
  // TRC CASES + LEGAL CASES — 5 scenarios covering every legal path
  // ═══════════════════════════════════════════════════════════════════════
  const allWorkers = await query<any>("SELECT id, full_name FROM workers WHERE tenant_id = $1 ORDER BY created_at", [tenantId]);
  const trcExisting = await query<{ count: string }>("SELECT COUNT(*) AS count FROM trc_cases WHERE tenant_id = $1", [tenantId]);
  if (parseInt(trcExisting[0]?.count ?? "0") < 3 && allWorkers.length >= 5) {
    console.log("[seed-modules] Seeding TRC case demo data (5 scenarios)…");

    // Scenario 1: Active TRC, no issues — Mark Anthony Santos
    const w1 = allWorkers[1]; // TRC expiring 2026-04-20 (soon)
    const trc1 = await queryOne<{id:string}>(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, case_type, status, voivodeship, employer_name, employer_nip, start_date, expiry_date, notes)
       VALUES ($1,$2,$3,'Filipino','Type A','pending',$4,'Apatris Sp. z o.o.','1234567890',$5,$6,'[DEMO] TRC renewal in progress — permit expiring soon') RETURNING id`,
      [tenantId, w1.id, w1.full_name, "Mazowieckie", "2025-04-20", "2026-04-20"]
    );
    await queryOne(
      `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, next_action, notes, trc_case_id)
       VALUES ($1,$2,'TRC','PENDING','Submit renewal application before expiry','[DEMO] TRC renewal — expiry approaching',$3) RETURNING id`,
      [w1.id, tenantId, trc1!.id]
    );

    // Scenario 2: Expired TRC, filed on time — Art. 108 protected — Roberto Mendoza
    const w2 = allWorkers[3]; // TRC expired 2026-03-10
    const trc2 = await queryOne<{id:string}>(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, case_type, status, voivodeship, employer_name, employer_nip, start_date, expiry_date, notes)
       VALUES ($1,$2,$3,'Filipino','Type A','pending',$4,'Apatris Sp. z o.o.','1234567890',$5,$6,'[DEMO] TRC expired but filed before expiry — Art. 108 protection active') RETURNING id`,
      [tenantId, w2.id, w2.full_name, "Pomorskie", "2024-03-10", "2026-03-10"]
    );
    await queryOne(
      `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, next_action, notes, trc_case_id)
       VALUES ($1,$2,'TRC','PENDING','Wait for voivodeship decision — Art. 108 active','[DEMO] Protected under Art. 108 — filed on 2026-02-28',$3) RETURNING id`,
      [w2.id, tenantId, trc2!.id]
    );

    // Scenario 3: Rejection — appeal needed — Arjun Sharma
    const w3 = allWorkers[7]; // TRC expired 2026-01-20
    const trc3 = await queryOne<{id:string}>(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, case_type, status, voivodeship, employer_name, employer_nip, start_date, expiry_date, notes)
       VALUES ($1,$2,$3,'Indian','Type A','rejected',$4,'Apatris Sp. z o.o.','1234567890',$5,$6,'[DEMO] TRC rejected — missing financial proof and health insurance') RETURNING id`,
      [tenantId, w3.id, w3.full_name, "Mazowieckie", "2024-01-20", "2026-01-20"]
    );
    const lc3 = await queryOne<{id:string}>(
      `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, appeal_deadline, next_action, notes, trc_case_id)
       VALUES ($1,$2,'APPEAL','REJECTED',$3,'File appeal to Szef UdSC within 14 days','[DEMO] Rejection for missing docs — appeal possible',$4) RETURNING id`,
      [w3.id, tenantId, "2026-04-25", trc3!.id]
    );
    await execute(
      `INSERT INTO rejection_analyses (tenant_id, worker_id, legal_case_id, rejection_text, category, explanation, likely_cause, next_steps_json, appeal_possible, confidence_score, source_type)
       VALUES ($1,$2,$3,$4,'MISSING_DOCS',$5,$6,$7,true,0.91,'RULE')`,
      [tenantId, w3.id, lc3!.id,
       "Decyzja Wojewody Mazowieckiego odmawia udzielenia zezwolenia na pobyt czasowy z powodu braku dokumentów potwierdzających wystarczające środki finansowe oraz brak ubezpieczenia zdrowotnego.",
       "[DEMO] Rejection due to missing financial proof and health insurance documents",
       "Worker did not respond to document request within deadline",
       JSON.stringify(["Collect bank statements", "Obtain health insurance proof", "File appeal within 14 days", "Consult immigration lawyer"])]
    );

    // Scenario 4: Formal defect — pending correction — Dinesh Magar
    const w4 = allWorkers[14]; // TRC expired 2026-02-15
    const trc4 = await queryOne<{id:string}>(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, case_type, status, voivodeship, employer_name, employer_nip, start_date, expiry_date, notes)
       VALUES ($1,$2,$3,'Nepali','Type A','formal_defect',$4,'Apatris Sp. z o.o.','1234567890',$5,$6,'[DEMO] Formal defect — missing employer declaration, 7-day correction deadline') RETURNING id`,
      [tenantId, w4.id, w4.full_name, "Pomorskie", "2024-02-15", "2026-02-15"]
    );
    await queryOne(
      `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, next_action, notes, trc_case_id)
       VALUES ($1,$2,'TRC','PENDING','Submit corrected employer declaration within 7 days','[DEMO] Formal defect — Art. 64 KPA correction window open',$3) RETURNING id`,
      [w4.id, tenantId, trc4!.id]
    );

    // Scenario 5: Ukrainian worker — CUKR/Specustawa — Oleksandr Kovalenko
    const w5 = allWorkers[15]; // Ukrainian, TRC 2026-08-25
    const trc5 = await queryOne<{id:string}>(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, case_type, status, voivodeship, employer_name, employer_nip, start_date, expiry_date, notes)
       VALUES ($1,$2,$3,'Ukrainian','Type A','pending',$4,'Apatris Sp. z o.o.','1234567890',$5,$6,'[DEMO] Ukrainian worker — CUKR/Specustawa provisions apply, extended legal stay') RETURNING id`,
      [tenantId, w5.id, w5.full_name, "Mazowieckie", "2024-08-25", "2026-08-25"]
    );
    await queryOne(
      `INSERT INTO legal_cases (worker_id, tenant_id, case_type, status, next_action, notes, trc_case_id)
       VALUES ($1,$2,'TRC','PENDING','Verify CUKR application status — extended protection applies','[DEMO] Ukrainian special provisions — Specustawa protection',$3) RETURNING id`,
      [w5.id, tenantId, trc5!.id]
    );

    console.log("[seed-modules] TRC Cases: 5 scenarios (renewal, Art.108, rejection, formal defect, CUKR)");
    console.log("[seed-modules] Legal Cases: 5 linked cases");
    console.log("[seed-modules] Rejection Analyses: 1 (Arjun Sharma — MISSING_DOCS)");
  }

  console.log("[seed-modules] Module demo data seeding complete.");
}
