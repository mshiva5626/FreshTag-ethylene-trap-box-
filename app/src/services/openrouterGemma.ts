import { FruitPreset } from '../data/fruitPresets';
import { SpecimenData } from './geminiNutrition';
import { getFruitRealImage } from '../utils/fruitImages';

export function getOpenRouterApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_API_KEY) {
    return import.meta.env.VITE_OPENROUTER_API_KEY;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('freshguard_openrouter_api_key');
    if (stored) return stored;
  }
  return '';
}

const CANDIDATE_GEMMA_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'openrouter/free',
];

function cleanJsonText(raw: string): any {
  let cleaned = raw.trim();
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

/**
 * Calls OpenRouter with Google Gemma 4 31B (with auto-fallback to openrouter/free)
 */
export async function callOpenRouterGemma(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const messages: any[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  let lastError: Error | null = null;
  for (const model of CANDIDATE_GEMMA_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://freshguard.app',
          'X-Title': 'FreshGuard Precision Storage',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[OpenRouterGemma] Model ${model} returned ${response.status}: ${errText}`);
        lastError = new Error(`OpenRouter ${model} HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return content;
      }
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[OpenRouterGemma] Error with ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All OpenRouter models failed to respond');
}

/**
 * Botanical Fruit Presets Management:
 * Generates an empirical preservation profile using Gemma 4 31B
 */
export async function generateGemmaFruitPreset(fruitName: string): Promise<FruitPreset> {
  const prompt = `You are an expert Post-Harvest Physiologist specializing in the FreshGuard Ethylene Trap Box platform.
Create a scientifically accurate botanical storage and catalytic VOC scrubbing preset for: "${fruitName}".
Return ONLY a valid JSON object matching this schema:
{
  "name": "${fruitName}",
  "category": "Climacteric" or "Non-Climacteric" or "High-Respiration",
  "temp_min": 10.0,
  "temp_max": 13.0,
  "humidity_min": 85.0,
  "humidity_max": 90.0,
  "gas_threshold": 180,
  "shelf_life_gain": "+7 to +12 Days",
  "ethylene_sensitivity": "Extreme" or "High" or "Moderate" or "Low",
  "tips": "Detailed scientific post-harvest advice explaining chilling thresholds and ethylene response.",
  "respirationRate": "Respiration rate in mg CO2/kg-h and qualitative speed"
}`;

  const rawText = await callOpenRouterGemma(
    prompt,
    'You are a post-harvest horticultural specialist. Return ONLY pure JSON.'
  );

  const parsed = cleanJsonText(rawText);
  const id = fruitName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
  const realImageUrl = getFruitRealImage(fruitName);

  return {
    id,
    name: parsed.name || fruitName,
    emoji: '🌱', // kept for fallback typing
    category: parsed.category || 'Climacteric',
    temp_min: Number((Number(parsed.temp_min) || 4.0).toFixed(1)),
    temp_max: Number((Number(parsed.temp_max) || 8.0).toFixed(1)),
    humidity_min: Number((Number(parsed.humidity_min) || 85.0).toFixed(1)),
    humidity_max: Number((Number(parsed.humidity_max) || 92.0).toFixed(1)),
    gas_threshold: Math.round(Number(parsed.gas_threshold) || 180),
    shelf_life_gain: parsed.shelf_life_gain || '+6 to +10 Days',
    ethylene_sensitivity: parsed.ethylene_sensitivity || 'High',
    tips: parsed.tips || 'Regulated catalytic VOC scrubbing optimizes cell-wall preservation.',
    respirationRate: parsed.respirationRate || 'Moderate (20-30 mg CO₂/kg·h)',
    realImageUrl,
  };
}

/**
 * Fallback for Nutrition AI when Gemini key limits or quota are exceeded.
 */
export async function generateGemmaNutritionAnalysis(query: string): Promise<SpecimenData> {
  const prompt = `You are an expert USDA Nutritionist and Post-Harvest Physiologist for FreshGuard.
Analyze this botanical produce: "${query}".
Return ONLY valid JSON matching this schema:
{
  "name": "${query}",
  "scientificName": "Binomial species name",
  "category": "Climacteric / Non-Climacteric",
  "freshnessScore": 95,
  "ripeness": "Ripeness and Brix description",
  "ethyleneOutput": "Respiration and ethylene rate",
  "ambientShelfLife": "3–4 Days",
  "vaultShelfLife": "14–20 Days",
  "portionGrams": 150,
  "calories": 80,
  "protein_g": 1.0,
  "fiber_g": 3.0,
  "vitaminC_mg": 20.0,
  "potassium_mg": 250,
  "antioxidants": 2000,
  "keyNutrientHighlight": "Clinical nutrition highlight",
  "recommendedVaultTemp": 5.0,
  "recommendedHumidity": 90.0,
  "recommendedGasThreshold": 180,
  "aiAnalysisNotes": "Post-harvest physiological insights generated by FreshGuard Botanical AI Engine."
}`;

  const rawText = await callOpenRouterGemma(prompt);
  const parsed = cleanJsonText(rawText);
  const realImageUrl = getFruitRealImage(parsed.name || query);

  return {
    id: 'gemma-' + (parsed.name || query).toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36),
    name: parsed.name || query,
    scientificName: parsed.scientificName || 'Plantae Botanical',
    emoji: '🌱',
    category: parsed.category || 'Fresh Produce',
    freshnessScore: Number(parsed.freshnessScore) || 94,
    ripeness: parsed.ripeness || 'Optimal Harvest Stage',
    ethyleneOutput: parsed.ethyleneOutput || '1.8 µL/kg·h (Moderate)',
    ambientShelfLife: parsed.ambientShelfLife || '3–4 Days',
    vaultShelfLife: parsed.vaultShelfLife || '14–21 Days',
    portionGrams: Number(parsed.portionGrams) || 140,
    calories: Math.round(Number(parsed.calories) || 75),
    protein_g: Number((Number(parsed.protein_g) || 1.0).toFixed(1)),
    fiber_g: Number((Number(parsed.fiber_g) || 2.8).toFixed(1)),
    vitaminC_mg: Math.round(Number(parsed.vitaminC_mg) || 20),
    potassium_mg: Math.round(Number(parsed.potassium_mg) || 240),
    antioxidants: Math.round(Number(parsed.antioxidants) || 2200),
    keyNutrientHighlight: parsed.keyNutrientHighlight || 'Rich in vitamins and antioxidants',
    recommendedVaultTemp: Number((Number(parsed.recommendedVaultTemp) || 4.0).toFixed(1)),
    recommendedHumidity: Number((Number(parsed.recommendedHumidity) || 90.0).toFixed(1)),
    recommendedGasThreshold: Math.round(Number(parsed.recommendedGasThreshold) || 180),
    aiAnalysisNotes: (parsed.aiAnalysisNotes || 'Calibrated via FreshGuard Botanical AI Engine.') + ' (Horticultural Neural Core)',
    imageUrl: realImageUrl,
    source: 'gemini-text',
  };
}
