const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_URL = "https://api.airtable.com/v0";
const TABLE_NAME = "Administrators";

function extractBaseId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(app[a-zA-Z0-9]{10,})/);
  return match ? match[1] : raw.trim();
}

const AIRTABLE_BASE_ID = extractBaseId(process.env.AIRTABLE_BASE_ID);

function headers() {
  if (!AIRTABLE_API_KEY) throw new Error("AIRTABLE_API_KEY not set");
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export interface AdminRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

// Ensure the Administrators table exists with fields + two seeded admins.
// Safe to call multiple times — idempotent.
export async function ensureAdminsTable(): Promise<void> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  // 1. Check existing tables
  const metaRes = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    { headers: headers() }
  );
  if (!metaRes.ok) throw new Error(`Meta API error: ${await metaRes.text()}`);

  const meta = (await metaRes.json()) as {
    tables: Array<{ id: string; name: string }>;
  };

  const tableExists = meta.tables.some(
    (t) => t.name.toLowerCase() === TABLE_NAME.toLowerCase()
  );

  if (!tableExists) {
    // 2. Create the table (first field becomes the primary field)
    const createRes = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: TABLE_NAME,
          fields: [
            { name: "Full Name", type: "singleLineText" },
            { name: "Email Address", type: "singleLineText" },
            { name: "Phone Number", type: "singleLineText" },
            { name: "Role", type: "singleLineText" },
          ],
        }),
      }
    );
    if (!createRes.ok) {
      throw new Error(`Failed to create table: ${await createRes.text()}`);
    }

    // 3. Seed the two admins
    const seedPayload = {
      records: [
        {
          fields: {
            "Full Name": "Akshay Gandhi",
            "Email Address": "",
            "Phone Number": "",
            Role: "Admin",
          },
        },
        {
          fields: {
            "Full Name": "Manish Suresh Shetty",
            "Email Address": "",
            "Phone Number": "",
            Role: "Admin",
          },
        },
      ],
    };

    const seedRes = await fetch(
      `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`,
      { method: "POST", headers: headers(), body: JSON.stringify(seedPayload) }
    );
    if (!seedRes.ok) {
      throw new Error(`Failed to seed admins: ${await seedRes.text()}`);
    }
  }
}

export async function fetchAdmins(): Promise<AdminRecord[]> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const url = new URL(
    `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`
  );
  url.searchParams.set("pageSize", "100");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  };

  return data.records.map((r) => ({
    id: r.id,
    fullName: String(r.fields["Full Name"] ?? ""),
    email: String(r.fields["Email Address"] ?? ""),
    phone: String(r.fields["Phone Number"] ?? ""),
    role: String(r.fields["Role"] ?? "Admin"),
  }));
}

export async function updateAdmin(
  id: string,
  fields: { email?: string; phone?: string }
): Promise<AdminRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const airtableFields: Record<string, string> = {};
  if (fields.email !== undefined) airtableFields["Email Address"] = fields.email;
  if (fields.phone !== undefined) airtableFields["Phone Number"] = fields.phone;

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields: airtableFields }),
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);

  const r = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return {
    id: r.id,
    fullName: String(r.fields["Full Name"] ?? ""),
    email: String(r.fields["Email Address"] ?? ""),
    phone: String(r.fields["Phone Number"] ?? ""),
    role: String(r.fields["Role"] ?? "Admin"),
  };
}
