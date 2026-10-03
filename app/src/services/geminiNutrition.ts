import { FRUIT_PRESETS } from '../data/fruitPresets';
import { generateGemmaNutritionAnalysis } from './openrouterGemma';
import { getFruitRealImage } from '../utils/fruitImages';

export interface DefectNutrientImpact {
  nutrient: string;
  changeDirection: 'increase' | 'decrease';
  changePct: number;
  reason: string;
}

export interface ProduceDefect {
  type: string;
  severity: 'Minor' | 'Moderate' | 'Severe';
  description: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  nutrientImpact: DefectNutrientImpact[];
}

export interface SpecimenData {
  id: string;
  name: string;
  scientificName: string;
  emoji: string;
  category: string;
  freshnessScore: number;
  qualityGrade?: 'A' | 'B' | 'C' | 'D';
  ripeness: string;
  ethyleneOutput: string;
  ambientShelfLife: string;
  vaultShelfLife: string;
  portionGrams: number;
  calories: number;
  protein_g: number;
  fiber_g: number;
  vitaminC_mg: number;
  potassium_mg: number;
  antioxidants: number;
  keyNutrientHighlight: string;
  recommendedVaultTemp: number;
  recommendedHumidity: number;
  recommendedGasThreshold: number;
  aiAnalysisNotes?: string;
  defects?: ProduceDefect[];
  overallNutrientImpactSummary?: string;
  consumerSafetyNote?: string;
  annotatedImageUrl?: string;
  imageUrl?: string;
  source?: 'gemini-vision' | 'gemini-text' | 'preset';
}

export function getGeminiApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('freshguard_gemini_api_key');
    if (stored) return stored;
  }
  return '';
}

const CANDIDATE_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-flash-latest',
];

const NUTRITION_SYSTEM_PROMPT = `You are an expert Post-Harvest Physiologist, Produce Quality Inspector, and USDA Clinical Nutritionist specialized in the FreshGuard Ethylene Trap & Freshness Preservation platform.
Analyze botanical produce specimens with HIGH ACCURACY using empirical horticultural post-harvest science, USDA FoodData Central, and visual defect detection.

CRITICAL DEFECT ANALYSIS RULES:
- Carefully examine the ENTIRE surface of the produce for: dark spots, black patches, bruising, mold, fungal lesions, rot zones, mechanical damage, pest damage, scald lesions, and discoloration patches.
- For each defect found, estimate its bounding box as a percentage of the image (xPct, yPct = top-left corner; wPct, hPct = width/height as % of image).
- Quantify how each defect DECREASES or INCREASES specific nutrients (e.g. brown rot decreases vitamin C by ~25%, bruised tissue has elevated ethylene which accelerates antioxidant degradation).
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
      "description": "Precise description of the defect, its location on fruit, and estimated surface area affected",
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
  "overallNutrientImpactSummary": "e.g. Observed brown spot reduces Vitamin C by ~18% and antioxidants by ~22% from USDA baseline. Remaining flesh retains full potassium and fiber.",
  "consumerSafetyNote": "e.g. Safe to consume after trimming affected area. / Discard immediately — extensive mold. / Minor blemish is cosmetic only, full nutritional value intact."
}

IMPORTANT ACCURACY RULES:
1. If NO defects are detected, return defects as an empty array [].
2. Nutrient values in the main fields MUST reflect the ACTUAL current state factoring in any observed degradation.
3. Bounding box coordinates (xPct, yPct, wPct, hPct) will be used to draw overlay rectangles on the image — be as accurate as possible.
4. Be scientifically precise about which nutrients are affected and by how much (cite mechanism).
5. qualityGrade must be exactly one of: A, B, C, or D.
6. Ensure all numbers are realistic (portion 100-180g, antioxidants 1000-6000 ORAC, temps in Celsius).
7. Do NOT wrap output with backticks or markdown; return pure JSON.`;

/**
 * Resizes and compresses an image in the browser to max dimension 1024px
 * for optimal upload speed and Gemini multimodal analysis.
 */
