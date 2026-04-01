import { query, execute } from "./db.js";

export async function seedSampleData(): Promise<void> {
  try {
    // Check if workers table has < 5 rows
    const countRows = await query<{ count: string }>("SELECT COUNT(*) AS count FROM workers");
    const workerCount = parseInt(countRows[0]?.count ?? "0", 10);

    if (workerCount >= 5) {
      console.log(`[seed] Workers table already has ${workerCount} rows — skipping seed.`);
      return;
    }

    console.log("[seed] Seeding sample data…");

    // ── 10 sample workers ──────────────────────────────────────────────────
    const workers = [
      { name: "Andrzej Kowalski", spec: "TIG", site: "Gdańsk Shipyard", nationality: "Polish", trc: "2026-09-15", passport: "2028-03-01", bhp: "2026-06-01", contract: "2026-12-31" },
      { name: "Oleksandr Petrov", spec: "MIG", site: "Szczecin Dockyard", nationality: "Ukrainian", trc: "2026-04-10", passport: "2027-11-20", bhp: "2026-03-15", contract: "2026-08-31" },
      { name: "Rajesh Kumar", spec: "MAG", site: "Gdańsk Shipyard", nationality: "Indian", trc: "2026-02-28", passport: "2029-05-10", bhp: "2026-07-20", contract: "2026-06-30" },
      { name: "Ion Moldovan", spec: "MMA", site: "Gdynia Naval", nationality: "Moldovan", trc: "2026-05-22", passport: "2027-08-14", bhp: "2026-01-10", contract: "2026-10-15" },
      { name: "Priya Sharma", spec: "FABRICATOR", site: "Szczecin Dockyard", nationality: "Indian", trc: "2026-11-30", passport: "2028-12-25", bhp: "2026-09-05", contract: "2027-03-31" },
      { name: "Dmytro Shevchenko", spec: "TIG", site: "Gdynia Naval", nationality: "Ukrainian", trc: "2026-03-01", passport: "2027-06-18", bhp: "2026-04-20", contract: "2026-07-15" },
      { name: "Arjun Patel", spec: "ARC", site: "Gdańsk Shipyard", nationality: "Indian", trc: "2026-08-12", passport: "2029-01-30", bhp: "2026-10-10", contract: "2027-01-31" },
      { name: "Vasile Dumitru", spec: "MIG", site: "Szczecin Dockyard", nationality: "Romanian", trc: "2026-06-05", passport: "2028-07-22", bhp: "2026-05-15", contract: "2026-11-30" },
      { name: "Piotr Wiśniewski", spec: "FCAW", site: "Gdynia Naval", nationality: "Polish", trc: "2026-12-20", passport: "2029-09-10", bhp: "2026-08-25", contract: "2027-06-30" },
      { name: "Serhii Bondarenko", spec: "MAG", site: "Gdańsk Shipyard", nationality: "Ukrainian", trc: "2026-01-15", passport: "2027-04-08", bhp: "2026-02-28", contract: "2026-05-31" },
    ];

    for (const w of workers) {
      await execute(
        `INSERT INTO workers (full_name, specialization, assigned_site, trc_expiry, passport_expiry, bhp_expiry, contract_end_date, hourly_rate, monthly_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 31.40, 160)`,
        [w.name, w.spec, w.site, w.trc, w.passport, w.bhp, w.contract]
      );
    }
    console.log("[seed] Inserted 10 sample workers.");

    // ── 3 sample job postings ──────────────────────────────────────────────
    const jobs = [
      { title: "TIG Welder — Gdańsk Shipyard", desc: "Experienced TIG welder for marine vessel construction. EN 287-1 certification required.", reqs: "3+ years TIG welding, EN 287-1, valid BHP", loc: "Gdańsk", min: 28, max: 38, type: "Full-time", published: true },
      { title: "MIG/MAG Welder — Szczecin", desc: "MIG/MAG welding positions available for dockyard repairs and new builds.", reqs: "2+ years MIG/MAG, safety training", loc: "Szczecin", min: 25, max: 35, type: "Contract", published: true },
      { title: "Fabricator/Fitter — Gdynia Naval", desc: "Steel fabrication and fitting for naval vessel components.", reqs: "Fabrication experience, ability to read technical drawings", loc: "Gdynia", min: 26, max: 34, type: "Full-time", published: false },
    ];

    for (const j of jobs) {
      await execute(
        `INSERT INTO job_postings (title, description, requirements, location, salary_min, salary_max, contract_type, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [j.title, j.desc, j.reqs, j.loc, j.min, j.max, j.type, j.published]
      );
    }
    console.log("[seed] Inserted 3 sample job postings.");

    // ── 3 sample invoices ──────────────────────────────────────────────────
    const invoices = [
      {
        number: "INV-2026-001",
        client_name: "Remontowa Shipbuilding",
        month_year: "2026-01",
        items: JSON.stringify([{ description: "TIG Welding Services — 160 hrs", qty: 160, rate: 35, amount: 5600 }]),
        subtotal: 5600, vat_rate: 23, vat_amount: 1288, total: 6888,
        due_date: "2026-02-15", status: "paid",
      },
      {
        number: "INV-2026-002",
        client_name: "Szczecin Dockyard SA",
        month_year: "2026-02",
        items: JSON.stringify([{ description: "MIG Welding Team — 320 hrs", qty: 320, rate: 30, amount: 9600 }]),
        subtotal: 9600, vat_rate: 23, vat_amount: 2208, total: 11808,
        due_date: "2026-03-15", status: "sent",
      },
      {
        number: "INV-2026-003",
        client_name: "PGZ Stocznia Wojenna",
        month_year: "2026-03",
        items: JSON.stringify([{ description: "Fabrication Services — 240 hrs", qty: 240, rate: 32, amount: 7680 }]),
        subtotal: 7680, vat_rate: 23, vat_amount: 1766.40, total: 9446.40,
        due_date: "2026-04-15", status: "draft",
      },
    ];

    for (const inv of invoices) {
      await execute(
        `INSERT INTO invoices (invoice_number, client_name, month_year, items, subtotal, vat_rate, vat_amount, total, due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [inv.number, inv.client_name, inv.month_year, inv.items, inv.subtotal, inv.vat_rate, inv.vat_amount, inv.total, inv.due_date, inv.status]
      );
    }
    console.log("[seed] Inserted 3 sample invoices.");

    console.log("[seed] Sample data seeding complete.");
  } catch (err) {
    console.error("[seed] Error seeding data:", err instanceof Error ? err.message : err);
  }
}
