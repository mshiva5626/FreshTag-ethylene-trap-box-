/**
 * Smart FreshGuard - Modular Crop Presets & Agronomic Thresholds Database
 */

export const CROP_PRESETS = {
  apples: {
    id: "apples",
    name: "Apples (Malus domestica)",
    icon: "🍎",
    temp_min: 1.0,
    temp_max: 4.0,
    temp_target: 2.5,
    humidity_min: 90,
    humidity_max: 95,
    gas_threshold: 230,
    gas_critical: 350,
    blue_light_recommended: true,
    blue_light_duration_mins: 30,
    category: "Climacteric / Ethylene Producer",
    base_shelf_life_days: 90,
    ambient_shelf_life_days: 14,
    ethylene_sensitivity: "High",
    respiration_rate: "Moderate",
    chilling_threshold: 0.0,
    q10_factor: 2.2,
    farmer_tip: "Apples synthesize significant ethylene. Purge chamber air regularly to prevent softening and scald disorder. High humidity (90-95%) stops skin shriveling.",
    description: "Apples produce significant ethylene and are sensitive to internal breakdown if ethylene accumulates. Keep humidity high to prevent skin shriveling."
  },
  bananas: {
    id: "bananas",
    name: "Bananas (Musa acuminata)",
    icon: "🍌",
    temp_min: 13.0,
    temp_max: 15.0,
    temp_target: 14.0,
    humidity_min: 85,
    humidity_max: 90,
    gas_threshold: 210,
    gas_critical: 310,
    blue_light_recommended: false,
    blue_light_duration_mins: 0,
    category: "Climacteric / Chilling Sensitive",
    base_shelf_life_days: 28,
    ambient_shelf_life_days: 6,
    ethylene_sensitivity: "Extreme",
    respiration_rate: "Very High",
    chilling_threshold: 12.0,
    q10_factor: 2.5,
    farmer_tip: "CHILLING SENSITIVE! Never cool bananas below 12.0°C to prevent dark peel discoloration. Maintain continuous air circulation to flush trace ethylene.",
    description: "Highly sensitive to ethylene-induced ripening. Temperatures below 12°C cause severe peel browning and chilling injury."
  },
  tomatoes: {
    id: "tomatoes",
    name: "Tomatoes (Solanum lycopersicum)",
    icon: "🍅",
    temp_min: 10.0,
    temp_max: 13.0,
    temp_target: 11.5,
    humidity_min: 85,
    humidity_max: 90,
    gas_threshold: 260,
    gas_critical: 380,
    blue_light_recommended: true,
    blue_light_duration_mins: 20,
    category: "Climacteric",
    base_shelf_life_days: 24,
    ambient_shelf_life_days: 7,
    ethylene_sensitivity: "Moderate",
    respiration_rate: "Moderate",
    chilling_threshold: 10.0,
    q10_factor: 2.1,
    farmer_tip: "Store at 10-13°C. Temperatures below 10°C impair aroma volatile synthesis and cause mealiness. Blue light inhibits stem fungal mold.",
    description: "Moderate temperature preserves aromatic volatiles and lycopene synthesis without inducing chilling disorder."
  },
  leafy_greens: {
    id: "leafy_greens",
    name: "Leafy Greens (Spinach & Lettuce)",
    icon: "🥬",
    temp_min: 0.5,
    temp_max: 3.5,
    temp_target: 1.5,
    humidity_min: 95,
    humidity_max: 98,
    gas_threshold: 180,
    gas_critical: 280,
    blue_light_recommended: true,
    blue_light_duration_mins: 25,
    category: "Non-Climacteric / Moisture Sensitive",
    base_shelf_life_days: 21,
    ambient_shelf_life_days: 3,
    ethylene_sensitivity: "High (Yellowing)",
    respiration_rate: "High",
    chilling_threshold: 0.0,
    q10_factor: 2.8,
    farmer_tip: "Trace ethylene induces rapid chlorophyll loss (yellowing). Keep chamber near 95-98% RH to avoid moisture transpirational weight loss.",
    description: "Extremely susceptible to dehydration and yellowing (senescence). Near-saturation relative humidity is essential."
  },
  strawberries: {
    id: "strawberries",
    name: "Strawberries (Fragaria × ananassa)",
    icon: "🍓",
    temp_min: 0.0,
    temp_max: 2.0,
    temp_target: 1.0,
    humidity_min: 90,
    humidity_max: 95,
    gas_threshold: 190,
    gas_critical: 300,
    blue_light_recommended: true,
    blue_light_duration_mins: 40,
    category: "Non-Climacteric / Mold Susceptible",
    base_shelf_life_days: 14,
    ambient_shelf_life_days: 2,
    ethylene_sensitivity: "Low",
    respiration_rate: "Very High",
    chilling_threshold: -0.5,
    q10_factor: 2.4,
    farmer_tip: "Targeted 450nm Blue LED suppresses Botrytis cinerea gray mold without chemical fungicides. Store as close to 0°C as possible without freezing.",
    description: "High vulnerability to Botrytis cinerea (gray mold). Targeted 450nm blue light irradiation retards fungal sporulation."
  },
  potatoes: {
    id: "potatoes",
    name: "Potatoes (Solanum tuberosum)",
    icon: "🥔",
    temp_min: 7.0,
    temp_max: 10.0,
    temp_target: 8.5,
    humidity_min: 85,
    humidity_max: 90,
    gas_threshold: 280,
    gas_critical: 400,
    blue_light_recommended: false,
    blue_light_duration_mins: 0,
    category: "Tuber / Dark Storage Required",
    base_shelf_life_days: 120,
    ambient_shelf_life_days: 30,
    ethylene_sensitivity: "Moderate (Sprout trigger)",
    respiration_rate: "Low",
    chilling_threshold: 6.0,
    q10_factor: 1.8,
    farmer_tip: "MUST REMAIN IN COMPLETE DARKNESS! Light triggers toxic green solanine alkaloids. Keep above 6.5°C to avoid cold-induced starch-to-sugar conversion.",
    description: "Must be kept in darkness! Light induces toxic solanine glycoalkaloid and greening. Cold below 6°C causes cold-induced sweetening."
  },
  oranges: {
    id: "oranges",
    name: "Oranges & Citrus",
    icon: "🍊",
    temp_min: 4.0,
    temp_max: 8.0,
    temp_target: 6.0,
    humidity_min: 85,
    humidity_max: 90,
    gas_threshold: 240,
    gas_critical: 360,
    blue_light_recommended: true,
    blue_light_duration_mins: 30,
    category: "Non-Climacteric",
    base_shelf_life_days: 45,
    ambient_shelf_life_days: 10,
    ethylene_sensitivity: "Low",
    respiration_rate: "Low",
    chilling_threshold: 3.0,
    q10_factor: 1.9,
    farmer_tip: "Non-climacteric produce. Low ventilation leads to CO2 buildup and off-flavor. Periodic fan purge maintains fresh oxygen balance.",
    description: "Low ethylene production. Moderate ventilation prevents carbon dioxide accumulation and stem-end rot."
  },
  custom: {
    id: "custom",
    name: "Custom Storage Protocol",
    icon: "⚙️",
    temp_min: 2.0,
    temp_max: 8.0,
    temp_target: 5.0,
    humidity_min: 80,
    humidity_max: 95,
    gas_threshold: 250,
    gas_critical: 350,
    blue_light_recommended: false,
    blue_light_duration_mins: 15,
    category: "Experimental / Custom",
    base_shelf_life_days: 30,
    ambient_shelf_life_days: 7,
    ethylene_sensitivity: "Configurable",
    respiration_rate: "User Defined",
    chilling_threshold: 1.0,
    q10_factor: 2.0,
    farmer_tip: "Custom research profile. Sliders dynamically update control logic thresholds and trigger automated fan/mist responses.",
    description: "User-defined setpoints for specialized research, cross-produce storage, or chamber validation trials."
  }
};