export async function optimizeImageForAnalysis(
  fileOrDataUrl: File | string,
  maxDimension = 1024,
  quality = 0.85
): Promise<{ base64Data: string; mimeType: string; previewUrl: string }> {
  // Support server-side / node testing environments where document/Image is not defined
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (typeof fileOrDataUrl === 'string') {
      const mimeType = fileOrDataUrl.startsWith('data:')
        ? fileOrDataUrl.split(';')[0].replace('data:', '')
        : 'image/jpeg';
      const base64Data = fileOrDataUrl.includes(',')
        ? fileOrDataUrl.split(',')[1]
        : fileOrDataUrl;
      return { base64Data, mimeType, previewUrl: fileOrDataUrl };
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Canvas 2D context unavailable'));
      }

      ctx.drawImage(img, 0, 0, width, height);
      const mimeType = 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64Data = dataUrl.split(',')[1];

      resolve({
        base64Data,
        mimeType,
        previewUrl: dataUrl,
      });
    };

    img.onerror = (err) => reject(new Error('Failed to load image: ' + err));

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

function parseGeminiJson(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

function formatSpecimenData(parsed: any, source: 'gemini-vision' | 'gemini-text', imageUrl?: string): SpecimenData {
  // Sanitize defects array
  const defects: ProduceDefect[] = Array.isArray(parsed.defects)
    ? parsed.defects.map((d: any) => ({
        type: d.type || 'Unknown Defect',
        severity: (['Minor', 'Moderate', 'Severe'].includes(d.severity) ? d.severity : 'Minor') as 'Minor' | 'Moderate' | 'Severe',
        description: d.description || '',
        xPct: Number(d.xPct) || 0,
        yPct: Number(d.yPct) || 0,
        wPct: Number(d.wPct) || 10,
        hPct: Number(d.hPct) || 10,
        nutrientImpact: Array.isArray(d.nutrientImpact)
          ? d.nutrientImpact.map((ni: any) => ({
              nutrient: ni.nutrient || 'Unknown',
              changeDirection: ni.changeDirection === 'increase' ? 'increase' : 'decrease',
              changePct: Number(ni.changePct) || 0,
              reason: ni.reason || '',
            }))
          : [],
      }))
    : [];

  const qualityGradeRaw = parsed.qualityGrade;
  const qualityGrade = (['A', 'B', 'C', 'D'].includes(qualityGradeRaw) ? qualityGradeRaw : undefined) as 'A' | 'B' | 'C' | 'D' | undefined;

  return {
    id: 'ai-' + (parsed.name || 'produce').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36),
    name: parsed.name || 'Botanical Specimen',
    scientificName: parsed.scientificName || 'Plantae',
    emoji: parsed.emoji || '🌱',
    category: parsed.category || 'Fresh Produce',
    freshnessScore: Number(parsed.freshnessScore) || 94,
    qualityGrade,
    ripeness: parsed.ripeness || 'Optimal Harvest Stage',
    ethyleneOutput: parsed.ethyleneOutput || '1.5 µL/kg·h (Moderate)',
    ambientShelfLife: parsed.ambientShelfLife || '3–4 Days',
    vaultShelfLife: parsed.vaultShelfLife || '14–20 Days',
    portionGrams: Number(parsed.portionGrams) || 120,
    calories: Math.round(Number(parsed.calories) || 60),
    protein_g: Number((Number(parsed.protein_g) || 1.0).toFixed(1)),
    fiber_g: Number((Number(parsed.fiber_g) || 2.5).toFixed(1)),
    vitaminC_mg: Math.round(Number(parsed.vitaminC_mg) || 15),
    potassium_mg: Math.round(Number(parsed.potassium_mg) || 220),
    antioxidants: Math.round(Number(parsed.antioxidants) || 1800),
    keyNutrientHighlight:
      parsed.keyNutrientHighlight || 'Rich in essential micronutrients and bioactive antioxidants',
    recommendedVaultTemp: Number((Number(parsed.recommendedVaultTemp) || 4.0).toFixed(1)),
    recommendedHumidity: Number((Number(parsed.recommendedHumidity) || 90.0).toFixed(1)),
    recommendedGasThreshold: Math.round(Number(parsed.recommendedGasThreshold) || 180),
    aiAnalysisNotes: parsed.aiAnalysisNotes || 'Optimized for catalytic ethylene decomposition in FreshGuard vault.',
    defects,
    overallNutrientImpactSummary: parsed.overallNutrientImpactSummary || undefined,
    consumerSafetyNote: parsed.consumerSafetyNote || undefined,
    imageUrl: imageUrl || getFruitRealImage(parsed.name),
    source,
  };
}

/**
 * Renders defect bounding boxes onto a copy of the captured image using Canvas,
 * returning a new data URL with the annotation overlay.
 */
