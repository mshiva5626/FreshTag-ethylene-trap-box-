import { FRUIT_PRESETS } from '../data/fruitPresets';
import { generateGemmaNutritionAnalysis } from './openrouterGemma';
import { getFruitRealImage } from '../utils/fruitImages';

export interface SpecimenData {
  id: string;
  name: string;
  scientificName: string;
  emoji: string;
  category: string;
  freshnessScore: number;
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
}

Important Guidelines:
1. Ensure all numbers are realistic based on standard portion size (typically 1 medium fruit/portion ~100-180g).
2. For fresh fruit, antioxidants should be realistic ORAC units (typically 1,000–6,000 ORAC).
3. recommendedVaultTemp should be in Celsius (e.g. 1.0-4.0°C for pome/berries, 10.0-13.0°C for chilling-sensitive tropicals like bananas and mangoes).
4. recommendedHumidity should be realistic (85.0-95.0%).
5. recommendedGasThreshold should be an index between 100 and 300 (lower means more sensitive to ethylene).
6. Do NOT wrap output with backticks or markdown if possible; return pure JSON.`;

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
  return {
    id: 'ai-' + (parsed.name || 'produce').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36),
    name: parsed.name || 'Botanical Specimen',
    scientificName: parsed.scientificName || 'Plantae',
    emoji: parsed.emoji || '🌱',
    category: parsed.category || 'Fresh Produce',
    freshnessScore: Number(parsed.freshnessScore) || 94,
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
    imageUrl: imageUrl || getFruitRealImage(parsed.name),
    source,
  };
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
    const userPrompt = `Examine this botanical produce image carefully.
${userHint ? `Context hint from user: "${userHint}".` : ''}
1. Identify the exact fruit or vegetable cultivar.
2. Inspect morphological indicators: surface coloration, turgidity, skin blemishes, peel luster, stem freshness, or bruising.
3. Determine visual freshness score (1-100) and ripeness stage based on empirical cues.
4. Calculate USDA nutritional composition for 1 typical serving portion.
5. Provide precise post-harvest storage parameters for the FreshGuard ethylene vault chamber.`;

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
    return formatSpecimenData(parsed, 'gemini-vision', previewUrl);
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
