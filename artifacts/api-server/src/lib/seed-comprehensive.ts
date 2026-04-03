import { query, queryOne, execute } from "./db.js";
import { getDefaultTenantId } from "./tenant.js";

export async function seedComprehensiveData(): Promise<void> {
  const tenantId = getDefaultTenantId();
  if (!tenantId) { console.log("[seed-full] No tenant ID — skipping."); return; }

  // Check if already seeded (25+ workers)
  const existing = await query<{ count: string }>("SELECT COUNT(*) AS count FROM workers WHERE tenant_id = $1", [tenantId]);
  if (parseInt(existing[0]?.count ?? "0") >= 25) {
    console.log("[seed-full] Already has 25+ workers — skipping comprehensive seed.");
    return;
  }

  console.log("[seed-full] Seeding comprehensive dummy data…");

  // ═══════════════════════════════════════════════════════════════════
  // 25 WORKERS
  // ═══════════════════════════════════════════════════════════════════
  const workers = [
    { name: "Krzysztof Nowak", spec: "TIG Welder", site: "Dublin Docklands", phone: "+48501001001", email: "k.nowak@apatris.pl", pesel: "92031501234", iban: "PL61109010140000071219812874", rate: 31.40, hours: 160, trc: "2026-11-15", passport: "2028-06-01", bhp: "2026-08-01", wp: "2026-11-15", contract: "2027-03-31", medical: "2026-09-01" },
    { name: "Oleksandr Kovalenko", spec: "MIG Welder", site: "Dublin Docklands", phone: "+48501001002", email: "o.kovalenko@apatris.pl", pesel: "89052312345", iban: "PL27114020040000300201355387", rate: 29.50, hours: 160, trc: "2026-04-20", passport: "2027-09-10", bhp: "2026-05-15", wp: "2026-04-20", contract: "2026-08-31", medical: "2026-06-20" },
    { name: "Piotr Wiśniewski", spec: "Electrician", site: "Cork Harbour", phone: "+48501001003", email: "p.wisniewski@apatris.pl", pesel: "95081601234", iban: "PL83102019190000910201568234", rate: 33.00, hours: 168, trc: "2027-02-10", passport: "2029-01-15", bhp: "2026-12-01", wp: "2027-02-10", contract: "2027-06-30", medical: "2027-01-15" },
    { name: "Dmytro Shevchenko", spec: "TIG Welder", site: "Cork Harbour", phone: "+48501001004", email: "d.shevchenko@apatris.pl", pesel: "91011501234", iban: "PL49116022020000000348912564", rate: 31.40, hours: 160, trc: "2026-03-10", passport: "2027-07-20", bhp: "2026-02-28", wp: "2026-03-10", contract: "2026-06-30", medical: "2026-04-15" },
    { name: "Andrzej Zieliński", spec: "Scaffolder", site: "Galway Industrial", phone: "+48501001005", email: "a.zielinski@apatris.pl", pesel: "87042201234", iban: "PL53105014461000002262463217", rate: 28.00, hours: 176, trc: "2026-09-20", passport: "2028-11-05", bhp: "2026-07-10", wp: "2026-09-20", contract: "2026-12-31", medical: "2026-08-25" },
    { name: "Ion Popescu", spec: "MIG Welder", site: "Galway Industrial", phone: "+48501001006", email: "i.popescu@apatris.pl", pesel: "93061801234", iban: "PL09109024020000000661390122", rate: 30.00, hours: 160, trc: "2026-06-15", passport: "2028-03-20", bhp: "2026-05-01", wp: "2026-06-15", contract: "2026-10-31", medical: "2026-07-10" },
    { name: "Vasile Dumitru", spec: "Forklift Operator", site: "Warsaw Central", phone: "+48501001007", email: "v.dumitru@apatris.pl", pesel: "90020301234", iban: "PL67105015511000009082450124", rate: 26.00, hours: 168, trc: "2026-08-01", passport: "2028-05-12", bhp: "2026-06-20", wp: "2026-08-01", contract: "2026-11-30", medical: "2026-09-15" },
    { name: "Serhii Bondarenko", spec: "MAG Welder", site: "Warsaw Central", phone: "+48501001008", email: "s.bondarenko@apatris.pl", pesel: "88090701234", iban: "PL94124060681111001049709858", rate: 31.40, hours: 160, trc: "2026-01-20", passport: "2027-04-15", bhp: "2026-01-10", wp: "2026-01-20", contract: "2026-05-31", medical: "2026-03-01" },
    { name: "Tomasz Kowalczyk", spec: "Electrician", site: "Gdansk Port", phone: "+48501001009", email: "t.kowalczyk@apatris.pl", pesel: "94070201234", iban: "PL15109024020000000611203544", rate: 34.00, hours: 160, trc: "2027-01-15", passport: "2029-06-30", bhp: "2027-03-01", wp: "2027-01-15", contract: "2027-09-30", medical: "2027-02-20" },
    { name: "Viktor Marchenko", spec: "TIG Welder", site: "Gdansk Port", phone: "+48501001010", email: "v.marchenko@apatris.pl", pesel: "96031201234", iban: "PL78116022020000000289045678", rate: 31.40, hours: 160, trc: "2026-05-10", passport: "2028-02-28", bhp: "2026-04-15", wp: "2026-05-10", contract: "2026-09-30", medical: "2026-06-01" },
    { name: "Marek Jabłoński", spec: "Scaffolder", site: "Dublin Docklands", phone: "+48501001011", email: "m.jablonski@apatris.pl", pesel: "85112301234", iban: "PL42102019190000910201999887", rate: 28.50, hours: 176, trc: "2026-10-05", passport: "2028-08-15", bhp: "2026-07-20", wp: "2026-10-05", contract: "2027-01-31", medical: "2026-11-01" },
    { name: "Oleh Tkachenko", spec: "MMA Welder", site: "Cork Harbour", phone: "+48501001012", email: "o.tkachenko@apatris.pl", pesel: "97050401234", iban: "PL56109010140000071248965412", rate: 30.50, hours: 160, trc: "2026-04-05", passport: "2027-10-20", bhp: "2026-03-20", wp: "2026-04-05", contract: "2026-07-31", medical: "2026-05-10" },
    { name: "Marian Constantinescu", spec: "Forklift Operator", site: "Galway Industrial", phone: "+48501001013", email: "m.constantinescu@apatris.pl", pesel: "86080101234", iban: "PL33105014461000002288456321", rate: 27.00, hours: 168, trc: "2026-07-20", passport: "2028-04-10", bhp: "2026-06-15", wp: "2026-07-20", contract: "2026-11-15", medical: "2026-08-01" },
    { name: "Jakub Szymański", spec: "Fabricator", site: "Warsaw Central", phone: "+48501001014", email: "j.szymanski@apatris.pl", pesel: "91120501234", iban: "PL88124060681111001098765432", rate: 32.00, hours: 160, trc: "2026-12-15", passport: "2029-03-20", bhp: "2026-11-01", wp: "2026-12-15", contract: "2027-04-30", medical: "2026-12-01" },
    { name: "Ihor Lysenko", spec: "TIG Welder", site: "Gdansk Port", phone: "+48501001015", email: "i.lysenko@apatris.pl", pesel: "89030201234", iban: "PL71116022020000000312457890", rate: 31.40, hours: 160, trc: "2026-02-15", passport: "2027-08-05", bhp: "2026-02-01", wp: "2026-02-15", contract: "2026-06-15", medical: "2026-03-20" },
    { name: "Adrian Radu", spec: "Scaffolder", site: "Dublin Docklands", phone: "+48501001016", email: "a.radu@apatris.pl", pesel: "92091001234", iban: "PL19109024020000000755123987", rate: 29.00, hours: 176, trc: "2026-08-25", passport: "2028-07-15", bhp: "2026-07-01", wp: "2026-08-25", contract: "2026-12-15", medical: "2026-09-10" },
    { name: "Grzegorz Dąbrowski", spec: "Electrician", site: "Cork Harbour", phone: "+48501001017", email: "g.dabrowski@apatris.pl", pesel: "90040801234", iban: "PL62102019190000910201678543", rate: 33.50, hours: 168, trc: "2026-11-20", passport: "2028-12-10", bhp: "2026-10-15", wp: "2026-11-20", contract: "2027-05-31", medical: "2026-12-20" },
    { name: "Mykola Sydorenko", spec: "MAG Welder", site: "Galway Industrial", phone: "+48501001018", email: "m.sydorenko@apatris.pl", pesel: "95022801234", iban: "PL45109010140000071267894561", rate: 30.00, hours: 160, trc: "2026-05-25", passport: "2028-01-20", bhp: "2026-04-10", wp: "2026-05-25", contract: "2026-09-15", medical: "2026-06-30" },
    { name: "Bogdan Lazarescu", spec: "Forklift Operator", site: "Warsaw Central", phone: "+48501001019", email: "b.lazarescu@apatris.pl", pesel: "88060301234", iban: "PL37105015511000009099887766", rate: 26.50, hours: 168, trc: "2026-07-10", passport: "2028-06-25", bhp: "2026-06-05", wp: "2026-07-10", contract: "2026-10-31", medical: "2026-08-15" },
    { name: "Łukasz Kamiński", spec: "TIG Welder", site: "Gdansk Port", phone: "+48501001020", email: "l.kaminski@apatris.pl", pesel: "93100101234", iban: "PL84116022020000000345678901", rate: 31.40, hours: 160, trc: "2027-03-01", passport: "2029-08-15", bhp: "2027-01-20", wp: "2027-03-01", contract: "2027-07-31", medical: "2027-02-15" },
    { name: "Petro Kravchuk", spec: "MIG Welder", site: "Dublin Docklands", phone: "+48501001021", email: "p.kravchuk@apatris.pl", pesel: "91071501234", iban: "PL29109024020000000822345678", rate: 30.00, hours: 160, trc: "2026-04-30", passport: "2027-12-01", bhp: "2026-03-25", wp: "2026-04-30", contract: "2026-08-15", medical: "2026-05-20" },
    { name: "Marcin Lewandowski", spec: "Scaffolder", site: "Cork Harbour", phone: "+48501001022", email: "m.lewandowski@apatris.pl", pesel: "87112201234", iban: "PL51102019190000910201445566", rate: 28.00, hours: 176, trc: "2026-09-10", passport: "2028-10-20", bhp: "2026-08-15", wp: "2026-09-10", contract: "2027-02-28", medical: "2026-10-01" },
    { name: "Gheorghe Marinescu", spec: "Electrician", site: "Galway Industrial", phone: "+48501001023", email: "g.marinescu@apatris.pl", pesel: "94030501234", iban: "PL73105014461000002233445566", rate: 32.50, hours: 168, trc: "2026-06-20", passport: "2028-09-05", bhp: "2026-05-10", wp: "2026-06-20", contract: "2026-10-15", medical: "2026-07-25" },
    { name: "Artem Savchenko", spec: "Fabricator", site: "Warsaw Central", phone: "+48501001024", email: "a.savchenko@apatris.pl", pesel: "96081001234", iban: "PL16124060681111001055667788", rate: 31.00, hours: 160, trc: "2026-03-20", passport: "2027-11-10", bhp: "2026-02-15", wp: "2026-03-20", contract: "2026-07-15", medical: "2026-04-20" },
    { name: "Robert Wójcik", spec: "MMA Welder", site: "Gdansk Port", phone: "+48501001025", email: "r.wojcik@apatris.pl", pesel: "90050701234", iban: "PL92116022020000000478901234", rate: 30.50, hours: 160, trc: "2026-10-25", passport: "2029-02-10", bhp: "2026-09-20", wp: "2026-10-25", contract: "2027-01-15", medical: "2026-11-10" },
  ];

  // Delete existing workers for this tenant before re-seeding
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
  // IMMIGRATION PERMITS
  // ═══════════════════════════════════════════════════════════════════
  const permitTypes = ["TRC", "Work Permit", "Visa", "A1", "Passport"];
  for (let i = 0; i < workerIds.length; i++) {
    const w = workers[i];
    const type = permitTypes[i % permitTypes.length];
    const daysOffset = i < 5 ? -10 + i * 20 : i < 10 ? 15 + i * 5 : 40 + i * 3;
    const expiry = new Date(Date.now() + daysOffset * 86_400_000).toISOString().slice(0, 10);
    const trcSubmitted = i === 3 || i === 7;
    await execute(
      `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status, trc_application_submitted)
       VALUES ($1,$2,$3,$4,'PL',$5,$6,$7,$8)`,
      [tenantId, workerIds[i], w.name, type, new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10), expiry, daysOffset < 0 ? "expired" : "active", trcSubmitted]
    );
  }
  console.log("[seed-full] Inserted immigration permits.");

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
  // CRM COMPANIES
  // ═══════════════════════════════════════════════════════════════════
  const companies = [
    { name: "Siemens Gamesa Sp. z o.o.", nip: "5213654789", contact: "Anna Müller", email: "anna.muller@siemens.com", phone: "+48221234567", country: "PL" },
    { name: "Stena Line Ireland Ltd", nip: "IE12345678", contact: "Seán O'Brien", email: "sean.obrien@stenaline.ie", phone: "+353214567890", country: "IE" },
    { name: "Energomontaż Północ S.A.", nip: "5851234567", contact: "Marek Zając", email: "m.zajac@energo.pl", phone: "+48581234567", country: "PL" },
    { name: "BAM Contractors Ireland", nip: "IE87654321", contact: "Patrick Walsh", email: "p.walsh@bam.ie", phone: "+353912345678", country: "IE" },
    { name: "Remontowa Shiprepair Yard", nip: "5832345678", contact: "Janusz Kruk", email: "j.kruk@remontowa.pl", phone: "+48583456789", country: "PL" },
    { name: "John Sisk & Son Ltd", nip: "IE55667788", contact: "Ciarán Murphy", email: "c.murphy@sisk.ie", phone: "+353851234567", country: "IE" },
    { name: "PGNiG Termika S.A.", nip: "5260205055", contact: "Katarzyna Nowak", email: "k.nowak@pgnig.pl", phone: "+48226789012", country: "PL" },
    { name: "Mercury Engineering", nip: "IE99887766", contact: "Liam Kelly", email: "l.kelly@mercury.ie", phone: "+353617890123", country: "IE" },
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
  console.log("[seed-full] Inserted 8 CRM companies.");

  // ═══════════════════════════════════════════════════════════════════
  // CRM DEALS
  // ═══════════════════════════════════════════════════════════════════
  const stages = ["Lead", "Contacted", "Proposal Sent", "Negotiation", "Active", "Active"];
  for (let i = 0; i < companyIds.length; i++) {
    await execute(
      `INSERT INTO crm_deals (tenant_id, company_id, deal_name, stage, value_eur, workers_needed, role_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, companyIds[i], `${companies[i].name.split(" ")[0]} Q2 Contract`, stages[i % stages.length], 5000 + i * 3000, 2 + i % 5, workers[i * 3 % workers.length].spec]
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
      const net = 3000 + c * 2000 + m * 1000;
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
  // ZUS FILINGS — 6 months
  // ═══════════════════════════════════════════════════════════════════
  for (let m = 10; m <= 12; m++) {
    await execute(
      `INSERT INTO zus_filings (tenant_id, month, year, status, generated_at, submitted_at, worker_count, total_contributions)
       VALUES ($1,$2,2025,$3,NOW(),NOW(),$4,$5) ON CONFLICT DO NOTHING`,
      [tenantId, m, "submitted", 20 + m, 15000 + m * 500]
    );
  }
  for (let m = 1; m <= 3; m++) {
    await execute(
      `INSERT INTO zus_filings (tenant_id, month, year, status, generated_at, worker_count, total_contributions)
       VALUES ($1,$2,2026,$3,NOW(),$4,$5) ON CONFLICT DO NOTHING`,
      [tenantId, m, m <= 2 ? "submitted" : "generated", 22 + m, 16000 + m * 600]
    );
  }
  console.log("[seed-full] Inserted ZUS filings.");

  // ═══════════════════════════════════════════════════════════════════
  // MOOD ENTRIES — 8 weeks for first 15 workers
  // ═══════════════════════════════════════════════════════════════════
  const now = new Date();
  for (let w = 0; w < 15; w++) {
    for (let week = 0; week < 8; week++) {
      const weekNum = getWeekNumber(new Date(now.getTime() - week * 7 * 86_400_000));
      const baseScore = w < 3 ? 4 : w < 6 ? 3 : w < 10 ? 2 + (week % 3) : 4 + (week % 2);
      const score = Math.max(1, Math.min(5, baseScore));
      await execute(
        `INSERT INTO mood_entries (tenant_id, worker_id, worker_name, score, site, week_number, year)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [tenantId, workerIds[w], workers[w].name, score, workers[w].site, weekNum, now.getFullYear()]
      );
    }
  }
  console.log("[seed-full] Inserted mood entries.");

  // ═══════════════════════════════════════════════════════════════════
  // VOICE CHECKINS — 30 days
  // ═══════════════════════════════════════════════════════════════════
  for (let d = 0; d < 30; d++) {
    for (let w = 0; w < 10; w++) {
      if (d % 7 >= 5) continue; // skip weekends
      const ts = new Date(now.getTime() - d * 86_400_000);
      ts.setHours(7 + w % 3, 0, 0, 0);
      await execute(
        `INSERT INTO voice_checkins (tenant_id, worker_id, worker_name, phone_number, checkin_type, site, timestamp, status)
         VALUES ($1,$2,$3,$4,'check_in',$5,$6,'recorded')`,
        [tenantId, workerIds[w], workers[w].name, workers[w].phone, workers[w].site, ts.toISOString()]
      );
      const tsOut = new Date(ts.getTime() + 9 * 3600000);
      await execute(
        `INSERT INTO voice_checkins (tenant_id, worker_id, worker_name, phone_number, checkin_type, site, timestamp, status)
         VALUES ($1,$2,$3,$4,'check_out',$5,$6,'recorded')`,
        [tenantId, workerIds[w], workers[w].name, workers[w].phone, workers[w].site, tsOut.toISOString()]
      );
    }
  }
  console.log("[seed-full] Inserted voice checkins.");

  // ═══════════════════════════════════════════════════════════════════
  // SALARY ADVANCES
  // ═══════════════════════════════════════════════════════════════════
  const advStatuses = ["pending", "approved", "rejected", "approved", "pending"];
  for (let i = 0; i < 5; i++) {
    await execute(
      `INSERT INTO salary_advances (tenant_id, worker_id, worker_name, amount_requested, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, workerIds[i + 5], workers[i + 5].name, 500 + i * 200, ["Rent payment", "Medical bill", "Family emergency", "Car repair", "Holiday expenses"][i], advStatuses[i]]
    );
  }
  console.log("[seed-full] Inserted salary advances.");

  // ═══════════════════════════════════════════════════════════════════
  // BENCH ENTRIES — 5 workers
  // ═══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 5; i++) {
    const daysAgo = 2 + i * 3;
    await execute(
      `INSERT INTO bench_entries (tenant_id, worker_id, worker_name, available_from, last_site, last_role, skills_summary, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'available')`,
      [tenantId, workerIds[20 + i], workers[20 + i].name, new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10), workers[20 + i].site, workers[20 + i].spec, `${workers[20 + i].spec}, EN ISO 9606 certified`]
    );
  }
  console.log("[seed-full] Inserted bench entries.");

  // ═══════════════════════════════════════════════════════════════════
  // TRUST SCORES
  // ═══════════════════════════════════════════════════════════════════
  for (let i = 0; i < workerIds.length; i++) {
    const score = i < 5 ? 90 + (i % 5) : i < 10 ? 75 + (i % 10) : i < 18 ? 55 + (i % 15) : 35 + (i % 10);
    await execute(
      `INSERT INTO trust_scores (tenant_id, worker_id, worker_name, score, breakdown, version)
       VALUES ($1,$2,$3,$4,$5,1)`,
      [tenantId, workerIds[i], workers[i].name, score, JSON.stringify({
        compliance: { score: Math.min(25, Math.round(score * 0.25)), max: 25, details: "Based on document status" },
        attendance: { score: Math.min(20, Math.round(score * 0.2)), max: 20, details: "30-day check-in rate" },
        mood: { score: Math.min(10, Math.round(score * 0.1)), max: 10, details: "60-day mood average" },
        contracts: { score: Math.min(20, Math.round(score * 0.2)), max: 20, details: "Contract completion" },
        onboarding: { score: Math.min(10, Math.round(score * 0.1)), max: 10, details: "Checklist completion" },
        payroll: { score: Math.min(15, Math.round(score * 0.15)), max: 15, details: "Payroll history" },
      })]
    );
  }
  console.log("[seed-full] Inserted trust scores.");

  // ═══════════════════════════════════════════════════════════════════
  // CHURN PREDICTIONS — 3 high, 2 critical
  // ═══════════════════════════════════════════════════════════════════
  const churnWorkers = [
    { idx: 3, prob: 85, level: "critical", action: "Urgent: Schedule 1-on-1 meeting. Consider salary review.", signals: [{ signal: "mood_declining", weight: 20, detail: "Mood declining 3 weeks: 4 → 3 → 2" }, { signal: "contract_ending", weight: 20, detail: "Contract ends in 12 days" }, { signal: "no_checkins", weight: 15, detail: "No check-in for 5 days" }] },
    { idx: 7, prob: 75, level: "critical", action: "Urgent: Review contract renewal. Worker has expired TRC.", signals: [{ signal: "mood_low", weight: 25, detail: "Mood score ≤2 for 3 weeks" }, { signal: "bench_time", weight: 15, detail: "On bench for 10 days" }] },
    { idx: 11, prob: 55, level: "high", action: "Schedule check-in with coordinator.", signals: [{ signal: "mood_declining", weight: 20, detail: "Mood declining 3 weeks: 3 → 2 → 1" }, { signal: "advances_increasing", weight: 10, detail: "3 advance requests in 60 days" }] },
    { idx: 14, prob: 50, level: "high", action: "Review contract renewal and mood.", signals: [{ signal: "contract_ending", weight: 20, detail: "Contract ends in 25 days" }, { signal: "trust_dropping", weight: 15, detail: "Trust score dropped from 75 to 60" }] },
    { idx: 17, prob: 45, level: "high", action: "Monitor attendance and engagement.", signals: [{ signal: "no_checkins", weight: 15, detail: "No check-in for 4 days" }, { signal: "mood_declining", weight: 20, detail: "Mood declining 3 weeks" }] },
  ];
  for (const c of churnWorkers) {
    await execute(
      `INSERT INTO churn_predictions (tenant_id, worker_id, worker_name, churn_probability, risk_level, signals, recommended_action, predicted_leave_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, workerIds[c.idx], workers[c.idx].name, c.prob, c.level, JSON.stringify(c.signals), c.action,
       c.level === "critical" ? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)]
    );
  }
  console.log("[seed-full] Inserted churn predictions.");

  // ═══════════════════════════════════════════════════════════════════
  // FINE PREDICTIONS
  // ═══════════════════════════════════════════════════════════════════
  const fineRisks = [
    { idx: 1, type: "expired_permit", desc: "Work Permit expired 10 days ago", min: 3000, max: 30000, prob: 95, priority: "critical" },
    { idx: 3, type: "bhp_expired", desc: "BHP certificate expires in 5 days", min: 2000, max: 10000, prob: 80, priority: "critical" },
    { idx: 7, type: "expired_permit", desc: "TRC expired 20 days ago", min: 3000, max: 30000, prob: 95, priority: "critical" },
    { idx: 5, type: "medical_expired", desc: "Medical exam expires in 20 days", min: 1000, max: 5000, prob: 50, priority: "high" },
    { idx: 9, type: "contract_missing", desc: "Contract ends in 15 days", min: 1000, max: 30000, prob: 60, priority: "high" },
    { idx: 14, type: "bhp_expired", desc: "BHP certificate expires in 45 days", min: 2000, max: 10000, prob: 25, priority: "medium" },
  ];
  for (const f of fineRisks) {
    await execute(
      `INSERT INTO fine_predictions (tenant_id, worker_id, worker_name, risk_type, risk_description, predicted_fine_min, predicted_fine_max, probability, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [tenantId, workerIds[f.idx], workers[f.idx].name, f.type, f.desc, f.min, f.max, f.prob, f.priority]
    );
  }
  console.log("[seed-full] Inserted fine predictions.");

  // ═══════════════════════════════════════════════════════════════════
  // JOB REQUESTS + MATCHES
  // ═══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 3; i++) {
    const jr = await queryOne<{ id: string }>(
      `INSERT INTO job_requests (tenant_id, company_id, company_name, role_type, skills_required, location, workers_needed, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tenantId, companyIds[i], companies[i].name, ["TIG Welder", "Electrician", "Scaffolder"][i], "EN ISO 9606, BHP", ["Dublin Docklands", "Cork Harbour", "Galway Industrial"][i], 3, i === 0 ? "matched" : "open"]
    );
    if (i === 0) {
      for (let m = 0; m < 3; m++) {
        await execute(
          `INSERT INTO worker_matches (job_request_id, worker_id, worker_name, match_score, match_reasons, status)
           VALUES ($1,$2,$3,$4,$5,'suggested')`,
          [jr!.id, workerIds[m], workers[m].name, 85 - m * 10, JSON.stringify(["Specialization match", "Location match", "GREEN compliance"])]
        );
      }
    }
  }
  console.log("[seed-full] Inserted job requests and matches.");

  console.log("[seed-full] ✅ Comprehensive seed complete.");
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
}
