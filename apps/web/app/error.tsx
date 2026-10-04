'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Could not open this workspace</h1>
      <p>Please try again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
