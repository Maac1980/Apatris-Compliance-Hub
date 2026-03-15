
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_URL = "https://api.airtable.com/v0";
const TABLE_NAME = "Documents";

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

export type ComplianceStatus = "GREEN" | "YELLOW" | "RED" | "EXPIRED";

export interface DocumentRecord {
  id: string;
  workerName: string;
  workerId: string;
  documentType: string;
  issueDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: ComplianceStatus;
}

function computeStatus(expiryDate: string): { daysUntilExpiry: number; status: ComplianceStatus } {
  if (!expiryDate) return { daysUntilExpiry: -999, status: "EXPIRED" };
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return { daysUntilExpiry: -999, status: "EXPIRED" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let status: ComplianceStatus;
  if (days < 0) status = "EXPIRED";
  else if (days <= 30) status = "RED";
  else if (days <= 60) status = "YELLOW";
  else status = "GREEN";
  return { daysUntilExpiry: days, status };
}

function mapRecord(r: { id: string; fields: Record<string, unknown> }): DocumentRecord {
  const expiryDate = String(r.fields["Expiry Date"] ?? "");
  const { daysUntilExpiry, status } = computeStatus(expiryDate);
  return {
    id: r.id,
    workerName: String(r.fields["Worker Name"] ?? ""),
    workerId: String(r.fields["Worker ID"] ?? ""),
    documentType: String(r.fields["Document Type"] ?? ""),
    issueDate: String(r.fields["Issue Date"] ?? ""),
    expiryDate,
    daysUntilExpiry,
    status,
  };
}

export async function ensureDocumentsTable(): Promise<void> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const metaRes = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    { headers: headers() }
  );
  if (!metaRes.ok) throw new Error(`Meta API error: ${await metaRes.text()}`);
  const meta = (await metaRes.json()) as { tables: Array<{ id: string; name: string }> };

  if (meta.tables.some((t) => t.name.toLowerCase() === TABLE_NAME.toLowerCase())) return;

  const createRes = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: TABLE_NAME,
        fields: [
          { name: "Worker Name", type: "singleLineText" },
          { name: "Worker ID", type: "singleLineText" },
          { name: "Document Type", type: "singleLineText" },
          { name: "Issue Date", type: "date", options: { dateFormat: { name: "iso" } } },
          { name: "Expiry Date", type: "date", options: { dateFormat: { name: "iso" } } },
        ],
      }),
    }
  );
  if (!createRes.ok) throw new Error(`Failed to create Documents table: ${await createRes.text()}`);

  // Seed from existing WELDERS data
  await seedFromWelders();
}

async function seedFromWelders(): Promise<void> {
  if (!AIRTABLE_BASE_ID) return;

  const welderTable = process.env.AIRTABLE_TABLE_NAME || "Welders";
  const url = new URL(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(welderTable)}`);
  url.searchParams.set("pageSize", "100");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) return;

  const data = (await res.json()) as {
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  };

  const docEntries: Array<Record<string, unknown>> = [];
  for (const r of data.records) {
    const name = String(r.fields["Full Name"] ?? r.fields["Name"] ?? "Unknown Worker");
    const types: Array<{ field: string; docType: string }> = [
      { field: "TRC_EXPIRY", docType: "TRC" },
      { field: "PASSPORT_EXPIRY", docType: "Passport" },
      { field: "BHP EXPIRY", docType: "BHP" },
    ];
    for (const { field, docType } of types) {
      const expiry = r.fields[field];
      if (expiry && String(expiry).trim()) {
        docEntries.push({
          "Worker Name": name,
          "Worker ID": r.id,
          "Document Type": docType,
          "Issue Date": "",
          "Expiry Date": String(expiry),
        });
      }
    }
  }

  // Batch create in groups of 10 (Airtable limit)
  for (let i = 0; i < docEntries.length; i += 10) {
    const batch = docEntries.slice(i, i + 10);
    await fetch(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ records: batch.map((f) => ({ fields: f })) }),
    });
  }
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const records: DocumentRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    records.push(...data.records.map(mapRecord));
    offset = data.offset;
  } while (offset);

  return records.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

export async function createDocument(fields: {
  workerName: string;
  workerId?: string;
  documentType: string;
  issueDate?: string;
  expiryDate: string;
}): Promise<DocumentRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const res = await fetch(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      records: [
        {
          fields: {
            "Worker Name": fields.workerName,
            "Worker ID": fields.workerId ?? "",
            "Document Type": fields.documentType,
            "Issue Date": fields.issueDate ?? "",
            "Expiry Date": fields.expiryDate,
          },
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }> };
  return mapRecord(data.records[0]);
}

export async function updateDocument(
  id: string,
  fields: Partial<{ workerName: string; workerId: string; documentType: string; issueDate: string; expiryDate: string }>
): Promise<DocumentRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");

  const airtableFields: Record<string, string> = {};
  if (fields.workerName !== undefined) airtableFields["Worker Name"] = fields.workerName;
  if (fields.workerId !== undefined) airtableFields["Worker ID"] = fields.workerId;
  if (fields.documentType !== undefined) airtableFields["Document Type"] = fields.documentType;
  if (fields.issueDate !== undefined) airtableFields["Issue Date"] = fields.issueDate;
  if (fields.expiryDate !== undefined) airtableFields["Expiry Date"] = fields.expiryDate;

  const res = await fetch(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields: airtableFields }),
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapRecord(data);
}

export async function deleteDocument(id: string): Promise<void> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID not set");
  const res = await fetch(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}
