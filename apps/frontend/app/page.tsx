export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-2xl text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Frontend status
        </p>
        <h1 className="text-4xl font-semibold text-foreground sm:text-5xl">
          CodeSync Development Environment
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">Frontend is running.</p>
      </section>
    </main>
  );
}
