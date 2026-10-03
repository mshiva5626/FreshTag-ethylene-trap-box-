import { Router, Request, Response } from 'express';

const router = Router();

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || '';
}

const CANDIDATE_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
];

const NUTRITION_SYSTEM_PROMPT = `You are an expert Post-Harvest Physiologist, Produce Quality Inspector, and USDA Clinical Nutritionist specialized in the FreshGuard Ethylene Trap & Freshness Preservation platform.
Analyze botanical produce specimens with HIGH ACCURACY using empirical horticultural post-harvest science, USDA FoodData Central, and visual defect detection.

CRITICAL DEFECT ANALYSIS RULES:
- Carefully examine the ENTIRE surface of the produce for: dark spots, black patches, bruising, mold, fungal lesions, rot zones, mechanical damage, pest damage, scald lesions, and discoloration patches.
- For each defect found, estimate its bounding box as a percentage of the image (xPct, yPct = top-left corner; wPct, hPct = width/height as % of image).
- Quantify how each defect category DECREASES or INCREASES specific nutrients (e.g. brown rot decreases vitamin C by ~25%, bruised tissue has elevated ethylene which accelerates antioxidant degradation).
- The nutrient values you report MUST already reflect the degraded/affected state given observed defects.
- Assign a quality grade: A (no defects, >90% fresh), B (minor surface blemishes, 75-90%), C (moderate degradation, 50-75%), D (<50% usable, significant rot or mold).

You must return ONLY a valid JSON object matching this exact schema:
{
  "name": "Cultivar and Produce Common Name (e.g. Honeycrisp Apple)",
  "scientificName": "Binomial botanical nomenclature (e.g. Malus domestica)",
  "emoji": "Single most accurate emoji",
  "category": "e.g. Climacteric Pome / Climacteric Tropical / Non-Climacteric Drupe / Leafy Brassica",
  "freshnessScore": 95,
  "qualityGrade": "A",
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
  "aiAnalysisNotes": "Scientific post-harvest notes on respiration, chilling injury sensitivity, and ethylene mitigation",
  "defects": [
    {
      "type": "e.g. Brown Rot / Black Spot / Bruising / Fungal Mold / Scald / Mechanical Damage",
      "severity": "Minor | Moderate | Severe",
      "description": "Precise description of the defect, location on fruit, and estimated area affected",
      "xPct": 30.5,
      "yPct": 20.0,
      "wPct": 15.0,
      "hPct": 12.0,
      "nutrientImpact": [
        { "nutrient": "Vitamin C", "changeDirection": "decrease", "changePct": 18, "reason": "Oxidative enzymes in bruised tissue degrade ascorbic acid" },
        { "nutrient": "Antioxidants", "changeDirection": "decrease", "changePct": 22, "reason": "Phenolic compound oxidation in damaged cells" }
      ]
    }
  ],
  "overallNutrientImpactSummary": "e.g. Observed brown spot reduces Vitamin C by ~18% and antioxidants by ~22% from USDA baseline for this cultivar. Remaining flesh retains full potassium and fiber content.",
  "consumerSafetyNote": "e.g. Safe to consume after trimming affected area. / Discard immediately — extensive mold penetration. / Minor blemish is cosmetic only, full nutritional value intact."
}

IMPORTANT ACCURACY RULES:
1. If NO defects are detected, return defects as an empty array [].
2. Nutrient values in the main fields (calories, vitaminC_mg, etc.) must reflect the ACTUAL current state, factoring in defect degradation.
3. Bounding box coordinates (xPct, yPct, wPct, hPct) must be the best estimate from what is visible in the image — they will be used to draw overlay rectangles.
4. Be scientifically precise about which nutrients are affected and by how much (cite mechanism).
5. qualityGrade must be one of: A, B, C, D.
6. Do NOT wrap output with backticks or markdown; return pure JSON.`;

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
        text: `${NUTRITION_SYSTEM_PROMPT}\n\nExamine this botanical produce image with MAXIMUM PRECISION. ${query ? `Context hint from user: "${query}".` : ''}

1. Identify the exact cultivar.
2. CAREFULLY scan every pixel of the surface for defects: dark spots, black patches, mold, bruising, rot, scald, mechanical damage.
3. For each defect, provide bounding box coordinates as percentage of image dimensions (xPct, yPct, wPct, hPct).
4. Quantify the nutrient impact of each defect with scientific reasoning.
5. Adjust all nutrient values to reflect actual degraded state.
6. Assign quality grade A/B/C/D.
7. Provide consumer safety guidance.
8. Calculate precise USDA nutrition and FreshGuard chamber setpoints.`
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
        // Note: do NOT set responseMimeType here — it causes empty text responses
        // on some Gemini versions when combined with multimodal (image) input.
        temperature: 0.15,
        maxOutputTokens: 4096,
      },
    };

    let lastError: any = null;
    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.warn(`[Nutrition] Model ${model} HTTP ${response.status}:`, errBody.slice(0, 200));
          lastError = new Error(`Model ${model} returned HTTP ${response.status}: ${errBody.slice(0, 100)}`);
          continue;
        }

        const data: any = await response.json();

        // Check for safety/block reasons
        const blockReason = data.candidates?.[0]?.finishReason;
        if (blockReason && blockReason !== 'STOP' && blockReason !== 'MAX_TOKENS') {
          console.warn(`[Nutrition] Model ${model} blocked: ${blockReason}`);
          lastError = new Error(`Model ${model} blocked: ${blockReason}`);
          continue;
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          console.warn(`[Nutrition] Model ${model} returned empty text. Full response:`, JSON.stringify(data).slice(0, 400));
          lastError = new Error(`Model ${model} returned empty content`);
          continue;
        }

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
        console.log(`[Nutrition] Success with model: ${model}, defects found: ${result.defects?.length ?? 0}`);
        res.status(200).json({ success: true, model, data: result });
        return;
      } catch (err: any) {
        console.warn(`[Nutrition] Exception with model ${model}:`, err.message);
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
