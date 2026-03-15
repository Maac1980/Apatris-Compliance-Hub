const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Welders";

function extractBaseId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(app[a-zA-Z0-9]{10,})/);
  return match ? match[1] : raw.trim();
}

const AIRTABLE_BASE_ID = extractBaseId(process.env.AIRTABLE_BASE_ID);

const BASE_URL = "https://api.airtable.com/v0";

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

function headers() {
  if (!AIRTABLE_API_KEY) {
    throw new Error("AIRTABLE_API_KEY environment variable is not set");
  }
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function fetchAllRecords(): Promise<AirtableRecord[]> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`);
    if (offset) url.searchParams.set("offset", offset);
    url.searchParams.set("pageSize", "100");

    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as AirtableResponse;
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

export async function fetchRecord(id: string): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return (await res.json()) as AirtableRecord;
}

export async function updateRecord(id: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return (await res.json()) as AirtableRecord;
}

export async function deleteRecord(id: string): Promise<void> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, { method: "DELETE", headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
}

export async function createRecord(fields: Record<string, unknown>): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID environment variable is not set");

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return (await res.json()) as AirtableRecord;
}

export async function initializeFields(): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable credentials are not set");

  const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: headers(),
  });
  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(`Metadata API error ${metaRes.status}: ${text}`);
  }

  const metaData = (await metaRes.json()) as {
    tables: Array<{ id: string; name: string; fields: Array<{ name: string }> }>;
  };

  const table = metaData.tables.find((t) => t.name.toLowerCase() === AIRTABLE_TABLE_NAME.toLowerCase());
  if (!table) {
    throw new Error(`Table "${AIRTABLE_TABLE_NAME}" not found. Available: ${metaData.tables.map((t) => t.name).join(", ")}`);
  }

  const existing = new Set(table.fields.map((f) => f.name.toLowerCase()));

  const fieldsToCreate = [
    { name: "SPEC", type: "singleLineText" },
    { name: "SITE", type: "singleLineText" },
    { name: "EMAIL", type: "email" },
    { name: "PHONE", type: "phoneNumber" },
    { name: "EXPERIENCE", type: "singleLineText" },
    { name: "TRC_EXPIRY", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "PASSPORT_EXPIRY", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "BHP_EXPIRY", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Work Permit Expiry", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Contract End Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "TRC Certificate", type: "multipleAttachments" },
    { name: "BHP Certificate", type: "multipleAttachments" },
    { name: "CONTRACT", type: "multipleAttachments" },
    { name: "PASSPORT DOCCUMENT", type: "multipleAttachments" },
    { name: "HOURLY_RATE", type: "number", options: { precision: 2 } },
    { name: "MONTHLY_HOURS", type: "number", options: { precision: 0 } },
    // Polish compliance fields
    { name: "Medical Exam Expiry", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "Oswiadczenie Expiry", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "UDT Cert Expiry", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "RODO Consent Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "PUP Filed Date", type: "date", options: { dateFormat: { name: "iso" } } },
    { name: "PESEL", type: "singleLineText" },
    { name: "NIP", type: "singleLineText" },
    { name: "Visa Type", type: "singleLineText" },
    { name: "Welding Process", type: "singleLineText" },
    { name: "Welding Material Group", type: "singleLineText" },
    { name: "Welding Thickness", type: "singleLineText" },
    { name: "Welding Position", type: "singleLineText" },
    { name: "ZUS Status", type: "singleSelect", options: { choices: [{ name: "Registered", color: "greenBright" }, { name: "Unregistered", color: "redBright" }, { name: "Unknown", color: "grayBright" }] } },
    { name: "Advance", type: "number", options: { precision: 2 } },
    { name: "Penalties", type: "number", options: { precision: 2 } },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const field of fieldsToCreate) {
    if (existing.has(field.name.toLowerCase())) { skipped.push(field.name); continue; }
    const r = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${table.id}/fields`,
      { method: "POST", headers: headers(), body: JSON.stringify(field) }
    );
    if (r.ok) {
      created.push(field.name);
    } else {
      const t = await r.text();
      errors.push(`${field.name}: ${t}`);
    }
  }

  return { created, skipped, errors };
}

/**
 * Finds a user in the USERS table by email address (case-insensitive).
 */
export async function fetchUserByEmail(email: string): Promise<AirtableRecord | null> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable credentials are not set");

  const url = new URL(`${BASE_URL}/${AIRTABLE_BASE_ID}/USERS`);
  url.searchParams.set("filterByFormula", `LOWER({Email})="${email.toLowerCase()}"`);
  url.searchParams.set("maxRecords", "1");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as AirtableResponse;
  return data.records[0] ?? null;
}

/**
 * Ensures the given site name exists as a choice in the ASSIGNED SITE singleSelect field.
 * If it doesn't exist yet, adds it via the Airtable Meta API so free-text saves succeed.
 */
export async function ensureSiteChoice(siteName: string): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable credentials are not set");

  // Fetch the current table schema
  const metaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: headers(),
  });
  if (!metaRes.ok) return; // best-effort — don't block the save

  const metaData = (await metaRes.json()) as {
    tables: Array<{
      id: string;
      name: string;
      fields: Array<{ id: string; name: string; type: string; options?: { choices?: Array<{ name: string }> } }>;
    }>;
  };

  const table = metaData.tables.find((t) => t.name.toLowerCase() === (AIRTABLE_TABLE_NAME ?? "welders").toLowerCase());
  if (!table) return;

  const siteField = table.fields.find((f) => f.name === "ASSIGNED SITE");
  if (!siteField) return;

  const existingChoices = siteField.options?.choices ?? [];
  const alreadyExists = existingChoices.some((c) => c.name.toLowerCase() === siteName.toLowerCase());
  if (alreadyExists) return;

  // Add the new choice — pick a color from a rotating palette
  const palette = ["cyanBright", "tealBright", "pinkBright", "greenBright", "blueBright", "orangeBright", "purpleBright"];
  const color = palette[existingChoices.length % palette.length];

  await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${table.id}/fields/${siteField.id}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        options: {
          choices: [...existingChoices, { name: siteName, color }],
        },
      }),
    }
  );
}

export async function uploadAttachmentToRecord(
  recordId: string,
  fieldName: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) throw new Error("Airtable credentials are not set");

  const contentUrl = `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;

  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: mimeType }), filename);
  form.append("filename", filename);
  form.append("contentType", mimeType);

  const res = await fetch(contentUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable upload error ${res.status}: ${text}`);
  }
}