export function getPresetById(id) {
  return CROP_PRESETS[id] || CROP_PRESETS.apples;
}

/**
 * Classifies MQ gas sensor readings into agronomic ethylene risk zones
 */
export function classifyGasQuality(gasValue, threshold) {
  const ppm = Math.round(gasValue);
  const mgM3 = (ppm * 1.15).toFixed(1); // Standard conversion at 20°C: 1 ppm C2H4 ≈ 1.15 mg/m³
  
  if (gasValue < threshold * 0.8) {
    return {
      text: "Optimal / Clean",
      level: "normal",
      color: "#10B981",
      badge: "badge-normal",
      ppm,
      mgM3,
      status: "SAFE",
      advice: "Ethylene concentrations are well below ripening induction levels."
    };
  } else if (gasValue <= threshold) {
    return {
      text: "Normal Baseline",
      level: "normal",
      color: "#34D399",
      badge: "badge-normal",
      ppm,
      mgM3,
      status: "NOMINAL",
      advice: "Trace ethylene present. Airflow cycle maintaining equilibrium."
    };
  } else if (gasValue < threshold * 1.3) {
    return {
      text: "Ripening Gas Detected",
      level: "warning",
      color: "#F59E0B",
      badge: "badge-warning",
      ppm,
      mgM3,
      status: "ELEVATED",
      advice: "Accelerated ripening active. Exhaust fans purging chamber air."
    };
  } else {
    return {
      text: "Critical Ethylene Surge",
      level: "danger",
      color: "#EF4444",
      badge: "badge-danger",
      ppm,
      mgM3,
      status: "CRITICAL",
      advice: "High risk of rapid over-ripening and senescence. Maximum ventilation engaged."
    };
  }
}

