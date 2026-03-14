const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Welders";

// The user may paste a full Airtable URL or just the base ID.
// Extract only the appXXXXX portion from whatever was provided.
function extractBaseId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Match appXXXXXXXXXXXXXXX (17+ alphanumeric chars after "app")
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
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
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
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${id}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return (await res.json()) as AirtableRecord;
}

export async function updateRecord(
  id: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord> {
  if (!AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID environment variable is not set");
  }

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
