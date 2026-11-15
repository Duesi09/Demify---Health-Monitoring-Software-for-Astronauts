/**
 * Demify's assistant bot: a small friendly robot with a heart-beat antenna.
 * Our own artwork (inline SVG, no external image). The eyes blink slowly
 * unless the viewer prefers reduced motion; `alert` turns the antenna tip red
 * and lets it pulse (used while an alarm is active).
 */
export function AssistantBot({ size = 44, alert = false, className = "" }: { size?: number; alert?: boolean; className?: string }) {
  const tip = alert ? "#e5484d" : "#3ba3e6";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Demify assistant"
      className={`demify-bot ${alert ? "demify-bot-alert" : ""} ${className}`}
    >
      <style>{`
        .demify-bot .bot-eye { transform-origin: center; transform-box: fill-box; animation: bot-blink 5s infinite; }
        .demify-bot-alert .bot-tip { transform-origin: center; transform-box: fill-box; animation: bot-pulse 1s ease-in-out infinite; }
        @keyframes bot-blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
        @keyframes bot-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .75; } }
        @media (prefers-reduced-motion: reduce) { .demify-bot .bot-eye, .demify-bot-alert .bot-tip { animation: none; } }
      `}</style>
      {/* antenna with a heart-beat tip */}
      <line x1="32" y1="9" x2="32" y2="17" stroke="#0b6fa8" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="bot-tip" cx="32" cy="7.5" r="4" fill={tip} />
      {/* ears */}
      <rect x="6" y="28" width="6" height="12" rx="3" fill="#0b6fa8" />
      <rect x="52" y="28" width="6" height="12" rx="3" fill="#0b6fa8" />
      {/* head */}
      <rect x="10" y="16" width="44" height="36" rx="13" fill="#0b7fc1" />
      <rect x="10" y="16" width="44" height="18" rx="13" fill="#ffffff" opacity=".12" />
      {/* face screen */}
      <rect x="16" y="22" width="32" height="24" rx="9" fill="#f4f9fd" />
      {/* eyes */}
      <ellipse className="bot-eye" cx="25" cy="32" rx="3.2" ry="3.8" fill="#0f1729" />
      <ellipse className="bot-eye" cx="39" cy="32" rx="3.2" ry="3.8" fill="#0f1729" />
      <circle cx="26.2" cy="30.6" r="1" fill="#ffffff" />
      <circle cx="40.2" cy="30.6" r="1" fill="#ffffff" />
      {/* cheeks + smile */}
      <circle cx="20.5" cy="38.5" r="2.2" fill="#ff8fa3" opacity=".55" />
      <circle cx="43.5" cy="38.5" r="2.2" fill="#ff8fa3" opacity=".55" />
      <path d="M27 39.5 Q32 43.5 37 39.5" fill="none" stroke="#0f1729" strokeWidth="2" strokeLinecap="round" />
      {/* body hint with a small ECG line */}
      <rect x="22" y="52" width="20" height="8" rx="4" fill="#0b6fa8" />
      <path d="M24.5 56h4l1.5-2.5 2 5 1.5-2.5h6" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
