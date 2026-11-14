import { describe, expect, it } from 'vitest'
import { evaluate } from './engine'
import { METRIC_IDS, classify } from './metrics'
import {
  ALTERNATIVE_LABEL,
  MISSION_PLAN,
  READINESS_DISCLAIMER,
  TASKS,
  TASK_IDS,
  assessReadiness,
  readinessForDay,
  taskForDay,
  type TaskId,
  type VerdictLevel,
} from './readiness'
import { MISSION_DAYS, simulateMission } from './simulator'
import type { Evaluation, Finding, MetricAssessment, MetricId, Status } from './types'
import { worst } from './types'

/** An indicator measured today, in range and on baseline. */
function fresh(metric: MetricId): MetricAssessment {
  return {
    metric,
    status: 'nominal',
    value: 60,
    latestDay: 20,
    daysSinceReading: 0,
    stale: false,
    band: null,
    baseline: 60,
    recentMean: 60,
    delta: 0,
    driftStatus: 'nominal',
    driftDays: 0,
    recentPeak: 60,
  }
}

function finding(id: string, status: Finding['status'], metrics: MetricId[]): Finding {
  const kind = id.split(':')[0] as Finding['kind']
  return { id, kind, status, title: `Title of ${id}`, detail: '', action: '', metrics }
}

/** A hand-built evaluation: healthy unless findings or changed indicators are given. */
function evaluation(
  findings: Finding[] = [],
  patches: Partial<Record<MetricId, Partial<MetricAssessment>>> = {},
): Evaluation {
  const assessments = Object.fromEntries(
    METRIC_IDS.map((id) => [id, { ...fresh(id), ...patches[id] }]),
  ) as Record<MetricId, MetricAssessment>
  return {
    day: 20,
    status: findings.reduce<Status>((s, f) => worst(s, f.status), 'nominal'),
    assessments,
    findings,
    reminders: METRIC_IDS.filter((id) => assessments[id].stale).map((id) => ({
      metric: id,
      daysSinceReading: assessments[id].daysSinceReading,
    })),
  }
}

const levelOf = (task: TaskId, e: Evaluation) => assessReadiness(TASKS[task], e).level
const levels = (e: Evaluation) => Object.fromEntries(TASK_IDS.map((id) => [id, levelOf(id, e)]))
const notMeasured = { stale: true, daysSinceReading: 5 }
/** Figure dash to horizontal bar, middle dot and bullet: none of them belongs in the copy. */
const DASHES_AND_DOTS = /[\u2012-\u2015\u00b7\u2022]/

describe('task catalogue', () => {
  it('says in plain words what every task demands', () => {
    for (const id of TASK_IDS) {
      expect(TASKS[id].id).toBe(id)
      expect(TASKS[id].label.length, id).toBeGreaterThan(3)
      expect(TASKS[id].demand.length, id).toBeGreaterThan(20)
    }
  })

  it('keeps to the copy style: no dashes and no middle dots', () => {
    const copy = [
      READINESS_DISCLAIMER,
      ...Object.values(ALTERNATIVE_LABEL),
      ...TASK_IDS.flatMap((id) => [TASKS[id].label, TASKS[id].demand, TASKS[id].ifCaution.text, TASKS[id].ifNoGo.text]),
    ]
    for (const text of copy) expect(text).not.toMatch(DASHES_AND_DOTS)
  })

  it('says that the limits are defaults and that people decide', () => {
    expect(READINESS_DISCLAIMER).toContain('not flight rules')
    expect(READINESS_DISCLAIMER).toContain('commander')
  })
})