export async function annotateImageWithDefects(
  imageDataUrl: string,
  defects: ProduceDefect[]
): Promise<string> {
  if (!defects || defects.length === 0 || typeof document === 'undefined') return imageDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(imageDataUrl); return; }

      ctx.drawImage(img, 0, 0);

      defects.forEach((defect) => {
        const x = (defect.xPct / 100) * canvas.width;
        const y = (defect.yPct / 100) * canvas.height;
        const w = (defect.wPct / 100) * canvas.width;
        const h = (defect.hPct / 100) * canvas.height;

        const color =
          defect.severity === 'Severe' ? '#ef4444' :
          defect.severity === 'Moderate' ? '#f97316' : '#eab308';

        // Semi-transparent fill
        ctx.fillStyle = color.replace(')', ', 0.18)').replace('rgb(', 'rgba(').replace('#', '');
        // Use hex with alpha via globalAlpha instead
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1.0;

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, canvas.width * 0.003);
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        // Label background
        const labelFontSize = Math.max(11, Math.round(canvas.width * 0.018));
        ctx.font = `bold ${labelFontSize}px system-ui, sans-serif`;
        const labelText = `⚠ ${defect.type} (${defect.severity})`;
        const textMetrics = ctx.measureText(labelText);
        const labelW = textMetrics.width + 10;
        const labelH = labelFontSize + 8;
        const labelY = y > labelH + 4 ? y - labelH - 2 : y + 2;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.roundRect(x, labelY, labelW, labelH, 4);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x + 5, labelY + labelFontSize + 1);
      });

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}

/**
 * Executes a Gemini request with automatic fallback across available flash models
 */
async function callGemini(payload: any): Promise<any> {
  const apiKey = getGeminiApiKey();
  let lastError: Error | null = null;

  if (apiKey) {
    for (const model of CANDIDATE_MODELS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          console.warn(`[GeminiNutrition] Model ${model} returned ${response.status}: ${errorBody}`);
          lastError = new Error(`Gemini ${model} HTTP ${response.status}`);
          continue; // try next model
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          const rawText = data.candidates[0].content.parts[0].text;
          return parseGeminiJson(rawText);
        } else {
          lastError = new Error('Empty candidates response from Gemini');
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn(`[GeminiNutrition] Error with ${model}:`, err.message);
        lastError = err;
      }
    }
  }

  // Attempt backend proxy endpoint /api/nutrition/analyze (utilizes server GEMINI_API_KEY on Render)
  try {
    const isImage = !!payload?.contents?.[0]?.parts?.find((p: any) => p.inlineData);
    let bodyData: any = {};
    if (isImage) {
      const inline = payload.contents[0].parts.find((p: any) => p.inlineData).inlineData;
      bodyData = { image: inline.data, mimeType: inline.mimeType };
    } else {
      const textPart = payload?.contents?.[0]?.parts?.[0]?.text || '';
      bodyData = { query: textPart };
    }

    const res = await fetch('/api/nutrition/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.data) return json.data;
    }
  } catch (backendErr) {
    console.warn('[GeminiNutrition] Backend proxy fallback failed:', backendErr);
  }

  throw lastError || new Error('All Gemini models failed to return content');
}

/**
 * Analyzes a produce image (from camera capture or file upload) using Gemini Vision.
 * If Gemini quota/key limits are reached, falls back to Google Gemma 4 31B.
 */
