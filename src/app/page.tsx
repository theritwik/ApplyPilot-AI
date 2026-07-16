import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">ApplyPilot AI</h1>
      <p className="max-w-md text-muted-foreground">
        Evidence-based match scores and truthful, human-approved resume tailoring. You review every
        change; you apply manually.
      </p>
      <Button disabled>Sign in (arrives with M1)</Button>
    </main>
  );
}