describe('mission plan', () => {
  it('gives every mission day one task', () => {
    expect(MISSION_PLAN).toHaveLength(MISSION_DAYS)
    for (let day = 1; day <= MISSION_DAYS; day++) {
      expect(TASK_IDS, `day ${day}`).toContain(MISSION_PLAN[day - 1])
      expect(taskForDay(day).id).toBe(MISSION_PLAN[day - 1])
    }
  })

  it('is the same every time it is asked', () => {
    const again = Array.from({ length: MISSION_DAYS }, (_, i) => taskForDay(i + 1).id)
    expect(again).toEqual([...MISSION_PLAN])
  })

  it('answers for days outside the mission too', () => {
    expect(TASK_IDS).toContain(taskForDay(0).id)
    expect(TASK_IDS).toContain(taskForDay(-13).id)
    expect(TASK_IDS).toContain(taskForDay(MISSION_DAYS + 1).id)
  })

  it('is mostly routine work, with a few demanding tasks and a rest day every week', () => {
    const count = (id: TaskId) => MISSION_PLAN.filter((t) => t === id).length
    for (const id of TASK_IDS) expect(count(id), id).toBeGreaterThan(0)
    expect(count('science') + count('maintenance') + count('exercise')).toBeGreaterThan(MISSION_DAYS * 0.7)
    expect(count('spacewalk')).toBeGreaterThanOrEqual(4)
    expect(count('spacewalk')).toBeLessThanOrEqual(8)
    expect(count('burn')).toBeGreaterThanOrEqual(3)
    expect(count('burn')).toBeLessThanOrEqual(7)
    for (let start = 0; start + 7 <= MISSION_DAYS; start++) {
      expect(MISSION_PLAN.slice(start, start + 7), `week from day ${start + 1}`).toContain('rest')
    }
  })
})

