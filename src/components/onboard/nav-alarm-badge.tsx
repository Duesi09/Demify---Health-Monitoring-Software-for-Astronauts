"use client";

import { NAV_ALERT_LABEL } from "@/lib/assistant/alarm-events";
import "./nav-alarm-badge.css";

/**
 * The "!" on the Assistant nav item: shown while Demify has an active high-
 * or medium-priority alarm (the shared GET /api/alarms store), because the
 * assistant then has the matching checklist passages ready on /assistant.
 * The alarm itself always comes from Demify's alarms, never from the
 * assistant.
 */
export function NavAlarmBadge() {
  return (
    <span role="img" aria-label={NAV_ALERT_LABEL} title={NAV_ALERT_LABEL} className="nav-alarm-badge">
      <span aria-hidden>!</span>
    </span>
  );
}
