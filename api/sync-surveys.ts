import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const SHEETS: { region: string; spreadsheetId: string }[] = [
  { region: 'BC', spreadsheetId: '1BS5PgmL0krGLGURweu6Bo0VYbUzuiWNjfRiYczH54U0' },
  { region: 'ON', spreadsheetId: '1LQAZN0ojAp9pvjA5O-Y8SZYyO2-3kQxuytMWECwBh4M' },
  { region: 'CA', spreadsheetId: '1F1nY_n5KqZszLGeFopW7fupMRiyWsSMn9lszj8WErjE' },
];

/* ------------------------------------------------------------------ */
/*  Column mapping helpers (mirrored from SurveyPanel.tsx)              */
/* ------------------------------------------------------------------ */

function normaliseHeader(h: string): string {
  return h.replace(/^\d+\.\s*/, '').trim().toLowerCase();
}

function findCol(headers: string[], needle: string): number {
  return headers.findIndex((h) => normaliseHeader(h).includes(needle));
}

function parseTimestamp(raw: string): string | null {
  if (!raw) return null;
  const [datePart, timePart] = raw.split(' ');
  if (!datePart) return null;
  const [m, d, y] = datePart.split('/');
  if (!m || !d || !y) return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return timePart ? `${iso}T${timePart}` : iso;
}

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth check: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Init Google Sheets client (OAuth2 with refresh token)
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  // Supabase REST API config (avoid supabase-js ByteString issues with non-ASCII data)
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

  async function callRpc(fnName: string, params: Record<string, unknown>): Promise<{ error?: string }> {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: text };
    }
    return {};
  }

  const results: { region: string; total: number; inserted: number; errors: string[] }[] = [];

  for (const { region, spreadsheetId } of SHEETS) {
    const errors: string[] = [];
    let total = 0;
    let inserted = 0;

    try {
      // Read all data from the first sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A:Z', // Read all columns
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        errors.push('Empty sheet or no data rows');
        results.push({ region, total: 0, inserted: 0, errors });
        continue;
      }

      // Parse headers
      const headers = rows[0] as string[];
      const colTs = 0;
      const colLoc = findCol(headers, 'location');
      const colOverall = findCol(headers, 'overall experience');
      const colService = findCol(headers, 'service');
      const colClean = findCol(headers, 'clean');
      const colFood = findCol(headers, 'quality of the food');
      const colPositive = findCol(headers, 'positive feedback');
      const colImprove = findCol(headers, 'improvement');
      const colHeard = findCol(headers, 'hear about');
      const colRace = findCol(headers, 'race');
      const colFreq = findCol(headers, 'how often');
      const colMember = findCol(headers, 'existing member');
      const colName = headers.findIndex((h) => h.trim().toLowerCase() === 'name');
      const colEmail = headers.findIndex((h) => h.trim().toLowerCase().includes('email'));

      // Build records
      const records: Record<string, unknown>[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] as string[];
        const ts = parseTimestamp(r[colTs] ?? '');
        const store = (colLoc >= 0 ? r[colLoc] : '')?.trim() ?? '';
        if (!ts || !store) continue;

        records.push({
          p_region: region,
          p_submitted_at: ts,
          p_store_name: store,
          p_rating_overall: toInt(colOverall >= 0 ? r[colOverall] : undefined),
          p_rating_service: toInt(colService >= 0 ? r[colService] : undefined),
          p_rating_cleanliness: toInt(colClean >= 0 ? r[colClean] : undefined),
          p_rating_food: toInt(colFood >= 0 ? r[colFood] : undefined),
          p_positive_feedback: colPositive >= 0 ? r[colPositive]?.trim() || null : null,
          p_improvement_suggestions: colImprove >= 0 ? r[colImprove]?.trim() || null : null,
          p_heard_from: colHeard >= 0 ? r[colHeard]?.trim() || null : null,
          p_race_demographic: colRace >= 0 ? r[colRace]?.trim() || null : null,
          p_visit_frequency: colFreq >= 0 ? r[colFreq]?.trim() || null : null,
          p_member_info: colMember >= 0 ? r[colMember]?.trim() || null : null,
          p_respondent_name: colName >= 0 ? r[colName]?.trim() || null : null,
          p_email: colEmail >= 0 ? r[colEmail]?.trim() || null : null,
        });
      }

      total = records.length;

      // Batch upsert via RPC (50 at a time)
      const BATCH = 50;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const rpcResults = await Promise.all(
          batch.map((rec) => callRpc('upsert_survey_response', rec)),
        );
        const batchErrors = rpcResults.filter((r) => r.error);
        if (batchErrors.length > 0) {
          errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${batchErrors[0].error!}`);
        } else {
          inserted += batch.length;
        }
      }
    } catch (err) {
      errors.push(`Failed to read sheet: ${err instanceof Error ? err.message : String(err)}`);
    }

    results.push({ region, total, inserted, errors });
  }

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    results,
  });
}
