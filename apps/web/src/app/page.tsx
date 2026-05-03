export default function LandingPage() {
  return (
    <main>
      {/* Screen 01 — Landing / Marketing Page */}
      <section className="min-h-screen bg-sage flex flex-col items-center justify-center px-6">
        <h1 className="font-nunito font-black text-6xl text-charcoal tracking-tight">Spike.</h1>
        <p className="font-nunito-sans text-xl text-charcoal/70 mt-4 max-w-lg text-center">
          Quantum-safe, quantum-enhanced autonomous DeFi portfolio management on 0G Network.
        </p>
        <a
          href="/app"
          className="mt-10 px-8 py-4 bg-charcoal text-cream font-nunito font-bold text-lg rounded-xl hover:bg-charcoal/90 transition-colors"
        >
          Launch App
        </a>
      </section>

      {/* Stats strip */}
      <section className="bg-cream border-y border-stone py-8 flex justify-center gap-12 flex-wrap px-6">
        {[
          { label: 'Agents Running', value: '—' },
          { label: 'Total Value Managed', value: '—' },
          { label: 'Avg Sharpe Lift', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-cream border border-stone rounded-2xl px-8 py-4 text-center">
            <p className="font-nunito font-black text-3xl text-charcoal">{value}</p>
            <p className="font-nunito-sans text-sm text-charcoal/60 mt-1">{label}</p>
          </div>
        ))}
      </section>

      {/* Feature cards */}
      <section className="bg-cream py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'Quantum Optimised', body: 'IBM Heron r3 QPU runs portfolio optimization and risk simulation via Qiskit.' },
            { title: 'PQC Secured', body: 'Dilithium3 signing and Kyber-1024 encryption — NIST 2024 post-quantum standards.' },
            { title: 'Fully Verifiable', body: '0G Compute TEE attestation for every agent action. On-chain audit trail.' },
          ].map(({ title, body }) => (
            <div key={title} className="border border-stone rounded-2xl p-6 bg-cream hover:border-charcoal transition-colors">
              <h3 className="font-nunito font-bold text-lg text-charcoal">{title}</h3>
              <p className="font-nunito-sans text-sm text-charcoal/60 mt-2">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
