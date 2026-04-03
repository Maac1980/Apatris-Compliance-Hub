import { query, queryOne, execute } from "./db.js";
import { getDefaultTenantId } from "./tenant.js";

export async function seedComprehensiveData(): Promise<void> {
  const tenantId = getDefaultTenantId();
  if (!tenantId) { console.log("[seed-full] No tenant ID — skipping."); return; }

  const existing = await query<{ count: string }>("SELECT COUNT(*) AS count FROM workers WHERE tenant_id = $1", [tenantId]);
  if (parseInt(existing[0]?.count ?? "0") >= 25) {
    console.log("[seed-full] Already has 25+ workers — skipping comprehensive seed.");
    return;
  }

  console.log("[seed-full] Seeding comprehensive dummy data…");

  // ═══════════════════════════════════════════════════════════════════
  // 25 WORKERS — Filipino, Indian, Nepali, Ukrainian, Romanian
  // Sites across Poland, Netherlands, Lithuania, Belgium, Slovakia, Czech Republic, Romania
  // ═══════════════════════════════════════════════════════════════════
  const workers = [
    // Filipino workers
    { name: "Juan Carlos Reyes", spec: "TIG Welder", site: "Rotterdam Europoort, NL", phone: "+48501001001", email: "jc.reyes@apatris.pl", pesel: "92031501234", iban: "PL61109010140000071219812874", rate: 31.40, hours: 160, trc: "2026-11-15", passport: "2028-06-01", bhp: "2026-08-01", wp: "2026-11-15", contract: "2027-03-31", medical: "2026-09-01" },
    { name: "Mark Anthony Santos", spec: "MIG Welder", site: "Antwerp Port, BE", phone: "+48501001002", email: "m.santos@apatris.pl", pesel: "89052312345", iban: "PL27114020040000300201355387", rate: 29.50, hours: 160, trc: "2026-04-20", passport: "2027-09-10", bhp: "2026-05-15", wp: "2026-04-20", contract: "2026-08-31", medical: "2026-06-20" },
    { name: "Eduardo dela Cruz", spec: "Scaffolder", site: "Klaipeda Shipyard, LT", phone: "+48501001003", email: "e.delacruz@apatris.pl", pesel: "95081601234", iban: "PL83102019190000910201568234", rate: 28.00, hours: 176, trc: "2027-02-10", passport: "2029-01-15", bhp: "2026-12-01", wp: "2027-02-10", contract: "2027-06-30", medical: "2027-01-15" },
    { name: "Roberto Mendoza", spec: "Fabricator", site: "Gdansk Shipyard, PL", phone: "+48501001004", email: "r.mendoza@apatris.pl", pesel: "91011501234", iban: "PL49116022020000000348912564", rate: 32.00, hours: 160, trc: "2026-03-10", passport: "2027-07-20", bhp: "2026-02-28", wp: "2026-03-10", contract: "2026-06-30", medical: "2026-04-15" },
    { name: "Alvin Garcia", spec: "TIG Welder", site: "Bratislava Industrial, SK", phone: "+48501001005", email: "a.garcia@apatris.pl", pesel: "87042201234", iban: "PL53105014461000002262463217", rate: 31.40, hours: 160, trc: "2026-09-20", passport: "2028-11-05", bhp: "2026-07-10", wp: "2026-09-20", contract: "2026-12-31", medical: "2026-08-25" },
    // Indian workers
    { name: "Rajesh Kumar Singh", spec: "MIG Welder", site: "Rotterdam Europoort, NL", phone: "+48501001006", email: "r.singh@apatris.pl", pesel: "93061801234", iban: "PL09109024020000000661390122", rate: 30.00, hours: 160, trc: "2026-06-15", passport: "2028-03-20", bhp: "2026-05-01", wp: "2026-06-15", contract: "2026-10-31", medical: "2026-07-10" },
    { name: "Vikram Patel", spec: "Electrician", site: "Warsaw Industrial Zone, PL", phone: "+48501001007", email: "v.patel@apatris.pl", pesel: "90020301234", iban: "PL67105015511000009082450124", rate: 33.00, hours: 168, trc: "2026-08-01", passport: "2028-05-12", bhp: "2026-06-20", wp: "2026-08-01", contract: "2026-11-30", medical: "2026-09-15" },
    { name: "Arjun Sharma", spec: "MAG Welder", site: "Antwerp Port, BE", phone: "+48501001008", email: "a.sharma@apatris.pl", pesel: "88090701234", iban: "PL94124060681111001049709858", rate: 31.40, hours: 160, trc: "2026-01-20", passport: "2027-04-15", bhp: "2026-01-10", wp: "2026-01-20", contract: "2026-05-31", medical: "2026-03-01" },
    { name: "Suresh Yadav", spec: "Forklift Operator", site: "Gdansk Shipyard, PL", phone: "+48501001009", email: "s.yadav@apatris.pl", pesel: "94070201234", iban: "PL15109024020000000611203544", rate: 26.00, hours: 168, trc: "2027-01-15", passport: "2029-06-30", bhp: "2027-03-01", wp: "2027-01-15", contract: "2027-09-30", medical: "2027-02-20" },
    { name: "Deepak Verma", spec: "TIG Welder", site: "Prague Industrial, CZ", phone: "+48501001010", email: "d.verma@apatris.pl", pesel: "96031201234", iban: "PL78116022020000000289045678", rate: 31.40, hours: 160, trc: "2026-05-10", passport: "2028-02-28", bhp: "2026-04-15", wp: "2026-05-10", contract: "2026-09-30", medical: "2026-06-01" },
    // Nepali workers
    { name: "Ram Bahadur Tamang", spec: "Scaffolder", site: "Klaipeda Shipyard, LT", phone: "+48501001011", email: "r.tamang@apatris.pl", pesel: "85112301234", iban: "PL42102019190000910201999887", rate: 28.50, hours: 176, trc: "2026-10-05", passport: "2028-08-15", bhp: "2026-07-20", wp: "2026-10-05", contract: "2027-01-31", medical: "2026-11-01" },
    { name: "Bikash Gurung", spec: "MMA Welder", site: "Rotterdam Europoort, NL", phone: "+48501001012", email: "b.gurung@apatris.pl", pesel: "97050401234", iban: "PL56109010140000071248965412", rate: 30.50, hours: 160, trc: "2026-04-05", passport: "2027-10-20", bhp: "2026-03-20", wp: "2026-04-05", contract: "2026-07-31", medical: "2026-05-10" },
    { name: "Santosh Rai", spec: "Forklift Operator", site: "Timisoara Factory, RO", phone: "+48501001013", email: "s.rai@apatris.pl", pesel: "86080101234", iban: "PL33105014461000002288456321", rate: 27.00, hours: 168, trc: "2026-07-20", passport: "2028-04-10", bhp: "2026-06-15", wp: "2026-07-20", contract: "2026-11-15", medical: "2026-08-01" },
    { name: "Prakash Thapa", spec: "TIG Welder", site: "Bratislava Industrial, SK", phone: "+48501001014", email: "p.thapa@apatris.pl", pesel: "91120501234", iban: "PL88124060681111001098765432", rate: 31.40, hours: 160, trc: "2026-12-15", passport: "2029-03-20", bhp: "2026-11-01", wp: "2026-12-15", contract: "2027-04-30", medical: "2026-12-01" },
    { name: "Dinesh Magar", spec: "Electrician", site: "Antwerp Port, BE", phone: "+48501001015", email: "d.magar@apatris.pl", pesel: "89030201234", iban: "PL71116022020000000312457890", rate: 33.00, hours: 168, trc: "2026-02-15", passport: "2027-08-05", bhp: "2026-02-01", wp: "2026-02-15", contract: "2026-06-15", medical: "2026-03-20" },
    // Ukrainian workers
    { name: "Oleksandr Kovalenko", spec: "MIG Welder", site: "Warsaw Industrial Zone, PL", phone: "+48501001016", email: "o.kovalenko@apatris.pl", pesel: "92091001234", iban: "PL19109024020000000755123987", rate: 30.00, hours: 160, trc: "2026-08-25", passport: "2028-07-15", bhp: "2026-07-01", wp: "2026-08-25", contract: "2026-12-15", medical: "2026-09-10" },
    { name: "Dmytro Shevchenko", spec: "TIG Welder", site: "Gdansk Shipyard, PL", phone: "+48501001017", email: "d.shevchenko@apatris.pl", pesel: "90040801234", iban: "PL62102019190000910201678543", rate: 31.40, hours: 160, trc: "2026-11-20", passport: "2028-12-10", bhp: "2026-10-15", wp: "2026-11-20", contract: "2027-05-31", medical: "2026-12-20" },
    { name: "Serhii Bondarenko", spec: "MAG Welder", site: "Klaipeda Shipyard, LT", phone: "+48501001018", email: "s.bondarenko@apatris.pl", pesel: "95022801234", iban: "PL45109010140000071267894561", rate: 30.00, hours: 160, trc: "2026-05-25", passport: "2028-01-20", bhp: "2026-04-10", wp: "2026-05-25", contract: "2026-09-15", medical: "2026-06-30" },
    { name: "Viktor Marchenko", spec: "Fabricator", site: "Prague Industrial, CZ", phone: "+48501001019", email: "v.marchenko@apatris.pl", pesel: "88060301234", iban: "PL37105015511000009099887766", rate: 32.00, hours: 160, trc: "2026-07-10", passport: "2028-06-25", bhp: "2026-06-05", wp: "2026-07-10", contract: "2026-10-31", medical: "2026-08-15" },
    { name: "Ihor Lysenko", spec: "Scaffolder", site: "Rotterdam Europoort, NL", phone: "+48501001020", email: "i.lysenko@apatris.pl", pesel: "93100101234", iban: "PL84116022020000000345678901", rate: 29.00, hours: 176, trc: "2027-03-01", passport: "2029-08-15", bhp: "2027-01-20", wp: "2027-03-01", contract: "2027-07-31", medical: "2027-02-15" },
    // Romanian workers
    { name: "Ion Popescu", spec: "MIG Welder", site: "Antwerp Port, BE", phone: "+48501001021", email: "i.popescu@apatris.pl", pesel: "91071501234", iban: "PL29109024020000000822345678", rate: 30.00, hours: 160, trc: "2026-04-30", passport: "2027-12-01", bhp: "2026-03-25", wp: "2026-04-30", contract: "2026-08-15", medical: "2026-05-20" },
    { name: "Vasile Dumitru", spec: "Forklift Operator", site: "Timisoara Factory, RO", phone: "+48501001022", email: "v.dumitru@apatris.pl", pesel: "87112201234", iban: "PL51102019190000910201445566", rate: 26.50, hours: 168, trc: "2026-09-10", passport: "2028-10-20", bhp: "2026-08-15", wp: "2026-09-10", contract: "2027-02-28", medical: "2026-10-01" },
    { name: "Gheorghe Marinescu", spec: "Electrician", site: "Warsaw Industrial Zone, PL", phone: "+48501001023", email: "g.marinescu@apatris.pl", pesel: "94030501234", iban: "PL73105014461000002233445566", rate: 33.50, hours: 168, trc: "2026-06-20", passport: "2028-09-05", bhp: "2026-05-10", wp: "2026-06-20", contract: "2026-10-15", medical: "2026-07-25" },
    { name: "Marian Constantinescu", spec: "TIG Welder", site: "Bratislava Industrial, SK", phone: "+48501001024", email: "m.constantinescu@apatris.pl", pesel: "96081001234", iban: "PL16124060681111001055667788", rate: 31.40, hours: 160, trc: "2026-03-20", passport: "2027-11-10", bhp: "2026-02-15", wp: "2026-03-20", contract: "2026-07-15", medical: "2026-04-20" },
    { name: "Adrian Radu", spec: "MAG Welder", site: "Gdansk Shipyard, PL", phone: "+48501001025", email: "a.radu@apatris.pl", pesel: "90050701234", iban: "PL92116022020000000478901234", rate: 30.50, hours: 160, trc: "2026-10-25", passport: "2029-02-10", bhp: "2026-09-20", wp: "2026-10-25", contract: "2027-01-15", medical: "2026-11-10" },
  ];

  await execute("DELETE FROM workers WHERE tenant_id = $1", [tenantId]);

  const workerIds: string[] = [];
  for (const w of workers) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO workers (tenant_id, full_name, specialization, assigned_site, phone, email, pesel, iban, hourly_rate, monthly_hours, trc_expiry, passport_expiry, bhp_expiry, work_permit_expiry, contract_end_date, medical_exam_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [tenantId, w.name, w.spec, w.site, w.phone, w.email, w.pesel, w.iban, w.rate, w.hours, w.trc, w.passport, w.bhp, w.wp, w.contract, w.medical]
    );
    workerIds.push(row!.id);
  }
  console.log(`[seed-full] Inserted ${workerIds.length} workers.`);

  // ═══════════════════════════════════════════════════════════════════
  // IMMIGRATION PERMITS — Dutch, Belgian, Polish work authorisations + A1 certs
  // ═══════════════════════════════════════════════════════════════════
  const permitData = [
    // Workers in NL — Dutch TWV/GVVA work permits
    { idx: 0, type: "Work Permit", country: "NL", note: "Dutch TWV work authorisation" },
    { idx: 5, type: "Work Permit", country: "NL", note: "Dutch GVVA combined permit" },
    { idx: 11, type: "Work Permit", country: "NL", note: "Dutch TWV work authorisation" },
    { idx: 19, type: "Work Permit", country: "NL", note: "Dutch GVVA combined permit" },
    // Workers in BE — Belgian Single Permit
    { idx: 1, type: "Work Permit", country: "BE", note: "Belgian Single Permit (Gecombineerde vergunning)" },
    { idx: 7, type: "Work Permit", country: "BE", note: "Belgian Single Permit" },
    { idx: 14, type: "Work Permit", country: "BE", note: "Belgian Single Permit" },
    { idx: 20, type: "Work Permit", country: "BE", note: "Belgian Single Permit" },
    // Workers in PL — Polish TRC
    { idx: 3, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    { idx: 6, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    { idx: 8, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    { idx: 15, type: "TRC", country: "PL", note: "Karta pobytu czasowego z pozwoleniem na pracę" },
    { idx: 16, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    { idx: 22, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    { idx: 24, type: "TRC", country: "PL", note: "Karta pobytu czasowego" },
    // A1 certificates — for cross-border posted workers
    { idx: 0, type: "A1", country: "NL", note: "A1 Certificate — Posted from PL to NL under PWD" },
    { idx: 1, type: "A1", country: "BE", note: "A1 Certificate — Posted from PL to BE under PWD" },
    { idx: 2, type: "A1", country: "LT", note: "A1 Certificate — Posted from PL to LT under PWD" },
    { idx: 4, type: "A1", country: "SK", note: "A1 Certificate — Posted from PL to SK under PWD" },
    { idx: 9, type: "A1", country: "CZ", note: "A1 Certificate — Posted from PL to CZ under PWD" },
    { idx: 10, type: "A1", country: "LT", note: "A1 Certificate — Posted from PL to LT under PWD" },
    { idx: 12, type: "A1", country: "RO", note: "A1 Certificate — Posted from PL to RO under PWD" },
    { idx: 13, type: "A1", country: "SK", note: "A1 Certificate — Posted from PL to SK under PWD" },
    { idx: 18, type: "A1", country: "CZ", note: "A1 Certificate — Posted from PL to CZ under PWD" },
    // Passports for non-EU workers
    { idx: 0, type: "Passport", country: "PH", note: "Philippine passport" },
    { idx: 5, type: "Passport", country: "IN", note: "Indian passport" },
    { idx: 10, type: "Passport", country: "NP", note: "Nepali passport" },
  ];

  for (const p of permitData) {
    const w = workers[p.idx];
    const daysOffset = p.idx < 5 ? -10 + p.idx * 20 : p.idx < 10 ? 15 + p.idx * 5 : 40 + p.idx * 3;
    const expiry = new Date(Date.now() + daysOffset * 86_400_000).toISOString().slice(0, 10);
    const trcSubmitted = p.idx === 3 || p.idx === 7;
    await execute(
      `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status, trc_application_submitted, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, workerIds[p.idx], w.name, p.type, p.country, new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10), expiry, daysOffset < 0 ? "expired" : "active", trcSubmitted, p.note]
    );
  }
  console.log("[seed-full] Inserted immigration permits + A1 certificates.");

  // ═══════════════════════════════════════════════════════════════════
  // ONBOARDING CHECKLISTS
  // ═══════════════════════════════════════════════════════════════════
  const steps = ["Personal details verified", "Passport copy collected", "Work permit / visa copy collected", "ZUS registration triggered", "Contract signed", "Bank details collected", "Site safety induction completed", "WhatsApp number verified", "Face ID enrolled", "First shift assigned"];
  for (let i = 0; i < 15; i++) {
    const completedSteps = i < 3 ? 10 : i < 6 ? 8 : i < 10 ? 5 : 3;
    for (let s = 0; s < steps.length; s++) {
      await execute(
        `INSERT INTO onboarding_checklists (tenant_id, worker_id, worker_name, step_name, step_order, status, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, workerIds[i], workers[i].name, steps[s], s + 1, s < completedSteps ? "completed" : "pending", s < completedSteps ? new Date().toISOString() : null]
      );
    }
  }
  console.log("[seed-full] Inserted onboarding checklists.");

  // ═══════════════════════════════════════════════════════════════════
  // CRM COMPANIES — Netherlands, Belgium, Poland
  // ═══════════════════════════════════════════════════════════════════
  const companies = [
    { name: "Heerema Marine Contractors B.V.", nip: "NL003725662B01", contact: "Jan van der Berg", email: "j.vanderberg@heerema.com", phone: "+31102345678", country: "NL" },
    { name: "Damen Shipyards Group", nip: "NL004876543B01", contact: "Pieter de Vries", email: "p.devries@damen.com", phone: "+31183639911", country: "NL" },
    { name: "BESIX Group S.A.", nip: "BE0400340340", contact: "Marc Dubois", email: "m.dubois@besix.com", phone: "+3227787878", country: "BE" },
    { name: "Jan De Nul Group N.V.", nip: "BE0400338378", contact: "Thomas Janssens", email: "t.janssens@jandenul.com", phone: "+3253731711", country: "BE" },
    { name: "Remontowa Shiprepair Yard S.A.", nip: "5830003993", contact: "Janusz Kruk", email: "j.kruk@remontowa.pl", phone: "+48583073333", country: "PL" },
    { name: "Energomontaż Północ S.A.", nip: "5830004721", contact: "Marek Zając", email: "m.zajac@energo.pl", phone: "+48581234567", country: "PL" },
    { name: "PGNiG Termika S.A.", nip: "5260205055", contact: "Katarzyna Nowak", email: "k.nowak@pgnig.pl", phone: "+48226789012", country: "PL" },
    { name: "Allseas Engineering B.V.", nip: "NL006987654B01", contact: "Willem Bakker", email: "w.bakker@allseas.com", phone: "+31102661000", country: "NL" },
  ];
  const companyIds: string[] = [];
  for (const c of companies) {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO crm_companies (tenant_id, company_name, nip, contact_name, contact_email, contact_phone, country)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [tenantId, c.name, c.nip, c.contact, c.email, c.phone, c.country]
    );
    companyIds.push(row!.id);
  }
  console.log("[seed-full] Inserted 8 CRM companies (NL/BE/PL).");

  // ═══════════════════════════════════════════════════════════════════
  // CRM DEALS — cross-border posting contracts
  // ═══════════════════════════════════════════════════════════════════
  const dealData = [
    { ci: 0, name: "Heerema Rotterdam Pipe Welding Q2", stage: "Active", value: 24000, workers: 5, role: "TIG Welder" },
    { ci: 1, name: "Damen Shipyard Welding Team", stage: "Active", value: 18000, workers: 4, role: "MIG Welder" },
    { ci: 2, name: "BESIX Antwerp Port Expansion", stage: "Negotiation", value: 32000, workers: 8, role: "Scaffolder" },
    { ci: 3, name: "Jan De Nul Offshore Wind Farm", stage: "Proposal Sent", value: 45000, workers: 10, role: "TIG Welder" },
    { ci: 4, name: "Remontowa Gdansk Ship Repair", stage: "Active", value: 15000, workers: 6, role: "MAG Welder" },
    { ci: 5, name: "Energomontaż Power Plant Overhaul", stage: "Active", value: 12000, workers: 3, role: "Electrician" },
    { ci: 6, name: "PGNiG Warsaw Heating Network", stage: "Contacted", value: 8000, workers: 2, role: "Fabricator" },
    { ci: 7, name: "Allseas Deep Sea Pipeline 2026", stage: "Lead", value: 60000, workers: 15, role: "TIG Welder" },
  ];
  for (const d of dealData) {
    await execute(
      `INSERT INTO crm_deals (tenant_id, company_id, deal_name, stage, value_eur, workers_needed, role_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, companyIds[d.ci], d.name, d.stage, d.value, d.workers, d.role]
    );
  }
  console.log("[seed-full] Inserted CRM deals.");

  // ═══════════════════════════════════════════════════════════════════
  // INVOICES — 3 months
  // ═══════════════════════════════════════════════════════════════════
  const months = ["2026-01", "2026-02", "2026-03"];
  const invStatuses = ["paid", "sent", "draft"];
  for (let m = 0; m < months.length; m++) {
    for (let c = 0; c < 3; c++) {
      const net = 5000 + c * 3000 + m * 2000;
      const vat = Math.round(net * 0.23 * 100) / 100;
      await execute(
        `INSERT INTO invoices (invoice_number, client_id, client_name, month_year, subtotal, vat_rate, vat_amount, total, amount_net, amount_gross, issue_date, due_date, status, tenant_id)
         VALUES ($1,$2,$3,$4,$5,23,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [`INV-2026-${String(m * 3 + c + 1).padStart(3, "0")}`, companyIds[c], companies[c].name, months[m], net, vat, net + vat, net, net + vat,
         `2026-${String(m + 1).padStart(2, "0")}-01`, `2026-${String(m + 1).padStart(2, "0")}-15`, invStatuses[m], tenantId]
      );
    }
  }
  console.log("[seed-full] Inserted invoices.");

  // ═══════════════════════════════════════════════════════════════════
  // ZUS FILINGS
  // ═══════════════════════════════════════════════════════════════════
  for (let m = 10; m <= 12; m++) {
    await execute(`INSERT INTO zus_filings (tenant_id, month, year, status, generated_at, submitted_at, worker_count, total_contributions) VALUES ($1,$2,2025,$3,NOW(),NOW(),$4,$5) ON CONFLICT DO NOTHING`,
      [tenantId, m, "submitted", 20 + m, 15000 + m * 500]);
  }
  for (let m = 1; m <= 3; m++) {
    await execute(`INSERT INTO zus_filings (tenant_id, month, year, status, generated_at, worker_count, total_contributions) VALUES ($1,$2,2026,$3,NOW(),$4,$5) ON CONFLICT DO NOTHING`,
      [tenantId, m, m <= 2 ? "submitted" : "generated", 22 + m, 16000 + m * 600]);
  }
  console.log("[seed-full] Inserted ZUS filings.");

  // ═══════════════════════════════════════════════════════════════════
  // MOOD, VOICE CHECKINS, ADVANCES, BENCH, TRUST, CHURN, FINES, JOBS
  // ═══════════════════════════════════════════════════════════════════
  const now = new Date();

  // Mood — 8 weeks for 15 workers
  for (let w = 0; w < 15; w++) {
    for (let week = 0; week < 8; week++) {
      const weekNum = getWeekNumber(new Date(now.getTime() - week * 7 * 86_400_000));
      const baseScore = w < 3 ? 4 : w < 6 ? 3 : w < 10 ? 2 + (week % 3) : 4 + (week % 2);
      await execute(`INSERT INTO mood_entries (tenant_id, worker_id, worker_name, score, site, week_number, year) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [tenantId, workerIds[w], workers[w].name, Math.max(1, Math.min(5, baseScore)), workers[w].site, weekNum, now.getFullYear()]);
    }
  }

  // Voice checkins — 30 weekdays for 10 workers
  for (let d = 0; d < 30; d++) {
    for (let w = 0; w < 10; w++) {
      if (d % 7 >= 5) continue;
      const ts = new Date(now.getTime() - d * 86_400_000); ts.setHours(7 + w % 3, 0, 0, 0);
      await execute(`INSERT INTO voice_checkins (tenant_id, worker_id, worker_name, phone_number, checkin_type, site, timestamp, status) VALUES ($1,$2,$3,$4,'check_in',$5,$6,'recorded')`,
        [tenantId, workerIds[w], workers[w].name, workers[w].phone, workers[w].site, ts.toISOString()]);
      const tsOut = new Date(ts.getTime() + 9 * 3600000);
      await execute(`INSERT INTO voice_checkins (tenant_id, worker_id, worker_name, phone_number, checkin_type, site, timestamp, status) VALUES ($1,$2,$3,$4,'check_out',$5,$6,'recorded')`,
        [tenantId, workerIds[w], workers[w].name, workers[w].phone, workers[w].site, tsOut.toISOString()]);
    }
  }

  // Salary advances
  for (let i = 0; i < 5; i++) {
    await execute(`INSERT INTO salary_advances (tenant_id, worker_id, worker_name, amount_requested, reason, status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, workerIds[i + 5], workers[i + 5].name, 500 + i * 200, ["Rent payment", "Medical bill", "Family emergency", "Car repair", "Remittance home"][i], ["pending", "approved", "rejected", "approved", "pending"][i]]);
  }

  // Bench — 5 workers
  for (let i = 0; i < 5; i++) {
    await execute(`INSERT INTO bench_entries (tenant_id, worker_id, worker_name, available_from, last_site, last_role, skills_summary, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'available')`,
      [tenantId, workerIds[20 + i], workers[20 + i].name, new Date(Date.now() - (2 + i * 3) * 86_400_000).toISOString().slice(0, 10), workers[20 + i].site, workers[20 + i].spec, `${workers[20 + i].spec}, EN ISO 9606, Posted Worker experience`]);
  }

  // Trust scores
  for (let i = 0; i < workerIds.length; i++) {
    const score = i < 5 ? 90 + (i % 5) : i < 10 ? 75 + (i % 10) : i < 18 ? 55 + (i % 15) : 35 + (i % 10);
    await execute(`INSERT INTO trust_scores (tenant_id, worker_id, worker_name, score, breakdown, version) VALUES ($1,$2,$3,$4,$5,1)`,
      [tenantId, workerIds[i], workers[i].name, score, JSON.stringify({
        compliance: { score: Math.min(25, Math.round(score * 0.25)), max: 25, details: "Document status" },
        attendance: { score: Math.min(20, Math.round(score * 0.2)), max: 20, details: "30-day check-ins" },
        mood: { score: Math.min(10, Math.round(score * 0.1)), max: 10, details: "60-day mood avg" },
        contracts: { score: Math.min(20, Math.round(score * 0.2)), max: 20, details: "Contract completion" },
        onboarding: { score: Math.min(10, Math.round(score * 0.1)), max: 10, details: "Checklist" },
        payroll: { score: Math.min(15, Math.round(score * 0.15)), max: 15, details: "Payroll history" },
      })]);
  }

  // Churn predictions
  const churnData = [
    { idx: 3, prob: 85, level: "critical", action: "Urgent: Schedule meeting. Contract ending, no renewal.", signals: [{ signal: "mood_declining", weight: 20, detail: "Mood declining 3 weeks: 4 → 3 → 2" }, { signal: "contract_ending", weight: 20, detail: "Contract ends in 12 days" }, { signal: "no_checkins", weight: 15, detail: "No check-in for 5 days" }] },
    { idx: 7, prob: 75, level: "critical", action: "Urgent: TRC expired. Review posting status in Belgium.", signals: [{ signal: "mood_low", weight: 25, detail: "Mood ≤2 for 3 weeks" }, { signal: "bench_time", weight: 15, detail: "On bench 10 days" }] },
    { idx: 11, prob: 55, level: "high", action: "Check-in with coordinator in Lithuania.", signals: [{ signal: "mood_declining", weight: 20, detail: "Mood declining" }, { signal: "advances_increasing", weight: 10, detail: "3 advances in 60 days" }] },
    { idx: 14, prob: 50, level: "high", action: "Review Belgian posting renewal.", signals: [{ signal: "contract_ending", weight: 20, detail: "Contract ends in 25 days" }, { signal: "trust_dropping", weight: 15, detail: "Trust dropped 75→60" }] },
    { idx: 17, prob: 45, level: "high", action: "Monitor attendance in Lithuania.", signals: [{ signal: "no_checkins", weight: 15, detail: "No check-in 4 days" }, { signal: "mood_declining", weight: 20, detail: "Mood declining" }] },
  ];
  for (const c of churnData) {
    await execute(`INSERT INTO churn_predictions (tenant_id, worker_id, worker_name, churn_probability, risk_level, signals, recommended_action, predicted_leave_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, workerIds[c.idx], workers[c.idx].name, c.prob, c.level, JSON.stringify(c.signals), c.action, new Date(Date.now() + (c.level === "critical" ? 14 : 30) * 86_400_000).toISOString().slice(0, 10)]);
  }

  // Fine predictions
  const fineData = [
    { idx: 1, type: "expired_permit", desc: "Belgian Single Permit expired 10 days ago — PIP fine risk", min: 3000, max: 30000, prob: 95, priority: "critical" },
    { idx: 3, type: "bhp_expired", desc: "BHP certificate expires in 5 days — site safety violation", min: 2000, max: 10000, prob: 80, priority: "critical" },
    { idx: 7, type: "expired_permit", desc: "Polish TRC expired — worker cannot legally work", min: 3000, max: 30000, prob: 95, priority: "critical" },
    { idx: 5, type: "medical_expired", desc: "Medical exam expires in 20 days", min: 1000, max: 5000, prob: 50, priority: "high" },
    { idx: 9, type: "contract_missing", desc: "Posted worker contract ends in 15 days — A1 renewal needed", min: 1000, max: 30000, prob: 60, priority: "high" },
    { idx: 14, type: "bhp_expired", desc: "BHP expires in 45 days — schedule renewal", min: 2000, max: 10000, prob: 25, priority: "medium" },
  ];
  for (const f of fineData) {
    await execute(`INSERT INTO fine_predictions (tenant_id, worker_id, worker_name, risk_type, risk_description, predicted_fine_min, predicted_fine_max, probability, priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, workerIds[f.idx], workers[f.idx].name, f.type, f.desc, f.min, f.max, f.prob, f.priority]);
  }

  // Job requests + matches
  const jobData = [
    { ci: 0, name: "Heerema Rotterdam — 5 TIG Welders", role: "TIG Welder", loc: "Rotterdam Europoort, NL", workers: 5 },
    { ci: 2, name: "BESIX Antwerp — Scaffolding Team", role: "Scaffolder", loc: "Antwerp Port, BE", workers: 4 },
    { ci: 4, name: "Remontowa Gdansk — Ship Repair Welders", role: "MAG Welder", loc: "Gdansk Shipyard, PL", workers: 3 },
  ];
  for (let i = 0; i < jobData.length; i++) {
    const jr = await queryOne<{ id: string }>(`INSERT INTO job_requests (tenant_id, company_id, company_name, role_type, skills_required, location, workers_needed, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tenantId, companyIds[jobData[i].ci], companies[jobData[i].ci].name, jobData[i].role, "EN ISO 9606, BHP, A1 Certificate", jobData[i].loc, jobData[i].workers, i === 0 ? "matched" : "open"]);
    if (i === 0) {
      for (let m = 0; m < 3; m++) {
        await execute(`INSERT INTO worker_matches (job_request_id, worker_id, worker_name, match_score, match_reasons, status) VALUES ($1,$2,$3,$4,$5,'suggested')`,
          [jr!.id, workerIds[m], workers[m].name, 85 - m * 10, JSON.stringify(["Specialization match: TIG Welder", "Has A1 certificate for NL", "GREEN compliance", "Posted Worker experience"])]);
      }
    }
  }

  console.log("[seed-full] ✅ Comprehensive seed complete — all tables populated.");
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}
