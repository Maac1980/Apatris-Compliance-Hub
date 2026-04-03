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
