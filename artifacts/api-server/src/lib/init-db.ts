import { execute, query } from "./db.js";
import { setDefaultTenantId } from "./tenant.js";

export async function initializeDatabase(): Promise<void> {
  console.log("[init-db] Creating tables if they do not exist…");

  // tenants (must come first — other tables reference it)
  await execute(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#C41E1E',
      domain TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default "Apatris" tenant
  await execute(`
    INSERT INTO tenants (name, slug, primary_color)
    SELECT 'Apatris Sp. z o.o.', 'apatris', '#C41E1E'
    WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'apatris');
  `);

  // Cache the default tenant ID
  const tenantRows = await query<{ id: string }>(
    "SELECT id FROM tenants WHERE slug = 'apatris' LIMIT 1"
  );
  const defaultTenantId = tenantRows[0]?.id;
  if (defaultTenantId) {
    setDefaultTenantId(defaultTenantId);
    console.log(`[init-db] Default tenant ID: ${defaultTenantId}`);
  }

  // workers
  await execute(`
    CREATE TABLE IF NOT EXISTS workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      specialization TEXT DEFAULT '',
      experience TEXT,
      qualification TEXT,
      assigned_site TEXT,
      email TEXT,
      phone TEXT,
      trc_expiry DATE,
      passport_expiry DATE,
      bhp_expiry DATE,
      work_permit_expiry DATE,
      contract_end_date DATE,
      medical_exam_expiry DATE,
      udt_cert_expiry DATE,
      hourly_rate NUMERIC(8,2) DEFAULT 0,
      monthly_hours NUMERIC(6,1) DEFAULT 0,
      advance NUMERIC(8,2) DEFAULT 0,
      penalties NUMERIC(8,2) DEFAULT 0,
      iban TEXT,
      pesel TEXT,
      nip TEXT,
      pit2 BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='tenant_id') THEN
        ALTER TABLE workers ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_workers_tenant ON workers(tenant_id);
      END IF;
    END $$;
  `);

  // documents
  await execute(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      worker_name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      issue_date DATE,
      expiry_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='tenant_id') THEN
        ALTER TABLE documents ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
      END IF;
    END $$;
  `);

  // admins
  await execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Admin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admins' AND column_name='tenant_id') THEN
        ALTER TABLE admins ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_admins_tenant ON admins(tenant_id);
      END IF;
    END $$;
  `);

  // site_coordinators
  await execute(`
    CREATE TABLE IF NOT EXISTS site_coordinators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      assigned_site TEXT NOT NULL,
      alert_email TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='site_coordinators' AND column_name='tenant_id') THEN
        ALTER TABLE site_coordinators ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_site_coordinators_tenant ON site_coordinators(tenant_id);
      END IF;
    END $$;
  `);

  // compliance_snapshots
  await execute(`
    CREATE TABLE IF NOT EXISTS compliance_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      total INTEGER DEFAULT 0,
      compliant INTEGER DEFAULT 0,
      warning INTEGER DEFAULT 0,
      critical INTEGER DEFAULT 0,
      expired INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='compliance_snapshots' AND column_name='tenant_id') THEN
        ALTER TABLE compliance_snapshots ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_tenant ON compliance_snapshots(tenant_id);
      END IF;
    END $$;
  `);

  // Add tenant_id to tables created elsewhere
  // hours_log
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='hours_log') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hours_log' AND column_name='tenant_id') THEN
          ALTER TABLE hours_log ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_hours_log_tenant ON hours_log(tenant_id);
        END IF;
      END IF;
    END $$;
  `);

  // mobile_pins — create if not exists, then add tenant_id if missing
  await execute(`
    CREATE TABLE IF NOT EXISTS mobile_pins (
      tier      INTEGER NOT NULL,
      user_key  TEXT    NOT NULL,
      pin_hash  TEXT    NOT NULL,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tier, user_key)
    );
  `);
  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mobile_pins' AND column_name='tenant_id') THEN
        ALTER TABLE mobile_pins ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_mobile_pins_tenant ON mobile_pins(tenant_id);
      END IF;
    END $$;
  `);

  // payroll_commits
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_commits') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_commits' AND column_name='tenant_id') THEN
          ALTER TABLE payroll_commits ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_payroll_commits_tenant ON payroll_commits(tenant_id);
        END IF;
      END IF;
    END $$;
  `);

  // payroll_snapshots
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='payroll_snapshots') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_snapshots' AND column_name='tenant_id') THEN
          ALTER TABLE payroll_snapshots ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_tenant ON payroll_snapshots(tenant_id);
        END IF;
      END IF;
    END $$;
  `);

  // notification_log
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='notification_log') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notification_log' AND column_name='tenant_id') THEN
          ALTER TABLE notification_log ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_notification_log_tenant ON notification_log(tenant_id);
        END IF;
      END IF;
    END $$;
  `);

  // audit_logs
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='tenant_id') THEN
          ALTER TABLE audit_logs ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
        END IF;
      END IF;
    END $$;
  `);

  // refresh_tokens (for JWT refresh token rotation)
  await execute(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash TEXT NOT NULL UNIQUE,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      assigned_site TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );
  `);

  // Clean up expired refresh tokens older than 7 days
  await execute(`
    DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days';
  `);

  // GDPR consent records
  await execute(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT FALSE,
      granted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      ip_address TEXT,
      user_agent TEXT,
      version TEXT NOT NULL DEFAULT '1.0',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // GDPR data processing log (tracks access/export/deletion for audit)
  await execute(`
    CREATE TABLE IF NOT EXISTS gdpr_log (
      id SERIAL PRIMARY KEY,
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_name TEXT,
      performed_by TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // face_encodings (biometric face descriptors for face-login)
  await execute(`
    CREATE TABLE IF NOT EXISTS face_encodings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      descriptor FLOAT8[] NOT NULL,
      quality_score FLOAT8 DEFAULT 0,
      enrolled_at TIMESTAMPTZ DEFAULT NOW(),
      enrolled_by TEXT
    );
  `);

  // document_workflows (upload → review → approve/reject pipeline)
  await execute(`
    CREATE TABLE IF NOT EXISTS document_workflows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      document_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      expiry_date DATE,
      uploaded_by TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      reviewer_id TEXT,
      reviewer_name TEXT,
      reviewed_at TIMESTAMPTZ,
      review_comment TEXT,
      rejection_reason TEXT,
      version INTEGER DEFAULT 1,
      previous_version_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // contracts
  await execute(`
    CREATE TABLE IF NOT EXISTS contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      start_date DATE NOT NULL,
      end_date DATE,
      hourly_rate NUMERIC(8,2),
      monthly_salary NUMERIC(10,2),
      work_location TEXT,
      job_description TEXT,
      poa_id UUID,
      poa_name TEXT,
      language TEXT NOT NULL DEFAULT 'pl',
      pdf_path TEXT,
      signed_at TIMESTAMPTZ,
      signed_by_worker BOOLEAN DEFAULT FALSE,
      signed_by_company BOOLEAN DEFAULT FALSE,
      metadata JSONB DEFAULT '{}',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // power_of_attorney
  await execute(`
    CREATE TABLE IF NOT EXISTS power_of_attorney (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      position TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      pesel TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      can_sign_zlecenie BOOLEAN DEFAULT TRUE,
      can_sign_o_prace BOOLEAN DEFAULT TRUE,
      can_sign_b2b BOOLEAN DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // signatures
  await execute(`
    CREATE TABLE IF NOT EXISTS signatures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      signer_name TEXT NOT NULL,
      signer_role TEXT NOT NULL,
      signature_data TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      signed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // A1 certificates (proves home-country social security coverage for posted workers)
  await execute(`
    CREATE TABLE IF NOT EXISTS a1_certificates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      home_country TEXT NOT NULL DEFAULT 'PL',
      host_country TEXT NOT NULL,
      certificate_number TEXT,
      issued_by TEXT,
      valid_from DATE NOT NULL,
      valid_to DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Posting assignments (tracks where workers are posted and for how long)
  await execute(`
    CREATE TABLE IF NOT EXISTS posting_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      home_country TEXT NOT NULL DEFAULT 'PL',
      host_country TEXT NOT NULL,
      host_city TEXT,
      client_company TEXT,
      site_name TEXT,
      start_date DATE NOT NULL,
      end_date DATE,
      a1_certificate_id UUID REFERENCES a1_certificates(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Site geofences (circular boundary around a construction site)
  await execute(`
    CREATE TABLE IF NOT EXISTS site_geofences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      site_name TEXT NOT NULL,
      latitude FLOAT8 NOT NULL,
      longitude FLOAT8 NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 200,
      address TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // GPS check-in/check-out records
  await execute(`
    CREATE TABLE IF NOT EXISTS gps_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      site_geofence_id UUID REFERENCES site_geofences(id) ON DELETE SET NULL,
      site_name TEXT NOT NULL,
      check_in_lat FLOAT8 NOT NULL,
      check_in_lng FLOAT8 NOT NULL,
      check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_out_lat FLOAT8,
      check_out_lng FLOAT8,
      check_out_at TIMESTAMPTZ,
      duration_minutes INTEGER,
      is_anomaly BOOLEAN DEFAULT FALSE,
      anomaly_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Push notification subscriptions
  await execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT,
      keys_auth TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Client portal tokens (read-only access for end-clients)
  await execute(`
    CREATE TABLE IF NOT EXISTS client_portal_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      client_email TEXT,
      site_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add data_retention_days to tenants
  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='data_retention_days') THEN
        ALTER TABLE tenants ADD COLUMN data_retention_days INTEGER DEFAULT 2555;
      END IF;
    END $$;
  `);

  // Seed admins if the table is empty
  const rows = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM admins"
  );
  const adminCount = parseInt(rows[0]?.count ?? "0", 10);

  if (adminCount === 0) {
    console.log("[init-db] Seeding default admins…");
    await execute(
      "INSERT INTO admins (full_name, role) VALUES ($1, $2), ($3, $4)",
      ["Akshay Gandhi", "Admin", "Manish Suresh Shetty", "Admin"]
    );
  }

  // ── Seed demo workers if table is empty ────────────────────────────────
  const workerCount = parseInt(
    (await query<{ count: string }>("SELECT count(*)::text AS count FROM workers"))[0]?.count ?? "0", 10
  );

  if (workerCount < 6 && defaultTenantId) {
    console.log("[init-db] Seeding demo workers…");
    const workers = [
      {
        name: "Tomasz Kowalski",
        spec: "TIG",
        site: "Site A – Dublin Docklands",
        email: "t.kowalski@apatris.pl",
        phone: "+48 601 234 567",
        trc: "2026-08-15",
        passport: "2028-03-22",
        bhp: "2026-11-30",
        workPermit: "2027-01-10",
        contract: "2026-12-31",
        rate: 31.40,
        hours: 160,
        pesel: "85042312345",
        iban: "PL61 1090 1014 0000 0712 1981 2874",
      },
      {
        name: "Piotr Wiśniewski",
        spec: "MIG",
        site: "Site B – Cork Harbour",
        email: "p.wisniewski@apatris.pl",
        phone: "+48 602 345 678",
        trc: "2026-04-10",
        passport: "2029-07-14",
        bhp: "2026-05-20",
        workPermit: "2026-06-01",
        contract: "2026-09-30",
        rate: 31.40,
        hours: 160,
        pesel: "90071598765",
        iban: "PL27 1140 2004 0000 3002 0135 5387",
      },
      {
        name: "Krzysztof Nowak",
        spec: "MAG",
        site: "Site A – Dublin Docklands",
        email: "k.nowak@apatris.pl",
        phone: "+48 603 456 789",
        trc: "2026-12-01",
        passport: "2030-01-05",
        bhp: "2027-03-15",
        workPermit: "2027-06-30",
        contract: "2027-03-31",
        rate: 31.40,
        hours: 160,
        pesel: "88110254321",
        iban: "PL10 1050 0099 7200 9000 0096 4177",
      },
      {
        name: "Andrzej Zieliński",
        spec: "FABRICATOR",
        site: "Site C – Galway Industrial",
        email: "a.zielinski@apatris.pl",
        phone: "+48 604 567 890",
        trc: "2026-02-28",
        passport: "2027-11-20",
        bhp: "2025-12-15",
        workPermit: "2026-04-15",
        contract: "2026-06-30",
        rate: 31.40,
        hours: 160,
        pesel: "92030187654",
        iban: "PL83 1020 1026 0000 0702 0178 9154",
      },
      {
        name: "Marek Lewandowski",
        spec: "ARC",
        site: "Site B – Cork Harbour",
        email: "m.lewandowski@apatris.pl",
        phone: "+48 605 678 901",
        trc: "2027-05-20",
        passport: "2031-02-10",
        bhp: "2027-08-01",
        workPermit: "2027-09-30",
        contract: "2027-06-30",
        rate: 31.40,
        hours: 160,
        pesel: "87052043210",
        iban: "PL65 1160 2202 0000 0002 1786 3249",
      },
      {
        name: "Szymon Kamiński",
        spec: "MMA",
        site: "Site C – Galway Industrial",
        email: "s.kaminski@apatris.pl",
        phone: "+48 606 789 012",
        trc: "2026-06-10",
        passport: "2028-09-30",
        bhp: "2026-07-25",
        workPermit: null,
        contract: "2026-10-31",
        rate: 31.40,
        hours: 160,
        pesel: "95081276543",
        iban: "PL51 1240 6960 1111 0010 4351 4920",
      },
    ];

    for (const w of workers) {
      await execute(
        `INSERT INTO workers (tenant_id, full_name, specialization, assigned_site, email, phone,
          trc_expiry, passport_expiry, bhp_expiry, work_permit_expiry, contract_end_date,
          hourly_rate, monthly_hours, pesel, iban)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          defaultTenantId, w.name, w.spec, w.site, w.email, w.phone,
          w.trc, w.passport, w.bhp, w.workPermit, w.contract,
          w.rate, w.hours, w.pesel, w.iban,
        ]
      );
    }

    // Seed compliance documents from the workers
    for (const w of workers) {
      const workerRow = await query<{ id: string }>(
        "SELECT id FROM workers WHERE full_name = $1 AND tenant_id = $2",
        [w.name, defaultTenantId]
      );
      const wId = workerRow[0]?.id;
      if (!wId) continue;

      const docs = [
        { type: "TRC", expiry: w.trc },
        { type: "Passport", expiry: w.passport },
        { type: "BHP", expiry: w.bhp },
        { type: "Work Permit", expiry: w.workPermit },
        { type: "Contract", expiry: w.contract },
      ];
      for (const d of docs) {
        if (!d.expiry) continue;
        await execute(
          `INSERT INTO documents (tenant_id, worker_id, worker_name, document_type, expiry_date)
           VALUES ($1,$2,$3,$4,$5)`,
          [defaultTenantId, wId, w.name, d.type, d.expiry]
        );
      }
    }

    console.log("[init-db] Seeded 6 demo workers with compliance documents.");

    // ── Seed site geofences ──────────────────────────────────────────────
    const geofences = [
      { name: "Site A – Dublin Docklands", lat: 53.3478, lng: -6.2297, radius: 250, address: "Grand Canal Dock, Dublin 2, Ireland" },
      { name: "Site B – Cork Harbour", lat: 51.8503, lng: -8.2943, radius: 300, address: "Ringaskiddy, Co. Cork, Ireland" },
      { name: "Site C – Galway Industrial", lat: 53.2707, lng: -9.0568, radius: 200, address: "Ballybrit Industrial Estate, Galway, Ireland" },
    ];
    for (const g of geofences) {
      await execute(
        `INSERT INTO site_geofences (tenant_id, site_name, latitude, longitude, radius_meters, address)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [defaultTenantId, g.name, g.lat, g.lng, g.radius, g.address]
      );
    }

    // ── Seed POA signatories ─────────────────────────────────────────────
    await execute(
      `INSERT INTO power_of_attorney (tenant_id, full_name, position, email, can_sign_zlecenie, can_sign_o_prace, can_sign_b2b)
       VALUES ($1, 'Manish Suresh Shetty', 'Prezes Zarządu', 'manish@apatris.pl', TRUE, TRUE, TRUE)`,
      [defaultTenantId]
    );
    await execute(
      `INSERT INTO power_of_attorney (tenant_id, full_name, position, email, can_sign_zlecenie, can_sign_o_prace, can_sign_b2b)
       VALUES ($1, 'Akshay Gandhi', 'Wiceprezes Zarządu', 'akshay@apatris.pl', TRUE, TRUE, FALSE)`,
      [defaultTenantId]
    );

    // ── Seed contracts for first 3 workers ──────────────────────────────
    const firstThree = await query<{ id: string; full_name: string; assigned_site: string; hourly_rate: number }>(
      "SELECT id, full_name, assigned_site, hourly_rate FROM workers WHERE tenant_id = $1 ORDER BY full_name LIMIT 3",
      [defaultTenantId]
    );
    const poaRow = await query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM power_of_attorney WHERE tenant_id = $1 LIMIT 1",
      [defaultTenantId]
    );
    const poaId = poaRow[0]?.id;
    const poaFullName = poaRow[0]?.full_name;

    for (const w of firstThree) {
      await execute(
        `INSERT INTO contracts (tenant_id, worker_id, worker_name, contract_type, status, start_date, end_date,
          hourly_rate, work_location, job_description, poa_id, poa_name, language, created_by)
         VALUES ($1,$2,$3,'umowa_zlecenie','active',$4,$5,$6,$7,'Prace spawalnicze i montażowe / Welding and assembly work',$8,$9,'bilingual','System Seed')`,
        [defaultTenantId, w.id, w.full_name, "2026-01-01", "2026-12-31",
         w.hourly_rate, w.assigned_site, poaId, poaFullName]
      );
    }

    // ── Seed document workflows ─────────────────────────────────────────
    const workerIds = await query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 ORDER BY full_name",
      [defaultTenantId]
    );
    const statuses = ["uploaded", "under_review", "approved", "approved", "under_review", "rejected"];
    const docTypes = ["BHP Certificate", "TRC Renewal", "Medical Exam", "Passport Scan", "Work Permit", "Safety Training"];
    for (let i = 0; i < Math.min(workerIds.length, 6); i++) {
      const w = workerIds[i];
      await execute(
        `INSERT INTO document_workflows (tenant_id, worker_id, worker_name, document_type, status, uploaded_by, expiry_date)
         VALUES ($1,$2,$3,$4,$5,'System Seed',$6)`,
        [defaultTenantId, w.id, w.full_name, docTypes[i], statuses[i],
         i < 4 ? `2026-${String(6 + i).padStart(2, "0")}-15` : null]
      );
    }

    console.log("[init-db] Seeded geofences, POA, contracts, and document workflows.");

    // ── Seed compliance snapshots (last 14 days) ─────────────────────────
    await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_tenant_date ON compliance_snapshots(tenant_id, snapshot_date)`);
    const today = new Date();
    for (let d = 13; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dateStr = date.toISOString().split("T")[0];
      const compliant = 3 + Math.floor(Math.random() * 2);
      const warning = Math.floor(Math.random() * 2);
      const critical = Math.floor(Math.random() * 2);
      const expired = 6 - compliant - warning - critical;
      await execute(
        `INSERT INTO compliance_snapshots (tenant_id, snapshot_date, total, compliant, warning, critical, expired)
         VALUES ($1,$2,6,$3,$4,$5,$6) ON CONFLICT (tenant_id, snapshot_date) DO NOTHING`,
        [defaultTenantId, dateStr, compliant, warning, critical, Math.max(0, expired)]
      );
    }

    // ── Seed audit log entries ───────────────────────────────────────────
    try {
      await execute(`CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY, timestamp TIMESTAMPTZ DEFAULT NOW(),
        actor TEXT, actor_email TEXT, action TEXT, worker_id TEXT,
        worker_name TEXT, note TEXT, tenant_id UUID
      )`);
      const auditEntries = [
        { actor: "Manish", email: "manish@apatris.pl", action: "ADMIN_LOGIN", note: "Direct login" },
        { actor: "Manish", email: "manish@apatris.pl", action: "WORKER_UPDATED", worker: "Tomasz Kowalski", note: "Updated TRC expiry date" },
        { actor: "System", email: "system", action: "COMPLIANCE_SCAN", note: "Daily scan: 2 critical, 1 warning" },
        { actor: "Akshay", email: "akshay@apatris.pl", action: "CONTRACT_GENERATED", worker: "Piotr Wiśniewski", note: "Umowa Zlecenie generated" },
        { actor: "Manish", email: "manish@apatris.pl", action: "PAYROLL_COMMIT", note: "March 2026 closed. 6 workers." },
        { actor: "System", email: "system", action: "WEEKLY_REPORT", note: "Weekly compliance report sent to 2 admins" },
      ];
      for (const e of auditEntries) {
        await execute(
          `INSERT INTO audit_logs (actor, actor_email, action, worker_name, note, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [e.actor, e.email, e.action, e.worker ?? null, e.note, defaultTenantId]
        );
      }
    } catch { /* table may have different schema */ }

    // ── Seed notification log entries ────────────────────────────────────
    try {
      await execute(`CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY, channel TEXT, worker_id TEXT, worker_name TEXT,
        sent_by TEXT, recipient TEXT, message_preview TEXT, status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), tenant_id UUID
      )`);
      const notifEntries = [
        { channel: "email", worker: "Andrzej Zieliński", recipient: "a.zielinski@apatris.pl", msg: "BHP certificate expired — immediate action required", status: "sent" },
        { channel: "email", worker: "Piotr Wiśniewski", recipient: "p.wisniewski@apatris.pl", msg: "TRC expiring in 14 days — schedule renewal", status: "sent" },
        { channel: "payslip", worker: "Tomasz Kowalski", recipient: "t.kowalski@apatris.pl", msg: "Payslip for 2026-03 — gross 5,460.00 PLN", status: "sent" },
      ];
      for (const n of notifEntries) {
        await execute(
          `INSERT INTO notification_log (channel, worker_name, recipient, message_preview, status, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [n.channel, n.worker, n.recipient, n.msg, n.status, defaultTenantId]
        );
      }
    } catch { /* table may have different schema */ }

    // ── Seed payroll commit + snapshots ──────────────────────────────────
    try {
      await execute(`CREATE TABLE IF NOT EXISTS payroll_commits (
        id SERIAL PRIMARY KEY, committed_at TIMESTAMPTZ DEFAULT NOW(), committed_by TEXT,
        month TEXT, worker_count INTEGER, total_gross NUMERIC, total_netto NUMERIC,
        payslips_sent INTEGER DEFAULT 0, tenant_id UUID
      )`);
      await execute(`CREATE TABLE IF NOT EXISTS payroll_snapshots (
        id SERIAL PRIMARY KEY, commit_id INTEGER, month TEXT, worker_id TEXT, worker_name TEXT,
        site TEXT, hours NUMERIC, hourly_rate NUMERIC, gross NUMERIC,
        employee_zus NUMERIC, health_ins NUMERIC, est_pit NUMERIC,
        advance NUMERIC, penalties NUMERIC, netto NUMERIC, tenant_id UUID
      )`);
      const commitRow = await query<{ id: number }>(
        `INSERT INTO payroll_commits (committed_by, month, worker_count, total_gross, total_netto, payslips_sent, tenant_id)
         VALUES ('Manish', '2026-03', 6, 31620.00, 23450.00, 4, $1) RETURNING id`,
        [defaultTenantId]
      );
      const commitId = commitRow[0]?.id;
      if (commitId) {
        const payrollWorkers = await query<{ id: string; full_name: string; assigned_site: string; hourly_rate: number; monthly_hours: number }>(
          "SELECT id, full_name, assigned_site, hourly_rate, monthly_hours FROM workers WHERE tenant_id = $1",
          [defaultTenantId]
        );
        for (const w of payrollWorkers) {
          const gross = Number(w.hourly_rate) * Number(w.monthly_hours);
          const zus = Math.round(gross * 0.1126 * 100) / 100;
          const health = Math.round((gross - zus) * 0.09 * 100) / 100;
          const pit = Math.max(0, Math.round((gross - zus) * 0.8 * 0.12 - 300));
          const netto = Math.round((gross - zus - health - pit) * 100) / 100;
          await execute(
            `INSERT INTO payroll_snapshots (commit_id, month, worker_id, worker_name, site, hours, hourly_rate, gross, employee_zus, health_ins, est_pit, advance, penalties, netto, tenant_id)
             VALUES ($1,'2026-03',$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12)`,
            [commitId, w.id, w.full_name, w.assigned_site, w.monthly_hours, w.hourly_rate, gross, zus, health, pit, netto, defaultTenantId]
          );
        }
      }
    } catch { /* tables may exist with different schema */ }

    console.log("[init-db] Seeded compliance snapshots, audit log, notifications, and payroll history.");
  }

  // Assign default tenant to any rows missing a tenant_id
  if (defaultTenantId) {
    await execute("UPDATE admins SET tenant_id = $1 WHERE tenant_id IS NULL", [defaultTenantId]);
    await execute("UPDATE workers SET tenant_id = $1 WHERE tenant_id IS NULL", [defaultTenantId]);
    await execute("UPDATE documents SET tenant_id = $1 WHERE tenant_id IS NULL", [defaultTenantId]);
    await execute("UPDATE site_coordinators SET tenant_id = $1 WHERE tenant_id IS NULL", [defaultTenantId]);
    await execute("UPDATE compliance_snapshots SET tenant_id = $1 WHERE tenant_id IS NULL", [defaultTenantId]);

    // Update tables that may or may not exist yet
    for (const table of ["hours_log", "mobile_pins", "payroll_commits", "payroll_snapshots", "notification_log", "audit_logs"]) {
      try {
        await execute(`UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`, [defaultTenantId]);
      } catch {
        // Table may not exist yet — safe to ignore
      }
    }
  }

  // ── Performance indexes ──────────────────────────────────────────────────
  // immigration_permits
  await execute(`
    CREATE TABLE IF NOT EXISTS immigration_permits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      permit_type TEXT NOT NULL DEFAULT 'work_permit',
      country TEXT NOT NULL DEFAULT 'PL',
      issue_date DATE,
      expiry_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      application_ref TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_immigration_permits_tenant ON immigration_permits(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_immigration_permits_worker ON immigration_permits(worker_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_immigration_permits_expiry ON immigration_permits(expiry_date)");

  // Add trc_application_submitted column if missing
  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='immigration_permits' AND column_name='trc_application_submitted') THEN
        ALTER TABLE immigration_permits ADD COLUMN trc_application_submitted BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);

  // onboarding_checklists
  await execute(`
    CREATE TABLE IF NOT EXISTS onboarding_checklists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      step_name TEXT NOT NULL,
      step_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date DATE,
      completed_at TIMESTAMPTZ,
      notes TEXT,
      required_document TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_onboarding_tenant ON onboarding_checklists(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_onboarding_worker ON onboarding_checklists(worker_id)");

  // crm_companies
  await execute(`
    CREATE TABLE IF NOT EXISTS crm_companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      nip TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      country TEXT DEFAULT 'PL',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON crm_companies(tenant_id)");

  // crm_deals
  await execute(`
    CREATE TABLE IF NOT EXISTS crm_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
      deal_name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'Lead',
      value_eur NUMERIC(12,2) DEFAULT 0,
      workers_needed INTEGER DEFAULT 0,
      role_type TEXT,
      start_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON crm_deals(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage)");

  // zus_filings
  await execute(`
    CREATE TABLE IF NOT EXISTS zus_filings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      worker_count INTEGER DEFAULT 0,
      total_contributions NUMERIC(12,2) DEFAULT 0,
      xml_data TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_zus_filings_tenant ON zus_filings(tenant_id)");
  await execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_zus_filings_period ON zus_filings(tenant_id, month, year)");

  // job_requests
  await execute(`
    CREATE TABLE IF NOT EXISTS job_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID,
      company_name TEXT,
      role_type TEXT NOT NULL,
      skills_required TEXT,
      certifications_required TEXT,
      location TEXT,
      start_date DATE,
      workers_needed INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_job_requests_tenant ON job_requests(tenant_id)");

  // worker_matches
  await execute(`
    CREATE TABLE IF NOT EXISTS worker_matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_request_id UUID REFERENCES job_requests(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL,
      match_score INTEGER DEFAULT 0,
      match_reasons JSONB DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'suggested',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_worker_matches_job ON worker_matches(job_request_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_worker_matches_worker ON worker_matches(worker_id)");

  // mood_entries
  await execute(`
    CREATE TABLE IF NOT EXISTS mood_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
      comment TEXT,
      site TEXT,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_mood_tenant ON mood_entries(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_mood_worker ON mood_entries(worker_id)");
  await execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mood_weekly ON mood_entries(tenant_id, worker_id, week_number, year)");

  // voice_checkins
  await execute(`
    CREATE TABLE IF NOT EXISTS voice_checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      worker_id UUID,
      worker_name TEXT,
      phone_number TEXT NOT NULL,
      checkin_type TEXT NOT NULL DEFAULT 'check_in',
      site TEXT,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      transcription TEXT,
      status TEXT NOT NULL DEFAULT 'recorded',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_voice_checkins_tenant ON voice_checkins(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_voice_checkins_worker ON voice_checkins(worker_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_voice_checkins_phone ON voice_checkins(phone_number)");

  // salary_advances
  await execute(`
    CREATE TABLE IF NOT EXISTS salary_advances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      amount_requested NUMERIC(10,2) NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      notes TEXT,
      deduction_month INTEGER,
      deduction_year INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_salary_advances_tenant ON salary_advances(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_salary_advances_worker ON salary_advances(worker_id)");

  // certified_signatures
  await execute(`
    CREATE TABLE IF NOT EXISTS certified_signatures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      document_id UUID,
      contract_id UUID,
      worker_id UUID,
      worker_name TEXT,
      worker_email TEXT,
      provider TEXT NOT NULL DEFAULT 'docusign',
      envelope_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TIMESTAMPTZ,
      viewed_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      ip_address TEXT,
      certificate_url TEXT,
      signing_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_cert_sigs_tenant ON certified_signatures(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_cert_sigs_envelope ON certified_signatures(envelope_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_cert_sigs_contract ON certified_signatures(contract_id)");

  // bench_entries
  await execute(`
    CREATE TABLE IF NOT EXISTS bench_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      available_from DATE DEFAULT CURRENT_DATE,
      available_until DATE,
      last_site TEXT,
      last_role TEXT,
      skills_summary TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_bench_tenant ON bench_entries(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_bench_worker ON bench_entries(worker_id)");

  // google_integrations
  await execute(`
    CREATE TABLE IF NOT EXISTS google_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      email TEXT,
      scopes TEXT,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_google_int_tenant ON google_integrations(tenant_id)");

  // generated_contracts
  await execute(`
    CREATE TABLE IF NOT EXISTS generated_contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID,
      worker_name TEXT,
      company_id UUID,
      company_name TEXT,
      contract_type TEXT NOT NULL,
      contract_data JSONB DEFAULT '{}',
      contract_html TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_gen_contracts_tenant ON generated_contracts(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_gen_contracts_worker ON generated_contracts(worker_id)");

  // leave_requests
  await execute(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      leave_type TEXT NOT NULL DEFAULT 'annual',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER DEFAULT 1,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_leave_tenant ON leave_requests(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_leave_worker ON leave_requests(worker_id)");

  // fine_predictions
  await execute(`
    CREATE TABLE IF NOT EXISTS fine_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      risk_type TEXT NOT NULL,
      risk_description TEXT,
      predicted_fine_min NUMERIC(10,2) DEFAULT 0,
      predicted_fine_max NUMERIC(10,2) DEFAULT 0,
      probability NUMERIC(5,2) DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_fine_pred_tenant ON fine_predictions(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_fine_pred_worker ON fine_predictions(worker_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_fine_pred_status ON fine_predictions(status)");

  // trust_scores
  await execute(`
    CREATE TABLE IF NOT EXISTS trust_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      breakdown JSONB DEFAULT '{}',
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      version INTEGER DEFAULT 1
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_trust_tenant ON trust_scores(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_trust_worker ON trust_scores(worker_id)");

  // churn_predictions
  await execute(`
    CREATE TABLE IF NOT EXISTS churn_predictions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      churn_probability INTEGER DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'low',
      signals JSONB DEFAULT '[]',
      recommended_action TEXT,
      predicted_leave_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_churn_tenant ON churn_predictions(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_churn_worker ON churn_predictions(worker_id)");

  // hostels
  await execute(`
    CREATE TABLE IF NOT EXISTS hostels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'PL',
      type TEXT DEFAULT 'hostel',
      total_rooms INTEGER DEFAULT 0,
      cost_per_bed_monthly NUMERIC(10,2) DEFAULT 0,
      owner_type TEXT NOT NULL DEFAULT 'owned',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_hostels_tenant ON hostels(tenant_id)");

  // hostel_rooms
  await execute(`
    CREATE TABLE IF NOT EXISTS hostel_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      hostel_id UUID REFERENCES hostels(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      current_occupancy INTEGER DEFAULT 0,
      status TEXT DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_hostel_rooms_hostel ON hostel_rooms(hostel_id)");

  // worker_housing
  await execute(`
    CREATE TABLE IF NOT EXISTS worker_housing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      hostel_id UUID REFERENCES hostels(id) ON DELETE SET NULL,
      room_id UUID REFERENCES hostel_rooms(id) ON DELETE SET NULL,
      check_in_date DATE DEFAULT CURRENT_DATE,
      check_out_date DATE,
      cost_per_month NUMERIC(10,2) DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_worker_housing_tenant ON worker_housing(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_worker_housing_worker ON worker_housing(worker_id)");

  // revenue_forecasts
  await execute(`
    CREATE TABLE IF NOT EXISTS revenue_forecasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      projected_revenue NUMERIC(12,2) DEFAULT 0,
      actual_revenue NUMERIC(12,2) DEFAULT 0,
      active_contracts INTEGER DEFAULT 0,
      active_workers INTEGER DEFAULT 0,
      avg_rate NUMERIC(8,2) DEFAULT 0,
      bench_workers INTEGER DEFAULT 0,
      revenue_at_risk NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_revenue_tenant ON revenue_forecasts(tenant_id)");

  // salary_benchmarks
  await execute(`
    CREATE TABLE IF NOT EXISTS salary_benchmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      role_type TEXT NOT NULL,
      country TEXT NOT NULL,
      experience_level TEXT,
      min_rate NUMERIC(8,2) DEFAULT 0,
      max_rate NUMERIC(8,2) DEFAULT 0,
      avg_rate NUMERIC(8,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      source TEXT DEFAULT 'ai_prediction',
      recommendation TEXT,
      calculated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_salary_bench_tenant ON salary_benchmarks(tenant_id)");

  // legal_updates
  await execute(`
    CREATE TABLE IF NOT EXISTS legal_updates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      source TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      impact_level TEXT NOT NULL DEFAULT 'low',
      affected_areas JSONB DEFAULT '[]',
      affected_workers_estimate INTEGER DEFAULT 0,
      published_date DATE,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_legal_tenant ON legal_updates(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_legal_status ON legal_updates(status)");

  // safety_incidents
  await execute(`
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID,
      worker_name TEXT,
      site TEXT NOT NULL,
      incident_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT,
      photo_url TEXT,
      ai_analysis JSONB,
      status TEXT NOT NULL DEFAULT 'open',
      reported_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_safety_inc_tenant ON safety_incidents(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_safety_inc_site ON safety_incidents(site)");

  // safety_scores
  await execute(`
    CREATE TABLE IF NOT EXISTS safety_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      score INTEGER DEFAULT 100,
      breakdown JSONB DEFAULT '{}',
      calculated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_safety_scores_tenant ON safety_scores(tenant_id)");

  // competitor_intel
  await execute(`
    CREATE TABLE IF NOT EXISTS competitor_intel (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      competitor_name TEXT,
      country TEXT NOT NULL,
      role_type TEXT NOT NULL,
      their_rate NUMERIC(8,2) DEFAULT 0,
      our_rate NUMERIC(8,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      source TEXT DEFAULT 'ai_scan',
      analysis TEXT,
      recommendation TEXT,
      status TEXT DEFAULT 'competitive',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_competitor_tenant ON competitor_intel(tenant_id)");

  // country_configs
  await execute(`
    CREATE TABLE IF NOT EXISTS country_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      min_wage_hourly NUMERIC(10,2) DEFAULT 0,
      min_wage_monthly NUMERIC(10,2) DEFAULT 0,
      social_security_employee NUMERIC(5,2) DEFAULT 0,
      social_security_employer NUMERIC(5,2) DEFAULT 0,
      income_tax_rate NUMERIC(5,2) DEFAULT 0,
      posted_worker_rules TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_country_code ON country_configs(country_code) WHERE tenant_id IS NULL");

  // Seed 7 countries if empty
  const ccCount = await query<{count:string}>("SELECT COUNT(*) AS count FROM country_configs");
  if (parseInt(ccCount[0]?.count ?? "0") < 7) {
    const countries = [
      { code: "PL", name: "Poland", cur: "PLN", minH: 31.40, minM: 4666, ssEmp: 13.71, ssEmpl: 20.48, tax: 12, pwd: "Posted from PL: A1 certificate required. Worker retains Polish ZUS. Minimum terms of host country apply after 12 months (extendable to 18).", notes: "Base country for Apatris. ZUS DRA filed monthly." },
      { code: "NL", name: "Netherlands", cur: "EUR", minH: 14.06, minM: 2070, ssEmp: 27.65, ssEmpl: 18.15, tax: 36.97, pwd: "Posted to NL: Dutch minimum wage applies from day 1. WagwEU registration required. A1 from sending country. Max 12 months standard posting.", notes: "WagwEU notification mandatory. Dutch TWV/GVVA for non-EU workers." },
      { code: "BE", name: "Belgium", cur: "EUR", minH: 13.29, minM: 1994.18, ssEmp: 13.07, ssEmpl: 25, tax: 25, pwd: "Posted to BE: Limosa declaration mandatory before posting. Belgian minimum terms from day 1. A1 required. Joint committee rates may apply.", notes: "Limosa declaration via socialsecurity.be. Belgian Single Permit for non-EU." },
      { code: "LT", name: "Lithuania", cur: "EUR", minH: 5.65, minM: 924, ssEmp: 19.5, ssEmpl: 1.77, tax: 20, pwd: "Posted to LT: Registration with State Labour Inspectorate. Lithuanian minimum terms apply. A1 from sending country required.", notes: "Sodra contributions. Work permits via Migration Department." },
      { code: "SK", name: "Slovakia", cur: "EUR", minH: 5.47, minM: 816, ssEmp: 13.4, ssEmpl: 35.2, tax: 19, pwd: "Posted to SK: Notification to National Labour Inspectorate. Slovak minimum conditions apply. A1 required for social security.", notes: "High employer social security. Work permits via Ministry of Labour." },
      { code: "CZ", name: "Czech Republic", cur: "CZK", minH: 113.50, minM: 18900, ssEmp: 11, ssEmpl: 33.8, tax: 15, pwd: "Posted to CZ: Registration with Labour Office. Czech minimum terms apply from day 1. A1 from sending country.", notes: "ČSSZ contributions. Employee card for non-EU workers." },
      { code: "RO", name: "Romania", cur: "RON", minH: 29.09, minM: 4050, ssEmp: 25, ssEmpl: 2.25, tax: 10, pwd: "Posted to RO: Notification to territorial labour inspectorate. Romanian minimum conditions apply. A1 required.", notes: "CAS 25% employee. Low employer contributions." },
    ];
    for (const c of countries) {
      await execute(
        `INSERT INTO country_configs (country_code, country_name, currency, min_wage_hourly, min_wage_monthly, social_security_employee, social_security_employer, income_tax_rate, posted_worker_rules, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [c.code, c.name, c.cur, c.minH, c.minM, c.ssEmp, c.ssEmpl, c.tax, c.pwd, c.notes]
      );
    }
    console.log("[init-db] Seeded 7 country configurations.");
  }

  // fraud_alerts
  await execute(`
    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT,
      worker_id UUID,
      worker_name TEXT,
      evidence JSONB DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      resolution TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_fraud_tenant ON fraud_alerts(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_fraud_status ON fraud_alerts(status)");

  // translation_cache
  await execute(`
    CREATE TABLE IF NOT EXISTS translation_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      source_text TEXT NOT NULL,
      source_lang TEXT NOT NULL DEFAULT 'en',
      target_lang TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_translation_cache ON translation_cache(source_lang, target_lang, source_text)");

  // Add preferred_language to workers if missing
  await execute(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='preferred_language') THEN
        ALTER TABLE workers ADD COLUMN preferred_language TEXT DEFAULT 'en';
      END IF;
    END $$;
  `);

  // messages
  await execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      thread_id UUID,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      receiver_id TEXT NOT NULL,
      receiver_name TEXT,
      message TEXT NOT NULL,
      encrypted BOOLEAN DEFAULT TRUE,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)");

  // message_threads
  await execute(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      participant_ids JSONB DEFAULT '[]',
      participant_names JSONB DEFAULT '[]',
      last_message TEXT,
      last_message_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_msg_threads_tenant ON message_threads(tenant_id)");

  // insurance_policies
  await execute(`
    CREATE TABLE IF NOT EXISTS insurance_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      policy_name TEXT NOT NULL,
      provider TEXT,
      policy_type TEXT NOT NULL DEFAULT 'group_health',
      coverage_amount NUMERIC(12,2) DEFAULT 0,
      premium_monthly NUMERIC(10,2) DEFAULT 0,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      workers_covered INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_insurance_pol_tenant ON insurance_policies(tenant_id)");

  // insurance_claims
  await execute(`
    CREATE TABLE IF NOT EXISTS insurance_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID,
      worker_name TEXT,
      policy_id UUID REFERENCES insurance_policies(id) ON DELETE SET NULL,
      incident_date DATE,
      description TEXT,
      amount_claimed NUMERIC(10,2) DEFAULT 0,
      status TEXT DEFAULT 'open',
      resolution TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_insurance_claims_tenant ON insurance_claims(tenant_id)");

  // skill_demands
  await execute(`
    CREATE TABLE IF NOT EXISTS skill_demands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      role_type TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      certification_name TEXT,
      country TEXT,
      demand_level TEXT DEFAULT 'medium',
      current_pool_count INTEGER DEFAULT 0,
      shortage_count INTEGER DEFAULT 0,
      avg_premium_rate NUMERIC(8,2) DEFAULT 0,
      recommendation TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_skill_demands_tenant ON skill_demands(tenant_id)");

  // career_paths
  await execute(`
    CREATE TABLE IF NOT EXISTS career_paths (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      current_role TEXT,
      current_certifications TEXT,
      recommended_next_cert TEXT,
      estimated_salary_increase NUMERIC(8,2) DEFAULT 0,
      time_to_achieve TEXT,
      steps JSONB DEFAULT '[]',
      progress INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_career_paths_tenant ON career_paths(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_career_paths_worker ON career_paths(worker_id)");

  // margin_analysis
  await execute(`
    CREATE TABLE IF NOT EXISTS margin_analysis (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID,
      company_name TEXT,
      worker_id UUID,
      worker_name TEXT,
      month INTEGER,
      year INTEGER,
      revenue NUMERIC(12,2) DEFAULT 0,
      worker_cost NUMERIC(12,2) DEFAULT 0,
      housing_cost NUMERIC(12,2) DEFAULT 0,
      admin_cost NUMERIC(12,2) DEFAULT 0,
      gross_margin NUMERIC(12,2) DEFAULT 0,
      gross_margin_pct NUMERIC(5,2) DEFAULT 0,
      flag TEXT DEFAULT 'healthy',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_margin_tenant ON margin_analysis(tenant_id)");

  // geo_data
  await execute(`
    CREATE TABLE IF NOT EXISTS geo_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      worker_id UUID,
      worker_name TEXT,
      latitude NUMERIC(10,7),
      longitude NUMERIC(10,7),
      site TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT DEFAULT 'gps_checkin'
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_geo_tenant ON geo_data(tenant_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_geo_worker ON geo_data(worker_id)");

  // market_signals
  await execute(`
    CREATE TABLE IF NOT EXISTS market_signals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      signal_type TEXT NOT NULL,
      country TEXT,
      role_type TEXT,
      signal_strength TEXT DEFAULT 'medium',
      description TEXT,
      recommended_action TEXT,
      source TEXT DEFAULT 'ai_scan',
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      status TEXT DEFAULT 'active'
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_market_signals_tenant ON market_signals(tenant_id)");

  // worker_identities
  await execute(`
    CREATE TABLE IF NOT EXISTS worker_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      identity_hash TEXT UNIQUE,
      certifications JSONB DEFAULT '[]',
      work_history JSONB DEFAULT '[]',
      trust_score INTEGER DEFAULT 0,
      trust_level TEXT DEFAULT 'bronze',
      compliance_status TEXT DEFAULT 'compliant',
      issued_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      verified_by TEXT,
      qr_code TEXT,
      status TEXT DEFAULT 'active'
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_identity_worker ON worker_identities(worker_id)");
  await execute("CREATE INDEX IF NOT EXISTS idx_identity_hash ON worker_identities(identity_hash)");

  // compliance_guarantees
  await execute(`
    CREATE TABLE IF NOT EXISTS compliance_guarantees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID,
      company_name TEXT,
      guarantee_start DATE,
      guarantee_end DATE,
      max_coverage_eur NUMERIC(12,2) DEFAULT 0,
      incidents INTEGER DEFAULT 0,
      fines_covered NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_guarantee_tenant ON compliance_guarantees(tenant_id)");

  // compliance_incidents
  await execute(`
    CREATE TABLE IF NOT EXISTS compliance_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      guarantee_id UUID REFERENCES compliance_guarantees(id) ON DELETE CASCADE,
      worker_id UUID,
      worker_name TEXT,
      incident_type TEXT NOT NULL,
      fine_amount NUMERIC(10,2) DEFAULT 0,
      covered BOOLEAN DEFAULT TRUE,
      resolution TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_comp_incidents_guarantee ON compliance_incidents(guarantee_id)");

  // white_label_agencies
  await execute(`
    CREATE TABLE IF NOT EXISTS white_label_agencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      agency_name TEXT NOT NULL,
      domain TEXT,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#C41E18',
      secondary_color TEXT DEFAULT '#0f172a',
      contact_email TEXT,
      plan TEXT DEFAULT 'starter',
      worker_limit INTEGER DEFAULT 25,
      monthly_fee NUMERIC(10,2) DEFAULT 199,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_wl_agencies_tenant ON white_label_agencies(tenant_id)");

  // agency_workers
  await execute(`
    CREATE TABLE IF NOT EXISTS agency_workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID REFERENCES white_label_agencies(id) ON DELETE CASCADE,
      worker_id UUID NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_agency_workers_agency ON agency_workers(agency_id)");

  // framework_agreements
  await execute(`
    CREATE TABLE IF NOT EXISTS framework_agreements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID,
      company_name TEXT,
      agreement_name TEXT NOT NULL,
      start_date DATE,
      end_date DATE,
      roles_covered JSONB DEFAULT '[]',
      sla_terms TEXT,
      guarantee_terms TEXT,
      agreement_html TEXT,
      status TEXT DEFAULT 'draft',
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_framework_tenant ON framework_agreements(tenant_id)");

  // rate_cards
  await execute(`
    CREATE TABLE IF NOT EXISTS rate_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agreement_id UUID REFERENCES framework_agreements(id) ON DELETE CASCADE,
      role_type TEXT NOT NULL,
      country TEXT DEFAULT 'PL',
      rate_per_hour NUMERIC(8,2) DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      minimum_hours INTEGER DEFAULT 160,
      overtime_rate NUMERIC(8,2) DEFAULT 0
    );
  `);
  await execute("CREATE INDEX IF NOT EXISTS idx_rate_cards_agreement ON rate_cards(agreement_id)");

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(full_name)",
    "CREATE INDEX IF NOT EXISTS idx_workers_site ON workers(assigned_site)",
    "CREATE INDEX IF NOT EXISTS idx_workers_trc ON workers(trc_expiry)",
    "CREATE INDEX IF NOT EXISTS idx_workers_passport ON workers(passport_expiry)",
    "CREATE INDEX IF NOT EXISTS idx_workers_bhp ON workers(bhp_expiry)",
    "CREATE INDEX IF NOT EXISTS idx_workers_contract ON workers(contract_end_date)",
    "CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date)",
    "CREATE INDEX IF NOT EXISTS idx_documents_worker ON documents(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_contracts_worker ON contracts(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)",
    "CREATE INDEX IF NOT EXISTS idx_doc_workflows_status ON document_workflows(status)",
    "CREATE INDEX IF NOT EXISTS idx_doc_workflows_worker ON document_workflows(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_gps_checkins_worker ON gps_checkins(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_gps_checkins_site ON gps_checkins(site_name)",
    "CREATE INDEX IF NOT EXISTS idx_face_encodings_worker ON face_encodings(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_a1_certs_worker ON a1_certificates(worker_id)",
    "CREATE INDEX IF NOT EXISTS idx_postings_worker ON posting_assignments(worker_id)",
  ];
  for (const idx of indexes) {
    try { await execute(idx); } catch { /* index may already exist or table missing */ }
  }

  console.log("[init-db] Database initialization complete.");
}