describe('verdict for hand-built evaluations', () => {
  it('is go for every task when nothing is found', () => {
    const healthy = evaluation()
    for (const id of TASK_IDS) {
      const verdict = assessReadiness(TASKS[id], healthy)
      expect(verdict.level, id).toBe('go')
      expect(verdict.label).toBe('Go')
      expect(verdict.reasons).toEqual([])
      expect(verdict.alternative).toBeNull()
    }
  })

  it('is no-go for every task except rest when anything is critical', () => {
    const e = evaluation([finding('pattern:cardiac', 'critical', ['restingHr', 'systolic'])])
    for (const id of TASK_IDS) expect(levelOf(id, e), id).toBe(id === 'rest' ? 'go' : 'no-go')

    // Critical counts whatever the task demands: science work does not depend on blood sugar being perfect.
    const sugar = evaluation([finding('range:glucose', 'critical', ['glucose'])], {
      glucose: { status: 'critical', band: classify('glucose', 50) },
    })
    const verdict = assessReadiness(TASKS.science, sugar)
    expect(verdict.level).toBe('no-go')
    expect(verdict.reasons[0]).toMatchObject({ id: 'range:glucose', effect: 'no-go', metric: 'glucose' })
    expect(verdict.summary).toContain('critical')
  })

  it('lets the fatigue pattern block piloting but not rest', () => {
    const e = evaluation([finding('pattern:fatigue', 'watch', ['sleepHours', 'reactionMs'])])
    expect(levels(e)).toEqual({
      spacewalk: 'no-go',
      burn: 'no-go',
      roboticArm: 'no-go',
      exercise: 'go',
      maintenance: 'caution',
      science: 'go',
      rest: 'go',
    })
    const burn = assessReadiness(TASKS.burn, e)
    expect(burn.reasons).toEqual([
      { id: 'pattern:fatigue', effect: 'no-go', text: 'Sleep loss is slowing your reactions', metric: 'reactionMs' },
    ])
    expect(burn.alternative?.kind).toBe('swap')
    expect(assessReadiness(TASKS.rest, e).summary).toContain('Resting is the right plan')
  })

  it('blocks tasks that need alertness on slowed reactions, and asks for care when they are only off baseline', () => {
    const slowed = evaluation([finding('range:reactionMs', 'watch', ['reactionMs'])], {
      reactionMs: { status: 'watch', band: classify('reactionMs', 430) },
    })
    expect(levelOf('burn', slowed)).toBe('no-go')
    expect(levelOf('roboticArm', slowed)).toBe('no-go')
    expect(levelOf('exercise', slowed)).toBe('go')
    expect(assessReadiness(TASKS.burn, slowed).reasons[0].text).toBe('Slowed reactions')

    const drifting = evaluation([finding('drift:reactionMs', 'watch', ['reactionMs'])], {
      reactionMs: { status: 'watch', driftStatus: 'watch', delta: 45 },
    })
    const verdict = assessReadiness(TASKS.burn, drifting)
    expect(verdict.level).toBe('caution')
    expect(verdict.reasons[0].text).toBe('Reactions are slower than your baseline')
    expect(levelOf('maintenance', drifting)).toBe('go')
  })

  it('lets cardiovascular findings block physically heavy tasks', () => {
    const e = evaluation([finding('pattern:deconditioning', 'act', ['exerciseMin', 'restingHr'])])
    expect(levelOf('spacewalk', e)).toBe('no-go')
    expect(levelOf('roboticArm', e)).toBe('go')
    expect(levelOf('science', e)).toBe('go')
    // Exercise is the remedy for deconditioning, so the finding never counts against it.
    const exercise = assessReadiness(TASKS.exercise, e)
    expect(exercise.level).toBe('go')
    expect(exercise.summary).toContain('part of the fix')

    const pressure = evaluation([finding('range:systolic', 'act', ['systolic'])], {
      systolic: { status: 'act', band: classify('systolic', 150) },
    })
    expect(levelOf('spacewalk', pressure)).toBe('no-go')
    expect(levelOf('burn', pressure)).toBe('caution')
    expect(levelOf('roboticArm', pressure)).toBe('go')
  })

  it('gives caution with measure first when blood pressure is out of date for a spacewalk', () => {
    const e = evaluation([], { systolic: notMeasured, diastolic: notMeasured })
    const verdict = assessReadiness(TASKS.spacewalk, e)
    expect(verdict.level).toBe('caution')
    // Systolic and diastolic are one measurement, so one line.
    expect(verdict.reasons).toEqual([
      {
        id: 'unmeasured:systolic',
        effect: 'caution',
        text: 'Blood pressure last measured 5 days ago',
        metric: 'systolic',
      },
    ])
    expect(verdict.alternative?.kind).toBe('measure')
    expect(verdict.alternative?.text).toContain('fresh reading of blood pressure')
    // A task that does not depend on blood pressure is not held up by it.
    expect(levelOf('roboticArm', e)).toBe('go')
    expect(levelOf('rest', e)).toBe('go')
  })

  it('names an indicator that was never measured', () => {
    const e = evaluation([], { reactionMs: { stale: true, daysSinceReading: null, value: null } })
    const verdict = assessReadiness(TASKS.burn, e)
    expect(verdict.level).toBe('caution')
    expect(verdict.reasons[0].text).toBe('Reaction time has never been measured')
  })

  it('keeps an out-of-date reading on the list when something else already blocks the task', () => {
    const e = evaluation([finding('pattern:fatigue', 'act', ['sleepHours', 'reactionMs'])], {
      systolic: notMeasured,
      diastolic: notMeasured,
    })
    const verdict = assessReadiness(TASKS.spacewalk, e)
    expect(verdict.level).toBe('no-go')
    expect(verdict.reasons.map((r) => r.id)).toEqual(['pattern:fatigue', 'unmeasured:systolic'])
    expect(verdict.alternative?.kind).toBe('postpone')
  })

  it('blocks work outside during a solar particle event and does not suggest a swap', () => {
    const e = evaluation([finding('range:radiationDose', 'act', ['radiationDose'])], {
      radiationDose: { status: 'act', band: classify('radiationDose', 40) },
    })
    const spacewalk = assessReadiness(TASKS.spacewalk, e)
    expect(spacewalk.level).toBe('no-go')
    expect(spacewalk.reasons[0]).toMatchObject({ text: 'Solar particle event', metric: 'radiationDose' })
    expect(spacewalk.alternative?.kind).toBe('postpone')
    expect(spacewalk.alternative?.text).toContain('A crewmate would face the same')
    // The crew belongs in the storm shelter, so work inside stops too; rest is untouched.
    expect(levelOf('science', e)).toBe('no-go')
    expect(levelOf('rest', e)).toBe('go')
  })

  it('treats a raised dose rate as a reason for care outside, and no reason inside', () => {
    const e = evaluation([finding('range:radiationDose', 'watch', ['radiationDose'])], {
      radiationDose: { status: 'watch', band: classify('radiationDose', 5) },
    })
    expect(levelOf('spacewalk', e)).toBe('caution')
    expect(levelOf('maintenance', e)).toBe('go')
  })

  it('stops heavy work during an infection and says that rest is the right plan', () => {
    const e = evaluation([finding('pattern:infection', 'act', ['bodyTemp', 'restingHr'])])
    expect(levelOf('spacewalk', e)).toBe('no-go')
    expect(levelOf('exercise', e)).toBe('no-go')
    expect(assessReadiness(TASKS.exercise, e).alternative?.kind).toBe('lighter')
    // The finding says rest and keep away from crewmates, so light work stops as well.
    expect(levelOf('science', e)).toBe('no-go')
    const rest = assessReadiness(TASKS.rest, e)
    expect(rest.level).toBe('go')
    expect(rest.summary).toBe('Resting is the right plan today.')
    expect(rest.reasons).toEqual([])
  })

  it('gives a heart that is racing today no milder verdict than one that raced yesterday', () => {
    const e = evaluation([finding('range:restingHr', 'act', ['restingHr'])], {
      restingHr: { status: 'act', value: 130, recentPeak: 130 },
    })
    expect(levelOf('exercise', e)).toBe('no-go')
    expect(levelOf('spacewalk', e)).toBe('no-go')
    expect(levelOf('rest', e)).toBe('go')
  })

  it('keeps a recovering heart away from exertion and asks for care in light work', () => {
    const e = evaluation([finding('drift:restingHr', 'act', ['restingHr'])], {
      restingHr: { status: 'act', value: 85, recentPeak: 130, driftStatus: 'act', delta: 25 },
    })
    expect(levels(e)).toEqual({
      spacewalk: 'no-go',
      burn: 'no-go',
      roboticArm: 'caution',
      exercise: 'no-go',
      maintenance: 'caution',
      science: 'caution',
      rest: 'go',
    })
    // The recovery explains the raised heart rate, so it is listed once.
    expect(assessReadiness(TASKS.exercise, e).reasons.map((r) => r.id)).toEqual(['recovery:heart'])
    expect(assessReadiness(TASKS.rest, e).summary).toBe('Resting is the right plan today.')
  })

  it('never lets low mood or missed exercise stop a task on their own', () => {
    const mood = evaluation([finding('drift:mood', 'act', ['mood'])], {
      mood: { status: 'act', driftStatus: 'act', delta: -1.6 },
    })
    const verdict = assessReadiness(TASKS.spacewalk, mood)
    expect(verdict.level).toBe('caution')
    expect(verdict.reasons[0].text).toBe('Mood is below your baseline')
    expect(verdict.alternative?.kind).toBe('shorten')

    const exercise = evaluation([finding('range:exerciseMin', 'act', ['exerciseMin'])], {
      exerciseMin: { status: 'act', band: classify('exerciseMin', 20) },
    })
    expect(levelOf('spacewalk', exercise)).toBe('caution')
    expect(levelOf('exercise', exercise)).toBe('go')
  })

  it('lists blood pressure once and puts the reasons that block first', () => {
    const e = evaluation(
      [
        finding('range:systolic', 'watch', ['systolic']),
        finding('range:diastolic', 'act', ['diastolic']),
        finding('pattern:behavioral', 'watch', ['sleepHours', 'mood']),
      ],
      {
        systolic: { status: 'watch', band: classify('systolic', 130) },
        diastolic: { status: 'act', band: classify('diastolic', 95) },
      },
    )
    const verdict = assessReadiness(TASKS.spacewalk, e)
    expect(verdict.level).toBe('no-go')
    expect(verdict.reasons.map((r) => [r.id, r.effect])).toEqual([
      ['range:diastolic', 'no-go'],
      ['pattern:behavioral', 'caution'],
    ])
  })

  it('judges a pattern it does not know by the indicators behind it', () => {
    const e = evaluation([finding('pattern:new', 'act', ['spo2', 'restingHr'])])
    const verdict = assessReadiness(TASKS.spacewalk, e)
    expect(verdict.level).toBe('no-go')
    expect(verdict.reasons[0]).toMatchObject({ text: 'Title of pattern:new', metric: 'spo2' })
    expect(levelOf('roboticArm', e)).toBe('go')
  })

  it('names the indicator behind every reason and the indicators it checked', () => {
    const e = evaluation([
      finding('pattern:fatigue', 'act', ['sleepHours', 'reactionMs']),
      finding('pattern:infection', 'act', ['bodyTemp', 'restingHr']),
    ])
    const verdict = assessReadiness(TASKS.spacewalk, e)
    for (const reason of verdict.reasons) {
      expect(METRIC_IDS).toContain(reason.metric)
      expect(reason.text.length).toBeGreaterThan(5)
    }
    expect(verdict.checked).toEqual(
      expect.arrayContaining(['reactionMs', 'sleepHours', 'restingHr', 'systolic', 'spo2', 'bodyTemp', 'radiationDose']),
    )
    expect(assessReadiness(TASKS.rest, e).checked).toEqual([])
  })
})

