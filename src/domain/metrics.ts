import type { MetricDef, MetricId } from './types'

/**
 * Metric catalog: what we track, how each value is judged, and why it matters
 * in spaceflight.
 *
 * The ranges are demo defaults taken from general clinical reference ranges
 * (named per metric in `reference`). They are not flight rules and would need
 * sign-off from flight surgeons before real use.
 */
export const METRICS: Record<MetricId, MetricDef> = {
  restingHr: {
    id: 'restingHr',
    label: 'Resting heart rate',
    unit: 'bpm',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      {
        below: 40,
        status: 'act',
        label: 'Marked bradycardia',
        action:
          'Re-measure after 5 minutes of rest. If it stays below 40 bpm or you feel dizzy or faint, see the Crew Medical Officer.',
      },
      {
        below: 50,
        status: 'watch',
        label: 'Low resting heart rate',
        action:
          'Common in well-trained crew. Note any dizziness or fatigue and re-measure tomorrow.',
      },
      { below: 101, status: 'nominal', label: 'Normal' },
      {
        below: 121,
        status: 'watch',
        label: 'Elevated resting heart rate',
        action:
          'Rest for 10 minutes, drink water and re-measure. Check for fever, poor sleep or stress.',
      },
      {
        below: 141,
        status: 'act',
        label: 'Tachycardia at rest',
        action:
          'Stop exertion, rest and re-measure in 10 minutes. If it persists, see the Crew Medical Officer for an ECG.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Severe tachycardia at rest',
        action:
          'Stop all activity and get the Crew Medical Officer now. Record an ECG and contact the flight surgeon.',
      },
    ],
    drift: {
      direction: 'up',
      watch: 8,
      act: 15,
      action:
        'A creeping resting heart rate points to deconditioning, dehydration or poor recovery. Check your exercise and fluid log; raise it with the Crew Medical Officer if it keeps climbing.',
    },
    staleAfterDays: 3,
    inputMin: 25,
    inputMax: 230,
    inputStep: 1,
    scale: [30, 160],
    hazard: 'gravity',
    nasaRisk: 'Risk of Cardiovascular Adaptations',
    whyInSpace:
      'In microgravity the heart works against less load and blood volume drops, so the cardiovascular system deconditions. A resting heart rate that creeps up over weeks is one of the earliest signs.',
    howToMeasure:
      'Measure after waking, before caffeine or exercise. Stay still for 5 minutes, then count your pulse for 60 seconds or read it from the monitor.',
    reference: 'Adult resting heart rate, 60 to 100 bpm (American Heart Association); lower values are usual in trained people.',
  },

  systolic: {
    id: 'systolic',
    label: 'Systolic pressure',
    unit: 'mmHg',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      {
        below: 70,
        status: 'critical',
        label: 'Severe hypotension',
        action:
          'Lie flat and get the Crew Medical Officer now. Contact the flight surgeon.',
      },
      {
        below: 90,
        status: 'act',
        label: 'Low blood pressure',
        action:
          'Drink fluids with electrolytes and re-measure in 15 minutes. See the Crew Medical Officer if it stays low or you feel faint.',
      },
      { below: 120, status: 'nominal', label: 'Normal' },
      {
        below: 140,
        status: 'watch',
        label: 'Elevated blood pressure',
        action:
          'Re-measure after 5 minutes of quiet rest. Check salt intake, sleep and stress; track it daily this week.',
      },
      {
        below: 180,
        status: 'act',
        label: 'High blood pressure',
        action:
          'Re-measure twice, 5 minutes apart. If confirmed, see the Crew Medical Officer.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Hypertensive crisis range',
        action:
          'Rest and re-measure in 5 minutes. If still this high, or you have chest pain, headache or vision changes, get the Crew Medical Officer and contact the flight surgeon.',
      },
    ],
    drift: {
      direction: 'both',
      watch: 10,
      act: 20,
      action:
        'Your blood pressure has shifted away from your own pre-flight level. Keep measuring daily at the same time and discuss the trend with the Crew Medical Officer.',
    },
    staleAfterDays: 3,
    inputMin: 50,
    inputMax: 260,
    inputStep: 1,
    scale: [60, 200],
    hazard: 'gravity',
    nasaRisk: 'Risk of Cardiovascular Adaptations',
    whyInSpace:
      'Body fluids shift toward the head in microgravity and blood volume falls. On long missions arteries can stiffen, and after landing on a planet, low blood pressure when standing up is a known risk.',
    howToMeasure:
      'Rest for 5 minutes, strap in so your arm is relaxed, and place the cuff on your bare upper arm at heart level. Do not talk during the measurement.',
    reference: 'ACC/AHA 2017 blood pressure categories; hypotension below 90/60 mmHg.',
  },

  diastolic: {
    id: 'diastolic',
    label: 'Diastolic pressure',
    unit: 'mmHg',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      {
        below: 40,
        status: 'act',
        label: 'Very low diastolic pressure',
        action:
          'Drink fluids with electrolytes and re-measure in 15 minutes. See the Crew Medical Officer if it stays low or you feel faint.',
      },
      {
        below: 60,
        status: 'watch',
        label: 'Low diastolic pressure',
        action: 'Keep up your fluids and note any dizziness. Re-measure tomorrow.',
      },
      { below: 80, status: 'nominal', label: 'Normal' },
      {
        below: 90,
        status: 'watch',
        label: 'Elevated diastolic pressure',
        action:
          'Re-measure after 5 minutes of quiet rest. Check salt intake, sleep and stress; track it daily this week.',
      },
      {
        below: 120,
        status: 'act',
        label: 'High diastolic pressure',
        action:
          'Re-measure twice, 5 minutes apart. If confirmed, see the Crew Medical Officer.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Hypertensive crisis range',
        action:
          'Rest and re-measure in 5 minutes. If still this high, get the Crew Medical Officer and contact the flight surgeon.',
      },
    ],
    drift: {
      direction: 'both',
      watch: 8,
      act: 15,
      action:
        'Your blood pressure has shifted away from your own pre-flight level. Keep measuring daily at the same time and discuss the trend with the Crew Medical Officer.',
    },
    staleAfterDays: 3,
    inputMin: 30,
    inputMax: 160,
    inputStep: 1,
    scale: [30, 130],
    hazard: 'gravity',
    nasaRisk: 'Risk of Cardiovascular Adaptations',
    whyInSpace:
      'Body fluids shift toward the head in microgravity and blood volume falls. On long missions arteries can stiffen, and after landing on a planet, low blood pressure when standing up is a known risk.',
    howToMeasure:
      'Rest for 5 minutes, strap in so your arm is relaxed, and place the cuff on your bare upper arm at heart level. Do not talk during the measurement.',
    reference: 'ACC/AHA 2017 blood pressure categories; hypotension below 90/60 mmHg.',
  },

  glucose: {
    id: 'glucose',
    label: 'Fasting blood sugar',
    unit: 'mg/dL',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      {
        below: 54,
        status: 'critical',
        label: 'Severe low blood sugar',
        action:
          'Take 15 to 20 g of fast sugar now (juice or glucose gel), tell a crewmate and re-measure in 15 minutes. Contact the flight surgeon.',
      },
      {
        below: 70,
        status: 'act',
        label: 'Low blood sugar',
        action:
          'Take 15 g of fast sugar, re-measure in 15 minutes and eat a meal. Tell the Crew Medical Officer if it happens again.',
      },
      { below: 100, status: 'nominal', label: 'Normal' },
      {
        below: 126,
        status: 'watch',
        label: 'Elevated fasting blood sugar',
        action:
          'Confirm you were fasting for 8 hours. Re-measure on the next two mornings and review your meal log.',
      },
      {
        below: 250,
        status: 'act',
        label: 'High fasting blood sugar',
        action:
          'Re-measure tomorrow morning while fasting. If confirmed, see the Crew Medical Officer.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Very high blood sugar',
        action:
          'Drink water, re-measure in 30 minutes and get the Crew Medical Officer. Contact the flight surgeon.',
      },
    ],
    drift: {
      direction: 'both',
      watch: 12,
      act: 25,
      action:
        'Your fasting blood sugar has moved away from your pre-flight level. Review meals and exercise, and raise the trend with the Crew Medical Officer.',
    },
    staleAfterDays: 7,
    inputMin: 20,
    inputMax: 600,
    inputStep: 1,
    scale: [40, 280],
    hazard: 'distance',
    nasaRisk: 'Risk of Inadequate Food and Nutrition',
    whyInSpace:
      'Studies of astronauts and of bed rest on Earth have found reduced insulin sensitivity when the body is unloaded and less active. The fixed mission diet and irregular schedules add to the risk.',
    howToMeasure:
      'Measure in the morning after at least 8 hours without food. Clean the fingertip, use a fresh lancet and apply the first full drop to the test strip.',
    reference: 'American Diabetes Association: fasting glucose 70 to 99 mg/dL normal, 100 to 125 elevated, 126 or above high; below 70 and below 54 mg/dL hypoglycaemia levels 1 and 2.',
  },

  bodyTemp: {
    id: 'bodyTemp',
    label: 'Body temperature',
    unit: '°C',
    decimals: 1,
    evaluateOn: 'latest',
    bands: [
      {
        below: 35,
        status: 'critical',
        label: 'Hypothermia range',
        action:
          'Warm up with insulation and warm drinks, and get the Crew Medical Officer. Contact the flight surgeon.',
      },
      {
        below: 36,
        status: 'watch',
        label: 'Low body temperature',
        action: 'Check the thermometer placement, warm up and re-measure in 30 minutes.',
      },
      { below: 37.6, status: 'nominal', label: 'Normal' },
      {
        below: 38,
        status: 'watch',
        label: 'Slightly raised temperature',
        action:
          'Rest, drink fluids and re-measure in 4 hours. Compare with your own in-flight values.',
      },
      {
        below: 39.5,
        status: 'act',
        label: 'Fever',
        action:
          'Rest, drink fluids and re-measure every 4 hours. Tell the Crew Medical Officer and keep distance from crewmates where you can.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'High fever',
        action:
          'Cool down, drink fluids and get the Crew Medical Officer now. Contact the flight surgeon.',
      },
    ],
    drift: {
      direction: 'up',
      watch: 0.5,
      act: 1,
      action:
        'A sustained rise can be spaceflight adaptation or a low-grade infection. Log any symptoms and mention the trend to the Crew Medical Officer.',
    },
    staleAfterDays: 3,
    inputMin: 30,
    inputMax: 43,
    inputStep: 0.1,
    scale: [34.5, 40.5],
    hazard: 'environment',
    nasaRisk: 'Risk of Altered Immune System Responses',
    whyInSpace:
      'Resting core temperature has been measured to rise by about 1 °C over the first months on the ISS, and immune function changes in flight. Judge a reading against your own in-flight trend, not only Earth norms.',
    howToMeasure:
      'Measure at rest, at the same time each day and not within 30 minutes of exercise, food or drink. Hold the thermometer in place until it signals.',
    reference: 'Fever defined as 38.0 °C or above; hypothermia below 35.0 °C (standard clinical definitions). In-flight rise: Stahn et al., Scientific Reports, 2017.',
  },

  spo2: {
    id: 'spo2',
    label: 'Blood oxygen',
    unit: '%',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      {
        below: 90,
        status: 'critical',
        label: 'Low blood oxygen',
        action:
          'Use supplemental oxygen if available, get the Crew Medical Officer now and check the cabin atmosphere. Contact the flight surgeon.',
      },
      {
        below: 92,
        status: 'act',
        label: 'Reduced blood oxygen',
        action:
          'Warm your hand, re-seat the sensor and re-measure. If confirmed, see the Crew Medical Officer and check cabin oxygen.',
      },
      {
        below: 95,
        status: 'watch',
        label: 'Slightly reduced blood oxygen',
        action:
          'Warm your hand, re-seat the sensor and re-measure. Check the cabin atmosphere readings.',
      },
      { below: Infinity, status: 'nominal', label: 'Normal' },
    ],
    drift: {
      direction: 'down',
      watch: 2,
      act: 4,
      action:
        'Your oxygen saturation is running below your own baseline. Check the cabin atmosphere and tell the Crew Medical Officer.',
    },
    staleAfterDays: 3,
    inputMin: 50,
    inputMax: 100,
    inputStep: 1,
    scale: [86, 100],
    hazard: 'environment',
    nasaRisk: 'Risk of Hypoxia',
    whyInSpace:
      'The air you breathe is made by the life-support system. A falling oxygen saturation can reveal a cabin-air or lung problem before you feel it.',
    howToMeasure:
      'Clip the pulse oximeter on a warm, still finger without nail polish and wait until the reading is steady for 10 seconds.',
    reference: 'Pulse oximetry: 95 to 100% normal at sea-level pressure; below 90% is hypoxaemia (standard clinical definition).',
  },

  sleepHours: {
    id: 'sleepHours',
    label: 'Sleep',
    unit: 'h',
    decimals: 1,
    evaluateOn: 'avg7',
    bands: [
      {
        below: 5.5,
        status: 'act',
        label: 'Severe sleep shortfall this week',
        action:
          'Ask the Crew Medical Officer and ground to protect your sleep period. Avoid safety-critical tasks when you are most tired.',
      },
      {
        below: 6.5,
        status: 'watch',
        label: 'Sleep shortfall this week',
        action:
          'Keep a fixed sleep time, dim lights and screens an hour before, and avoid caffeine in the 6 hours before sleep.',
      },
      { below: 9.5, status: 'nominal', label: 'Normal' },
      {
        below: Infinity,
        status: 'watch',
        label: 'Unusually long sleep this week',
        action:
          'Long sleep can follow illness or low mood. Note how rested you feel and watch the trend.',
      },
    ],
    drift: {
      direction: 'down',
      watch: 1,
      act: 2,
      action:
        'You are sleeping clearly less than before the flight. Protect your sleep period and review workload and light exposure.',
    },
    staleAfterDays: 2,
    inputMin: 0,
    inputMax: 16,
    inputStep: 0.1,
    scale: [3, 11],
    hazard: 'isolation',
    nasaRisk: 'Risk from Inadequate Sleep and Irregular Schedules',
    whyInSpace:
      'ISS crews average about 6 hours of sleep a night. Sixteen sunrises a day, noise and workload disturb the body clock, and lost sleep slows reactions and lowers mood.',
    howToMeasure:
      'After waking, log the hours you actually slept, not the time you spent in the sleep station.',
    reference: 'Adults need 7 or more hours per night (American Academy of Sleep Medicine). ISS sleep duration: Barger et al., Lancet Neurology, 2014.',
  },

  mood: {
    id: 'mood',
    label: 'Mood',
    unit: '/ 5',
    decimals: 0,
    evaluateOn: 'avg7',
    bands: [
      {
        below: 2,
        status: 'act',
        label: 'Persistently low mood this week',
        action:
          'Talk to the Crew Medical Officer and ask for a private conference with the ground support team. You do not have to handle this alone.',
      },
      {
        below: 3,
        status: 'watch',
        label: 'Low mood this week',
        action:
          'Plan something restorative today: a call home, time at the window or exercise. Talk to a crewmate you trust.',
      },
      { below: Infinity, status: 'nominal', label: 'Normal' },
    ],
    drift: {
      direction: 'down',
      watch: 1,
      act: 1.5,
      action:
        'Your mood has been below your usual level for a while. Check sleep and workload, and consider talking to the Crew Medical Officer.',
    },
    staleAfterDays: 2,
    inputMin: 1,
    inputMax: 5,
    inputStep: 1,
    scale: [1, 5],
    hazard: 'isolation',
    nasaRisk: 'Risk of Behavioral Changes and Psychiatric Disorders',
    whyInSpace:
      'Isolation, confinement and distance from home add up over months. A decline that lasts matters more than one bad day, so the weekly average is judged.',
    howToMeasure:
      'Once a day, rate how you felt overall from 1 (very low) to 5 (very good). Answer quickly and honestly; this log is yours.',
    reference: 'Self-reported 1 to 5 scale; thresholds are project defaults, not a clinical instrument.',
  },

  exerciseMin: {
    id: 'exerciseMin',
    label: 'Exercise',
    unit: 'min',
    decimals: 0,
    evaluateOn: 'avg7',
    bands: [
      {
        below: 45,
        status: 'act',
        label: 'Far below exercise target this week',
        action:
          'Tell the Crew Medical Officer and ground. Without loading, bone and muscle loss speeds up; agree a replacement plan.',
      },
      {
        below: 90,
        status: 'watch',
        label: 'Below exercise target this week',
        action:
          'Aim for about 2 hours a day of combined resistance and cardio. Reschedule missed sessions this week.',
      },
      { below: Infinity, status: 'nominal', label: 'On target' },
    ],
    staleAfterDays: 2,
    inputMin: 0,
    inputMax: 360,
    inputStep: 5,
    scale: [0, 180],
    hazard: 'gravity',
    nasaRisk: 'Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness',
    whyInSpace:
      'Without the load of gravity, weight-bearing bones lose on average 1% to 1.5% of their mineral density per month and muscles shrink. ISS crews exercise about 2 hours a day to counter this.',
    howToMeasure:
      'Log the minutes of resistance and cardio exercise completed today, without setup time.',
    reference: 'NASA Human Research Program: bone loss in microgravity and the ISS exercise countermeasure programme. Thresholds are project defaults.',
  },

  cabinCo2: {
    id: 'cabinCo2',
    label: 'Cabin CO₂',
    unit: 'mmHg',
    decimals: 1,
    evaluateOn: 'latest',
    bands: [
      { below: 3, status: 'nominal', label: 'Normal for a spacecraft' },
      {
        below: 4,
        status: 'watch',
        label: 'Raised cabin CO₂',
        action:
          'Improve airflow where you work and sleep, and note any headache or trouble concentrating.',
      },
      {
        below: 5.3,
        status: 'act',
        label: 'High cabin CO₂',
        action:
          'Check the CO₂ removal system and move to a better-ventilated module. Report symptoms to the Crew Medical Officer.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Cabin CO₂ above the long-term limit',
        action:
          'Treat as a life-support fault: follow the CO₂ procedure, move to another module and contact mission control.',
      },
    ],
    staleAfterDays: 1,
    inputMin: 0,
    inputMax: 20,
    inputStep: 0.1,
    scale: [0, 7],
    hazard: 'environment',
    nasaRisk: 'Risk of Acute and Chronic Carbon Dioxide Exposure',
    whyInSpace:
      'CO₂ on a spacecraft runs roughly ten times higher than on Earth, and without convection it can pool around your head. Crews report headaches and poor concentration when it rises.',
    howToMeasure:
      'Read the partial pressure of CO₂ from the cabin atmosphere monitor nearest to where you work and sleep.',
    reference: 'NASA spacecraft maximum allowable concentration for CO₂ (5.3 mmHg long-term) and ISS operating practice of keeping it lower. Lower thresholds are project defaults.',
  },

  radiationDose: {
    id: 'radiationDose',
    label: 'Radiation dose',
    unit: 'mSv/day',
    decimals: 1,
    evaluateOn: 'latest',
    bands: [
      { below: 3, status: 'nominal', label: 'Normal for deep space' },
      {
        below: 10,
        status: 'watch',
        label: 'Raised dose rate',
        action:
          'Check the space weather report and the cabin radiation monitor. Spend rest time in the best shielded part of the vehicle and read the dosimeter again in a few hours.',
      },
      {
        below: 50,
        status: 'act',
        label: 'Solar particle event',
        action:
          'Go to the storm shelter, the best shielded part of the vehicle, and stay there until the dose rate is back to normal. Tell the crew and report to mission control.',
      },
      {
        below: Infinity,
        status: 'critical',
        label: 'Severe solar particle event',
        action:
          'All crew go to the storm shelter now. Contact mission control and the flight surgeon, and watch for nausea in the next hours.',
      },
    ],
    // No drift rule: a baseline taken on Earth says nothing about deep space.
    staleAfterDays: 2,
    inputMin: 0,
    inputMax: 1000,
    inputStep: 0.1,
    // The dose of a solar particle event is tens of times the background.
    scale: [0.5, 100],
    logScale: true,
    hazard: 'radiation',
    nasaRisk: 'Risk of Radiation-Induced Cancers',
    whyInSpace:
      "Outside Earth's magnetic field the crew is exposed to galactic cosmic rays all the time and to solar particle events at short notice. The dose adds up over the mission and raises the lifetime risk of cancer.",
    howToMeasure:
      'Read the daily dose from your personal dosimeter or from the cabin radiation monitor.',
    reference:
      'Deep-space background of about 1.8 mSv per day, measured by the RAD instrument during the cruise to Mars (Zeitlin et al., Science, 2013). NASA career limit of 600 mSv (NASA-STD-3001). The daily thresholds are project defaults.',
  },

  reactionMs: {
    id: 'reactionMs',
    label: 'Reaction time',
    unit: 'ms',
    decimals: 0,
    evaluateOn: 'latest',
    bands: [
      { below: 400, status: 'nominal', label: 'Normal' },
      {
        below: 500,
        status: 'watch',
        label: 'Slowed reactions',
        action:
          'Rest for a while and test again on the same device. Check how you slept and the cabin CO₂ reading.',
      },
      {
        below: Infinity,
        status: 'act',
        label: 'Markedly slowed reactions',
        action:
          'Avoid safety-critical tasks, rest and test again. If the result stays this slow, tell the Crew Medical Officer.',
      },
    ],
    drift: {
      direction: 'up',
      watch: 40,
      act: 80,
      action:
        'Your reactions are slower than your own pre-flight level. Check sleep, workload and cabin CO₂, and plan demanding tasks for when you are rested. Test again tomorrow on the same device.',
    },
    staleAfterDays: 3,
    inputMin: 150,
    inputMax: 2000,
    inputStep: 1,
    scale: [150, 650],
    hazard: 'isolation',
    nasaRisk: 'Risk from Inadequate Sleep and Irregular Schedules',
    whyInSpace:
      'Sleep loss, shifted schedules and high CO₂ slow reactions before the crew member notices. Slow reactions matter most during spacewalks, piloting and robotic arm work.',
    howToMeasure:
      'Run the Reaction Self-Test in the Check-in section and tap as soon as the counter appears. Always use the same device.',
    reference:
      'Modelled on the 3-minute Psychomotor Vigilance Test (PVT-B) used in the Reaction Self-Test on the International Space Station. Browser and screen add delay, so the value is compared with your own baseline on the same device. Thresholds are project defaults.',
  },
}

export const METRIC_IDS = Object.keys(METRICS) as MetricId[]

export function classify(metric: MetricId, value: number) {
  const bands = METRICS[metric].bands
  return bands.find((b) => value < b.below) ?? bands[bands.length - 1]
}

/** The lower and upper edge of the nominal band, for drawing the normal range. */
export function nominalRange(metric: MetricId): { min: number; max: number } | null {
  const bands = METRICS[metric].bands
  const i = bands.findIndex((b) => b.status === 'nominal')
  if (i < 0) return null
  return { min: i === 0 ? -Infinity : bands[i - 1].below, max: bands[i].below }
}

/** The indicators driven by one NASA hazard; empty when none is tracked yet. */
export function metricsForHazard(hazard: MetricDef['hazard']): MetricId[] {
  return METRIC_IDS.filter((id) => METRICS[id].hazard === hazard)
}
