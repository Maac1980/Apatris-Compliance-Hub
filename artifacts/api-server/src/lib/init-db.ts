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

  // mobile_pins
  await execute(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='mobile_pins') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mobile_pins' AND column_name='tenant_id') THEN
          ALTER TABLE mobile_pins ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_mobile_pins_tenant ON mobile_pins(tenant_id);
        END IF;
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

  console.log("[init-db] Database initialization complete.");
}
