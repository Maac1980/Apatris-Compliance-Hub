import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧", engine: "native" },
  { code: "pl", name: "Polish", flag: "🇵🇱", engine: "deepl" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦", engine: "deepl" },
  { code: "ro", name: "Romanian", flag: "🇷🇴", engine: "deepl" },
  { code: "tl", name: "Filipino (Tagalog)", flag: "🇵🇭", engine: "claude" },
  { code: "hi", name: "Hindi", flag: "🇮🇳", engine: "claude" },
  { code: "ne", name: "Nepali", flag: "🇳🇵", engine: "claude" },
];

const DEEPL_LANGS = ["pl", "uk", "ro"];
const CLAUDE_LANGS = ["tl", "hi", "ne"];
const LANG_NAMES: Record<string, string> = { en: "English", pl: "Polish", uk: "Ukrainian", ro: "Romanian", tl: "Filipino (Tagalog)", hi: "Hindi", ne: "Nepali" };

// Nationality → language mapping
const NATIONALITY_LANG: Record<string, string> = {
  filipino: "tl", philippine: "tl", indian: "hi", nepali: "ne", nepalese: "ne",
  ukrainian: "uk", romanian: "ro", polish: "pl",
};

async function translateText(text: string, sourceLang: string, targetLang: string, tenantId?: string): Promise<string> {
  if (sourceLang === targetLang || !text.trim()) return text;

  // Check cache first
  const cached = await queryOne<Record<string, any>>(
    "SELECT translated_text FROM translation_cache WHERE source_text = $1 AND source_lang = $2 AND target_lang = $3 AND (tenant_id = $4 OR tenant_id IS NULL) LIMIT 1",
    [text.slice(0, 500), sourceLang, targetLang, tenantId ?? null]
  );
  if (cached) return cached.translated_text;

  let translated = text;

  if (DEEPL_LANGS.includes(targetLang)) {
    // DeepL API
    const apiKey = process.env.DEEPL_API_KEY;
    if (apiKey) {
      try {
        const deeplLang = targetLang === "uk" ? "UK" : targetLang.toUpperCase();
        const res = await fetch("https://api-free.deepl.com/v2/translate", {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: [text], source_lang: sourceLang.toUpperCase(), target_lang: deeplLang }),
        });
        if (res.ok) {
          const data = await res.json();
          translated = data.translations?.[0]?.text ?? text;
        }
      } catch { /* fallback to Claude */ }
    }

    // Fallback to Claude if DeepL fails
    if (translated === text) {
      translated = await claudeTranslate(text, sourceLang, targetLang);
    }
  } else if (CLAUDE_LANGS.includes(targetLang)) {
    translated = await claudeTranslate(text, sourceLang, targetLang);
  }

  // Cache result
  if (translated !== text) {
    try {
      await execute(
        "INSERT INTO translation_cache (tenant_id, source_text, source_lang, target_lang, translated_text) VALUES ($1,$2,$3,$4,$5)",
        [tenantId ?? null, text.slice(0, 500), sourceLang, targetLang, translated]
      );
    } catch { /* cache write non-blocking */ }
  }

  return translated;
}

async function claudeTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return text;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a professional translator. Translate the following text from ${LANG_NAMES[sourceLang] || sourceLang} to ${LANG_NAMES[targetLang] || targetLang}. Return ONLY the translated text, nothing else.`,
      messages: [{ role: "user", content: text }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : text;
  } catch {
    return text;
  }
}

// GET /api/translate/languages
router.get("/translate/languages", requireAuth, async (_req, res) => {
  res.json({ languages: LANGUAGES });
});

// POST /api/translate
router.post("/translate", requireAuth, async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body as { text?: string; sourceLang?: string; targetLang?: string };
    if (!text || !targetLang) return res.status(400).json({ error: "text and targetLang required" });

    const translated = await translateText(text, sourceLang || "en", targetLang, req.tenantId!);
    res.json({ translated, sourceLang: sourceLang || "en", targetLang });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Translation failed" });
  }
});

// POST /api/translate/document — translate multiple texts
router.post("/translate/document", requireAuth, async (req, res) => {
  try {
    const { texts, sourceLang, targetLang } = req.body as { texts?: string[]; sourceLang?: string; targetLang?: string };
    if (!texts?.length || !targetLang) return res.status(400).json({ error: "texts array and targetLang required" });

    const translated = await Promise.all(
      texts.map(t => translateText(t, sourceLang || "en", targetLang, req.tenantId!))
    );
    res.json({ translated, sourceLang: sourceLang || "en", targetLang, count: translated.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/translate/detect/:workerId — detect language from worker nationality
router.get("/translate/detect/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<Record<string, any>>(
      "SELECT preferred_language, specialization FROM workers WHERE id = $1", [req.params.workerId]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const lang = worker.preferred_language || "en";
    res.json({ language: lang, languageName: LANG_NAMES[lang] || lang });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/translate/preference — set worker language preference
router.patch("/translate/preference", requireAuth, async (req, res) => {
  try {
    const { workerId, language } = req.body as { workerId?: string; language?: string };
    if (!workerId || !language) return res.status(400).json({ error: "workerId and language required" });
    if (!LANGUAGES.find(l => l.code === language)) return res.status(400).json({ error: "Unsupported language" });

    await execute("UPDATE workers SET preferred_language = $1 WHERE id = $2", [language, workerId]);
    res.json({ ok: true, language });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// Export for use in other modules (WhatsApp, email, etc)
export { translateText, NATIONALITY_LANG, LANG_NAMES };

export default router;
