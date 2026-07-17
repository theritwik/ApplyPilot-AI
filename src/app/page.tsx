export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-100">
      <h1 className="text-3xl font-semibold tracking-tight">ApplyPilot AI</h1>
      <p className="max-w-md text-sm text-slate-400">
        Foundation milestone (M0) is under construction. See{" "}
        <code className="rounded bg-slate-900 px-1.5 py-0.5">docs/PLAN.md</code> for the full
        roadmap.
      </p>
    </main>
  );
}
