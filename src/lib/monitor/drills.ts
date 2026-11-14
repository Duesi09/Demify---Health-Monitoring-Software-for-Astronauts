/**
 * Timing and alarm texts of the stroke and seizure training drills, shared by
 * the simulator (server), the alarm rules and the crew page (client-safe: no
 * server-only imports).
 *
 * Sources for the medical content (cited again in
 * library/protocols/alarm-response.md):
 *  - Stroke: American Stroke Association, "Stroke symptoms" (F.A.S.T.: Face
 *    drooping, Arm weakness, Speech difficulty, Time to call; note the time
 *    the symptoms started), https://www.stroke.org/en/about-stroke/stroke-symptoms
 *  - Seizure: CDC, "First aid for seizures" (stay with the person, time the
 *    seizure, keep them safe, nothing in the mouth, do not hold them down,
 *    on their side when it ends; longer than 5 minutes, repeated seizures or
 *    trouble breathing is an emergency),
 *    https://www.cdc.gov/epilepsy/first-aid-for-seizures/index.html
 *
 * A stroke cannot be recognised from vital signs: the stroke drill is a crew
 * symptom report with a plausible monitor, and its alarm says so.
 */

/** Duration of the convulsions in the seizure drill (s): bounded, under the 5-minute emergency limit. */
export const SEIZURE_ACTIVE_S = 150;

/** Monitor alarm of the stroke drill (high priority, a crew report, not a measured value). */
export const STROKE_ALARM_TEXT = "Stroke signs reported (F.A.S.T.)";
/** Monitor alarm while the drill seizure lasts (high priority). */
export const SEIZURE_ALARM_TEXT = "Seizure (training)";
/** Monitor alarm after the drill seizure ended (medium priority, recovery). */
export const SEIZURE_ENDED_ALARM_TEXT = "Seizure ended (training): recovery";

/** What the UI says about the stroke drill's signs: they are reported, not measured. */
export const REPORTED_NOT_MEASURED = "Reported by the crew, not measured";

/** Whether the drill seizure is still going on `elapsedS` seconds after the drill started. */
export function seizureActive(elapsedS: number): boolean {
  return elapsedS < SEIZURE_ACTIVE_S;
}