describe('verdict for the simulated mission', () => {
  const readings = simulateMission()
  const verdictOn = (day: number) => readinessForDay(evaluate(readings, day))

  /**
   * The days the plan was arranged around: demanding tasks on healthy days,
   * demanding tasks inside the scripted events, and routine days that show the
   * rules for rest, exercise and light work.
   */
  const CONTRAST: [day: number, task: TaskId, level: VerdictLevel, reason: string | null][] = [
    [9, 'burn', 'go', null],
    [23, 'spacewalk', 'go', null],
    // Sleep loss, days 28 to 46.
    [36, 'roboticArm', 'no-go', 'pattern:fatigue'],
    [40, 'rest', 'go', null],
    [42, 'spacewalk', 'no-go', 'pattern:fatigue'],
    [49, 'spacewalk', 'go', null],
    // After the life-support fault.
    [56, 'maintenance', 'no-go', 'pattern:atmosphere'],
    [60, 'burn', 'caution', 'drift:reactionMs'],
    [62, 'roboticArm', 'caution', 'drift:reactionMs'],
    [63, 'spacewalk', 'caution', 'drift:spo2'],
    // Infection, days 70 to 77.
    [73, 'roboticArm', 'no-go', 'pattern:infection'],
    [75, 'rest', 'go', null],
    // Blood pressure not measured.
    [90, 'burn', 'caution', 'unmeasured:systolic'],
    // Heart attack and the two weeks after it.
    [97, 'science', 'no-go', 'pattern:cardiac'],
    [101, 'exercise', 'no-go', 'recovery:heart'],
    // Exercise device out of service: the heart rate climbs, but a burn and the arm stay possible.
    [118, 'burn', 'go', null],
    [120, 'roboticArm', 'go', null],
    [128, 'spacewalk', 'no-go', 'pattern:deconditioning'],
    // No exercise session is planned while the device is out of service.
    [129, 'maintenance', 'go', null],
    [143, 'exercise', 'go', null],
    // Solar particle event.
    [148, 'spacewalk', 'no-go', 'range:radiationDose'],
    [149, 'exercise', 'no-go', 'range:radiationDose'],
    [151, 'spacewalk', 'go', null],
    // Low blood sugar.
    [153, 'burn', 'caution', 'range:glucose'],
    // Eight days after the second heart attack.
    [176, 'burn', 'no-go', 'recovery:heart'],
  ]

  it.each(CONTRAST)('day %i: %s is %s', (day, task, level, reason) => {
    const verdict = verdictOn(day)
    expect(verdict.task.id).toBe(task)
    expect(verdict.level).toBe(level)
    if (reason) expect(verdict.reasons.map((r) => r.id)).toContain(reason)
    else expect(verdict.reasons).toEqual([])
  })

  it('suggests the alternative that fits the cause', () => {
    expect(verdictOn(42).alternative?.kind).toBe('postpone')
    expect(verdictOn(63).alternative?.kind).toBe('shorten')
    expect(verdictOn(90).alternative).toMatchObject({ kind: 'measure', label: 'Measure first' })
    expect(verdictOn(90).reasons).toHaveLength(1)
    expect(verdictOn(101).alternative?.kind).toBe('lighter')
    expect(verdictOn(148).alternative?.text).toContain('A crewmate would face the same')
    expect(verdictOn(176).alternative?.kind).toBe('swap')
  })

  it("leads with the crew member's own findings and puts the cabin air last", () => {
    expect(verdictOn(42).reasons.map((r) => r.id)).toEqual(['pattern:behavioral', 'pattern:fatigue', 'pattern:co2'])
    expect(verdictOn(42).summary).toBe('Not advised today. The reasons listed stand in the way.')
    expect(verdictOn(148).summary).toBe('Not advised today. The reason listed stands in the way.')
    expect(verdictOn(63).summary).toBe('Possible with care. Settle the reason listed before you start.')
  })

  it('says that resting is the right plan on a rest day while unwell', () => {
    expect(verdictOn(40).summary).toBe('Resting is the right plan today.')
    expect(verdictOn(75).summary).toBe('Resting is the right plan today.')
    expect(verdictOn(12).summary).toBe('A planned day off. Nothing speaks against it.')
  })

  it('says that exercise is part of the fix while the heart deconditions', () => {
    expect(verdictOn(143).summary).toContain('part of the fix')
  })

  it('shows every verdict for the demanding tasks', () => {
    const seen: Record<string, Set<VerdictLevel>> = { spacewalk: new Set(), burn: new Set(), roboticArm: new Set() }
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const verdict = verdictOn(day)
      seen[verdict.task.id]?.add(verdict.level)
    }
    for (const task of Object.keys(seen)) expect([...seen[task]].sort(), task).toEqual(['caution', 'go', 'no-go'])
  })

  it('does not turn every bad day into a demanding one', () => {
    const demanding: TaskId[] = ['spacewalk', 'burn', 'roboticArm']
    let bad = 0
    let badAndDemanding = 0
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const status = evaluate(readings, day).status
      if (status !== 'act' && status !== 'critical') continue
      bad++
      if (demanding.includes(MISSION_PLAN[day - 1])) badAndDemanding++
    }
    expect(badAndDemanding).toBeGreaterThanOrEqual(8)
    expect(badAndDemanding).toBeLessThan(bad / 4)
  })

  it('is go on most days of the mission', () => {
    const counts: Record<VerdictLevel, number> = { go: 0, caution: 0, 'no-go': 0 }
    for (let day = 1; day <= MISSION_DAYS; day++) counts[verdictOn(day).level]++
    expect(counts).toEqual({ go: 129, caution: 29, 'no-go': 22 })
  })

  it('never gives a reason without a verdict, or a verdict without a way forward', () => {
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const verdict = verdictOn(day)
      if (verdict.level === 'go') {
        expect(verdict.reasons, `day ${day}`).toEqual([])
        expect(verdict.alternative, `day ${day}`).toBeNull()
      } else {
        expect(verdict.reasons.length, `day ${day}`).toBeGreaterThan(0)
        expect(verdict.alternative, `day ${day}`).not.toBeNull()
      }
      expect(verdict.summary.length, `day ${day}`).toBeGreaterThan(10)
    }
  })

  it('keeps every line it writes to the copy style', () => {
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const verdict = verdictOn(day)
      const copy = [verdict.summary, verdict.alternative?.text ?? '', ...verdict.reasons.map((r) => r.text)]
      for (const text of copy) expect(text, `day ${day}`).not.toMatch(DASHES_AND_DOTS)
    }
  })
})
