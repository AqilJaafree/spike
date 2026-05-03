export default function AppPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      {/* Wallet connect gate — Screen 02 */}
      <div className="bg-cream border border-stone rounded-2xl p-8 w-full max-w-sm shadow-sm">
        <h2 className="font-nunito font-bold text-xl text-charcoal mb-6">Connect your wallet</h2>
        <div className="space-y-3">
          {['MetaMask', 'WalletConnect', 'Coinbase Wallet'].map((wallet) => (
            <button
              key={wallet}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-stone hover:bg-sage transition-colors font-nunito-sans text-charcoal"
            >
              <span>{wallet}</span>
              <span className="text-charcoal/40">›</span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-charcoal/40 mt-6">
          <a href="#" className="underline">What is a wallet?</a>
        </p>
      </div>
    </main>
  );
}