export async function analyzeProduceImage(
  fileOrDataUrl: File | string,
  userHint?: string
): Promise<SpecimenData> {
  const { base64Data, mimeType, previewUrl } = await optimizeImageForAnalysis(fileOrDataUrl);
  try {
    const userPrompt = `Examine this botanical produce image with MAXIMUM PRECISION AND SCIENTIFIC ACCURACY.
${userHint ? `Context hint from user: "${userHint}".` : ''}

1. Identify the EXACT cultivar (not just species — identify variety if visible).
2. METICULOUSLY scan the ENTIRE visible surface for any defects: dark spots, black patches, mold growth, bruising, soft rots, bacterial lesions, mechanical abrasions, scald marks, insect damage, or discoloration.
3. For EACH defect detected, provide precise bounding box coordinates as percentages of the total image dimensions (xPct, yPct for top-left corner; wPct, hPct for box dimensions).
4. Quantify the nutrient degradation caused by each defect with biochemical reasoning (e.g. which specific nutrients decrease/increase and by what percentage).
5. Determine visual freshness score (1-100) AND quality grade (A/B/C/D) based on defect severity and coverage.
6. Calculate USDA nutritional composition for 1 typical serving — values MUST already reflect any nutrient loss from observed defects.
7. Provide precise post-harvest storage parameters for the FreshGuard ethylene vault chamber.
8. Give clear consumer safety guidance (trim and eat / discard / fully safe).
9. Summarize the overall nutrient impact in one paragraph for consumer awareness.`;

    const payload = {
      contents: [
        {
          parts: [
            { text: `${NUTRITION_SYSTEM_PROMPT}\n\n${userPrompt}` },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const parsed = await callGemini(payload);
    const specimen = formatSpecimenData(parsed, 'gemini-vision', previewUrl);
    // Annotate the preview image with defect bounding boxes
    if (specimen.defects && specimen.defects.length > 0) {
      specimen.annotatedImageUrl = await annotateImageWithDefects(previewUrl, specimen.defects);
    }
    return specimen;
  } catch (err) {
    console.warn('[GeminiNutrition] Gemini vision call exceeded quota or failed. Invoking Google Gemma 4 31B fallback...', err);
    try {
      const gemmaResult = await generateGemmaNutritionAnalysis(userHint || 'Fresh Harvest Specimen');
      gemmaResult.imageUrl = previewUrl;
      gemmaResult.aiAnalysisNotes = (gemmaResult.aiAnalysisNotes || '') + ' (Analyzed via Secondary Botanical AI Engine)';
      return gemmaResult;
    } catch (gemmaErr) {
      console.error('[GeminiNutrition] Gemma fallback also failed:', gemmaErr);
      return fallbackToPreset(userHint || 'Apple', 'Vision analysis encountered an error. Applied USDA preset.');
    }
  }
}

/**
 * Analyzes produce by name or botanical query using Gemini.
 * If Gemini quota/key limits are reached, seamlessly cascades to Google Gemma 4 31B.
 */
export async function analyzeProduceText(produceName: string): Promise<SpecimenData> {
  try {
    const userPrompt = `Analyze this botanical produce specimen accurately: "${produceName}".
Evaluate its taxonomy, post-harvest respiration kinetics, ethylene sensitivity, USDA macronutrient/micronutrient profile for 1 standard serving, and ideal FreshGuard chamber environmental setpoints.`;

    const payload = {
      contents: [
        {
          parts: [{ text: `${NUTRITION_SYSTEM_PROMPT}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const parsed = await callGemini(payload);
    return formatSpecimenData(parsed, 'gemini-text');
  } catch (err) {
    console.warn('[GeminiNutrition] Gemini key limit reached or failed. Invoking Google Gemma 4 31B fallback...', err);
    try {
      return await generateGemmaNutritionAnalysis(produceName);
    } catch (gemmaErr) {
      console.error('[GeminiNutrition] Gemma fallback failed:', gemmaErr);
      return fallbackToPreset(produceName, 'AI service timed out. Loaded calibrated horticultural preset.');
    }
  }
}

/**
 * Graceful fallback to botanical presets
 */
function fallbackToPreset(keyword: string, fallbackReason: string): SpecimenData {
  const lower = keyword.toLowerCase();
  const match =
    FRUIT_PRESETS.find(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.id.toLowerCase().includes(lower) ||
        lower.includes(p.name.toLowerCase().split(' ')[0])
    ) || FRUIT_PRESETS[0];

  return {
    id: 'preset-' + match.id + '-' + Date.now(),
    name: match.name,
    scientificName: 'Plantae Horticultura',
    emoji: match.emoji,
    category: `${match.category} Produce`,
    freshnessScore: 94,
    ripeness: 'Firm Harvest Peak',
    ethyleneOutput: match.respirationRate || '1.8 µL/kg·h',
    ambientShelfLife: '3–4 Days',
    vaultShelfLife: match.shelf_life_gain || '+7 to +10 Days',
    portionGrams: 140,
    calories: 85,
    protein_g: 0.8,
    fiber_g: 3.2,
    vitaminC_mg: 18,
    potassium_mg: 240,
    antioxidants: 2200,
    keyNutrientHighlight: match.tips.slice(0, 80) + '...',
    recommendedVaultTemp: (match.temp_min + match.temp_max) / 2,
    recommendedHumidity: (match.humidity_min + match.humidity_max) / 2,
    recommendedGasThreshold: match.gas_threshold,
    aiAnalysisNotes: `${fallbackReason} ${match.tips}`,
    source: 'preset',
  };
}