/**
 * Agronomic Post-Harvest Intelligence Engine:
 * Computes Vapor Pressure Deficit (VPD), Dew Point, Decay Rate, and Shelf-Life Prediction
 */
export function calculatePostHarvestMetrics(telemetry, preset) {
  const t = typeof telemetry.temperature === "number" ? telemetry.temperature : preset.temp_target;
  const rh = typeof telemetry.humidity === "number" ? telemetry.humidity : preset.humidity_min;
  const gas = typeof telemetry.gas_level === "number" ? telemetry.gas_level : preset.gas_threshold;

  // 1. Saturated Vapor Pressure (Tetens formula in kPa)
  const es = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
  // Actual Vapor Pressure
  const ea = es * (rh / 100);
  // Vapor Pressure Deficit (VPD) in kPa: optimal post-harvest storage is typically 0.05 to 0.25 kPa
  const vpdKPa = Math.max(0, parseFloat((es - ea).toFixed(2)));

  // 2. Dew Point (°C) (Magnus formula)
  const alpha = ((17.27 * t) / (t + 237.3)) + Math.log(Math.max(1, rh) / 100);
  const dewPointC = parseFloat(((237.3 * alpha) / (17.27 - alpha)).toFixed(1));
  const condensationRisk = (t - dewPointC) < 1.0; // within 1.0°C of dew point

  // 3. Respiration & Decay Acceleration Factor
  // Uses Q10 temperature-dependent biological respiration rate: Decay = Q10 ^ ((T - T_target) / 10)
  const tempDelta = Math.max(-5, t - preset.temp_target);
  const q10 = preset.q10_factor || 2.2;
  const tempDecayFactor = Math.pow(q10, tempDelta / 10);

  // Ethylene stress factor: each 100 ppm above threshold accelerates ripening by 40%
  const gasExcess = Math.max(0, gas - preset.gas_threshold);
  const ethyleneDecayFactor = 1.0 + (gasExcess / 100) * 0.45;

  // Combined decay multiplier
  const totalDecayRate = Math.max(0.5, parseFloat((tempDecayFactor * ethyleneDecayFactor).toFixed(2)));

  // 4. Shelf-Life Estimation (Days)
  const baseDays = preset.base_shelf_life_days || 30;
  const remainingDays = Math.max(0.8, parseFloat((baseDays / totalDecayRate).toFixed(1)));
  const ambientDays = preset.ambient_shelf_life_days || 7;
  const daysGained = Math.max(0, parseFloat((remainingDays - ambientDays).toFixed(1)));
  const percentGain = Math.round(((remainingDays - ambientDays) / ambientDays) * 100);

  // 5. Freshness Quality Score (0 - 100%)
  // Base freshness starts at 100%, penalized by temperature deviation, low humidity, and gas spikes
  let penalty = 0;
  if (t > preset.temp_max) penalty += (t - preset.temp_max) * 4.5;
  if (t < preset.temp_min && preset.chilling_threshold > 0 && t < preset.chilling_threshold) {
    penalty += (preset.chilling_threshold - t) * 8.0; // Heavy penalty for chilling injury
  }
  if (rh < preset.humidity_min) penalty += (preset.humidity_min - rh) * 0.8;
  if (gas > preset.gas_threshold) penalty += ((gas - preset.gas_threshold) / 10) * 1.5;

  const freshnessScore = Math.max(15, Math.min(100, Math.round(100 - penalty)));

  // Freshness Stage Classification
  let stage = "Peak Harvest Quality";
  let stageClass = "freshness-peak";
  let stageColor = "#10B981";

  if (freshnessScore >= 90) {
    stage = "Peak Freshness (Crisp)";
    stageClass = "freshness-peak";
    stageColor = "#10B981";
  } else if (freshnessScore >= 75) {
    stage = "Optimal Quality (Firm)";
    stageClass = "freshness-optimal";
    stageColor = "#34D399";
  } else if (freshnessScore >= 60) {
    stage = "Active Ripening";
    stageClass = "freshness-ripening";
    stageColor = "#F59E0B";
  } else if (freshnessScore >= 40) {
    stage = "Softening / Overripe";
    stageClass = "freshness-softening";
    stageColor = "#FB923C";
  } else {
    stage = "Senescence / Spoilage Risk";
    stageClass = "freshness-senescent";
    stageColor = "#EF4444";
  }

  // Chilling Risk Check
  const isChillingRisk = preset.chilling_threshold > 0 && t < preset.chilling_threshold;

  return {
    freshnessScore,
    stage,
    stageClass,
    stageColor,
    remainingDays,
    ambientDays,
    daysGained,
    percentGain,
    totalDecayRate,
    vpdKPa,
    dewPointC,
    condensationRisk,
    isChillingRisk,
    ethylenePpm: Math.round(gas),
    ethyleneMgM3: (gas * 1.15).toFixed(1)
  };
}

