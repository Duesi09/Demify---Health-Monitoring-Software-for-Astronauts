import Link from "next/link";

export default function CrewNotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Crew Monitor</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Unknown crew member</h1>
      <p className="mt-3 text-sm text-muted">There is no crew member with this id on the current mission.</p>
      <Link
        href="/crew"
        className="mt-6 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90"
      >
        Open the crew monitor
      </Link>
    </div>
  );
}
