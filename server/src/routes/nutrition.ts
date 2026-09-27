import { Router, Request, Response } from 'express';

const router = Router();

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || '';
}

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const NUTRITION_SYSTEM_PROMPT = `You are an expert Post-Harvest Physiologist and USDA Clinical Nutritionist specialized in the FreshGuard Ethylene Trap & Freshness Preservation platform.
Analyze botanical produce specimens accurately based on empirical horticultural post-harvest science and USDA FoodData Central.

You must return ONLY a valid JSON object matching this exact schema:
{
  "name": "Cultivar and Produce Common Name (e.g. Honeycrisp Apple)",
  "scientificName": "Binomial botanical nomenclature (e.g. Malus domestica)",
  "emoji": "Single most accurate emoji",
  "category": "e.g. Climacteric Pome / Climacteric Tropical / Non-Climacteric Drupe / Leafy Brassica",
  "freshnessScore": 95,
  "ripeness": "Concise physical ripeness state and soluble solids Brix (e.g. Firm Crisp, Brix 14.5°)",
  "ethyleneOutput": "e.g. 1.9 µL/kg·h (Moderate Respiration)",
  "ambientShelfLife": "e.g. 4–5 Days",
  "vaultShelfLife": "e.g. 21–28 Days",
  "portionGrams": 150,
  "calories": 80,
  "protein_g": 0.5,
  "fiber_g": 3.6,
  "vitaminC_mg": 12.0,
  "potassium_mg": 180,
  "antioxidants": 2200,
  "keyNutrientHighlight": "Concise sentence highlighting key phytonutrients, vitamins, and health benefits",
  "recommendedVaultTemp": 3.0,
  "recommendedHumidity": 90.0,
  "recommendedGasThreshold": 180,
  "aiAnalysisNotes": "Scientific post-harvest notes on respiration, chilling injury sensitivity, and ethylene mitigation"
}`;

router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, image, mimeType } = req.body;

    if (!query && !image) {
      res.status(400).json({ error: 'Either query text or image base64 is required' });
      return;
    }

    const apiKey = getApiKey();
    const parts: any[] = [];

    if (image) {
      const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;
      const detectedMime = mimeType || (image.startsWith('data:') ? image.split(';')[0].replace('data:', '') : 'image/jpeg');

      parts.push({
        text: `${NUTRITION_SYSTEM_PROMPT}\n\nExamine this botanical produce image carefully. ${query ? `Context hint: ${query}` : ''} Identify cultivar, inspect surface morphology, estimate freshness score (1-100), and calculate USDA nutrition and FreshGuard chamber setpoints.`
      });
      parts.push({
        inlineData: {
          mimeType: detectedMime,
          data: cleanBase64,
        }
      });
    } else {
      parts.push({
        text: `${NUTRITION_SYSTEM_PROMPT}\n\nAnalyze this botanical produce specimen accurately: "${query}".`
      });
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    let lastError = null;
    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          lastError = new Error(`Model ${model} returned HTTP ${response.status}`);
          continue;
        }

        const data: any = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          let cleaned = rawText.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
          }
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          const result = JSON.parse(cleaned);
          res.status(200).json({ success: true, model, data: result });
          return;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    res.status(502).json({
      error: 'AI Generation Failed',
      message: lastError ? (lastError as Error).message : 'All Gemini models failed'
    });
  } catch (err: any) {
    console.error('[Nutrition Analysis Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
