'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { Btn, Card, Row, SectionLabel, StatusPill, Toast } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';
import { wagmiConfig } from '@/lib/wagmi/config';
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, AGENT_NFT_ADDRESS, AGENT_NFT_ABI } from '@/lib/contracts';
import { zgTestnet } from '@/lib/wagmi/config';
import { pauseAgent, resumeAgent, getPendingActions, ackAction } from '@/lib/agent/client';

interface Agent {
  id: number;
  name: string;
  risk: string;
  status: 'running' | 'setting up' | 'paused';
  value: string;
}

const ALLOCATIONS = [
  { sym: 'ETH', pct: 38, color: '#5e8880' },
  { sym: 'BTC', pct: 28, color: '#8AADA4' },
  { sym: 'SOL', pct: 15, color: '#B8CFC8' },
  { sym: 'USDC', pct: 12, color: '#CDC9C3' },
  { sym: 'Other', pct: 7, color: '#D9E4DD' },
];

const ACTIVITIES = [
  { time: '14:22', action: 'Rebalance', assets: 'ETH→SOL', amount: '$1,240', hash: '0x9f2a...', status: 'attested' as const },
  { time: '09:15', action: 'Strategy check', assets: 'Portfolio', amount: '—', hash: '0x8b1c...', status: 'attested' as const },
  { time: '06:03', action: 'Rebalance', assets: 'BTC→ETH', amount: '$880', hash: '0x7d4e...', status: 'attested' as const },
  { time: 'Yest 23:41', action: 'Rebalance', assets: 'USDC→ARB', amount: '$540', hash: '0x6a3f...', status: 'attested' as const },
  { time: 'Yest 18:02', action: 'Strategy check', assets: 'Portfolio', amount: '—', hash: '0x5c2b...', status: 'pending' as const },
];

function donutPaths(allocations: typeof ALLOCATIONS) {
  const cx = 80, cy = 80, r = 60, gap = 0.02;
  let angle = -Math.PI / 2;
  return allocations.map(a => {
    const sweep = (a.pct / 100) * (2 * Math.PI) - gap;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep + gap;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: a.color, sym: a.sym, pct: a.pct };
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const isWrongNetwork = !!address && chainId !== zgTestnet.id;

  const [agentStatus, setAgentStatus] = useState<'running' | 'paused'>('running');
  const [period, setPeriod] = useState('30d');
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeAgent, setActiveAgent] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [nftMeta, setNftMeta] = useState<{ dilithiumFingerprint: `0x${string}`; configRoot: `0x${string}`; actionSigFingerprint: `0x${string}`; skillKey: `0x${string}`; mintedAt: bigint } | null>(null);
  const [perfScore, setPerfScore] = useState<{ totalActions: bigint; successCount: bigint; pnlBasisPoints: bigint; lastUpdatedAt: bigint } | null>(null);
  const [nftLoading, setNftLoading] = useState(false);

  useEffect(() => {
    setWalletAddress(sessionStorage.getItem('spike_wallet'));
  }, []);

  useEffect(() => {
    // Optimistic fallback: show stored agent immediately while on-chain load happens
    const storedId = sessionStorage.getItem('spike_agent_id');
    if (storedId && agents.length === 0) {
      setAgents([{ id: Number(storedId), name: 'Agent 1', risk: 'balanced', status: 'running', value: '$0' }]);
    }

    if (!address || !AGENT_REGISTRY_ADDRESS) return;
    setAgentsLoading(true);
    readContract(wagmiConfig, {
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'getOwnerAgents',
      args: [address],
      chainId: zgTestnet.id,
    })
      .then((ids) => {
        const agentIds = ids as bigint[];
        if (agentIds.length === 0) return;
        setAgents(agentIds.map((id, i) => ({
          id: Number(id),
          name: `Agent ${i + 1}`,
          risk: 'balanced',
          status: 'running' as const,
          value: '$0',
        })));
        const idx = storedId ? agentIds.findIndex(id => id.toString() === storedId) : -1;
        setActiveAgent(idx >= 0 ? idx : agentIds.length - 1);
      })
      .catch(() => null)
      .finally(() => setAgentsLoading(false));
  }, [address]);

  useEffect(() => {
    if (!address || !AGENT_NFT_ADDRESS || !AGENT_REGISTRY_ADDRESS || agents.length === 0) return;
    const agent = agents[activeAgent];
    if (!agent) return;
    const agentId = BigInt(agent.id);
    setNftLoading(true);
    Promise.all([
      readContract(wagmiConfig, {
        address: AGENT_NFT_ADDRESS,
        abi: AGENT_NFT_ABI,
        functionName: 'getAgentMeta',
        args: [agentId],
        chainId: zgTestnet.id,
      }),
      readContract(wagmiConfig, {
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'getPerformanceScore',
        args: [agentId],
        chainId: zgTestnet.id,
      }),
    ])
      .then(([meta, perf]) => {
        setNftMeta(meta as { dilithiumFingerprint: `0x${string}`; configRoot: `0x${string}`; actionSigFingerprint: `0x${string}`; skillKey: `0x${string}`; mintedAt: bigint });
        setPerfScore(perf as { totalActions: bigint; successCount: bigint; pnlBasisPoints: bigint; lastUpdatedAt: bigint });
      })
      .catch(() => null)
      .finally(() => setNftLoading(false));
  }, [address, activeAgent, agents]);

  // Poll agent service for unrecorded actions and submit them on-chain.
  useEffect(() => {
    if (!address || !AGENT_REGISTRY_ADDRESS || agents.length === 0) return;
    const agent = agents[activeAgent];
    if (!agent) return;
    const agentId = agent.id;

    async function submitPending() {
      const pending = await getPendingActions(agentId).catch(() => []);
      for (const action of pending) {
        try {
          const hash = await writeContractAsync({
            address: AGENT_REGISTRY_ADDRESS!,
            abi: AGENT_REGISTRY_ABI,
            functionName: 'recordAction',
            args: [
              BigInt(agentId),
              action.actionHash as `0x${string}`,
              action.success,
              BigInt(action.pnlBps),
            ],
          });
          await waitForTransactionReceipt(wagmiConfig, { hash });
          await ackAction(agentId, action.id).catch(() => null);
        } catch {
          // Non-critical — will retry on next poll
        }
      }
      if (pending.length > 0) {
        // Refresh performance score after recording actions
        readContract(wagmiConfig, {
          address: AGENT_REGISTRY_ADDRESS!,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'getPerformanceScore',
          args: [BigInt(agentId)],
          chainId: zgTestnet.id,
        })
          .then(perf => setPerfScore(perf as typeof perfScore))
          .catch(() => null);
      }
    }

    submitPending();
    const timer = setInterval(submitPending, 30_000);
    return () => clearInterval(timer);
  }, [address, activeAgent, agents, writeContractAsync]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const totalValue = 24831.45;
  const change24h = 342.18;
  const currentAPY = 11.4;
  const sharpe = 1.82;

  const makeSparkline = () => {
    let v = 1.4; const pts: number[] = [];
    for (let i = 0; i < 30; i++) { v += (Math.random() - 0.44) * 0.12; pts.push(Math.max(1.1, v)); }
    return pts;
  };
  const sparkData = useMemo(() => makeSparkline(), []);
  const maxS = Math.max(...sparkData), minS = Math.min(...sparkData);
  const sparkPath = sparkData.map((v, i) => {
    const x = (i / (sparkData.length - 1)) * 320;
    const y = 60 - ((v - minS) / (maxS - minS)) * 50;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const sparkFill = sparkPath + ` L 320 60 L 0 60 Z`;

  const slices = donutPaths(ALLOCATIONS);

  const getAgentId = (): number => agents[activeAgent]?.id ?? parseInt(sessionStorage.getItem('spike_agent_id') ?? '1', 10);

  const handlePauseResume = () => {
    if (agentStatus === 'running') setShowConfirm(true);
    else handleResume();
  };

  const handleResume = async () => {
    const agentId = getAgentId();
    setActionLoading(true);
    try {
      await resumeAgent(agentId).catch(() => null); // non-critical if service down
      if (address && AGENT_REGISTRY_ADDRESS) {
        const hash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'resumeAgent',
          args: [BigInt(agentId)],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
      setAgentStatus('running');
      showToast('Bot resumed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to resume', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPause = async () => {
    const agentId = getAgentId();
    setShowConfirm(false);
    setActionLoading(true);
    try {
      await pauseAgent(agentId).catch(() => null); // non-critical if service down
      if (address && AGENT_REGISTRY_ADDRESS) {
        const hash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'pauseAgent',
          args: [BigInt(agentId)],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
      setAgentStatus('paused');
      showToast('Bot paused');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to pause', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const addAgent = () => {
    const newId = agents.length;
    setAgents(prev => [...prev, { id: newId, name: `Agent ${newId + 1}`, risk: 'balanced', status: 'setting up', value: '$0' }]);
    setActiveAgent(newId);
    router.push('/app/configure');
  };

  const truncatedWallet = walletAddress
    ? (walletAddress.length > 12 ? walletAddress : walletAddress)
    : null;

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh' }}>
      {/* NavBar */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 64, background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12 }}>
        <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#555555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBF7F0' }}><Icons.Sun /></div>
          <div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: '#555555', lineHeight: 1 }}>Spike</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8AADA4', marginTop: 1 }}>Quantum DeFi Agent</div>
          </div>
        </button>
        <div style={{ flex: 1 }} />
        {truncatedWallet && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '4px 10px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5e8880' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5e8880' }} />PQC Active
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#D9E4DD', border: '1px solid #B8CFC8', borderRadius: 99, padding: '6px 12px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: '#555555' }}>
              <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{truncatedWallet}</span>
            </div>
          </div>
        )}
        <button onClick={() => router.push('/app/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8A49E', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#555555')}
          onMouseLeave={e => (e.currentTarget.style.color = '#A8A49E')}>
          <Icons.Settings />
        </button>
      </nav>

      {/* Wrong network banner */}
      {isWrongNetwork && (
        <div style={{ background: '#fff3cd', borderBottom: '1px solid #ffe69c', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: '#856404' }}>
            Wrong network — connect to 0G Testnet to see your agents
          </span>
          <button
            onClick={() => switchChain({ chainId: zgTestnet.id })}
            style={{ background: '#856404', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Switch to 0G Testnet
          </button>
        </div>
      )}

      {/* Agent tabs */}
      <div style={{ background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', padding: '0 24px', display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
        {agentsLoading ? (
          <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 72, height: 16, borderRadius: 8, background: '#EDF3F0' }} />
            <div style={{ width: 56, height: 16, borderRadius: 8, background: '#EDF3F0' }} />
          </div>
        ) : (
          agents.map((a, i) => (
            <button key={a.id} onClick={() => setActiveAgent(i)} style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeAgent === i ? '2px solid #555555' : '2px solid transparent', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: activeAgent === i ? 700 : 500, fontSize: 14, color: activeAgent === i ? '#555555' : '#A8A49E', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: a.status === 'running' ? '#2d6a4f' : a.status === 'setting up' ? '#856404' : '#A8A49E' }} />
              {a.name}
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 11, color: activeAgent === i ? '#8AADA4' : '#CDC9C3' }}>{a.value}</span>
            </button>
          ))
        )}
        <button onClick={addAgent} style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: '#A8A49E', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#555555')}
          onMouseLeave={e => (e.currentTarget.style.color = '#A8A49E')}>
          <Icons.Plus />Add agent
        </button>
      </div>

      {/* Dashboard header */}
      <div style={{ background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555', letterSpacing: '-0.01em' }}>Your portfolio</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: agentStatus === 'running' ? '#d4edda' : '#fff3cd', border: `1px solid ${agentStatus === 'running' ? '#b7dfbe' : '#ffe69c'}`, borderRadius: 99, padding: '3px 10px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: agentStatus === 'running' ? '#2d6a4f' : '#856404' }} />
                <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: agentStatus === 'running' ? '#2d6a4f' : '#856404' }}>
                  {agentStatus === 'running' ? 'Bot is running' : 'Bot is paused'}
                </span>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>Managing since 4 days ago · Last trade 8 minutes ago</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={() => router.push('/app/configure')}>Change strategy</Btn>
            <Btn variant={agentStatus === 'running' ? 'sage' : 'primary'} size="sm"
              icon={actionLoading ? undefined : agentStatus === 'running' ? <Icons.Pause /> : <Icons.Play />}
              onClick={handlePauseResume}
              style={{ minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {actionLoading ? (
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(85,85,85,0.3)', borderTopColor: '#555555', animation: 'spin 0.8s linear infinite' }} />
              ) : agentStatus === 'running' ? 'Pause bot' : 'Resume bot'}
            </Btn>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!agentsLoading && agents.length === 0 && (
        <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555', marginBottom: 10 }}>No agents yet</div>
          <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 28, lineHeight: 1.7 }}>
            No agents found for this wallet on-chain. Deploy your first Spike agent to get started.
          </div>
          <Btn size="lg" onClick={() => router.push('/app/configure')}>Deploy your first agent →</Btn>
        </div>
      )}

      {/* Main content */}
      {agents.length > 0 && (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>

          {/* Holdings */}
          <Card>
            <SectionLabel>Holdings</SectionLabel>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="60" fill="none" />
                  {slices.map(s => <path key={s.sym} d={s.path} fill={s.color} />)}
                  <circle cx="80" cy="80" r="38" fill="#FBF7F0" />
                  <text x="80" y="77" textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontWeight="900" fontSize="14" fill="#555555">${(totalValue / 1000).toFixed(1)}k</text>
                  <text x="80" y="93" textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="10" fill="#A8A49E">Total</text>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 28, color: '#555555', letterSpacing: '-0.02em' }}>${totalValue.toLocaleString()}</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#2d6a4f', marginBottom: 12 }}>+${change24h.toFixed(2)} today</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ALLOCATIONS.map(a => (
                    <div key={a.sym} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: '#555555', minWidth: 36 }}>{a.sym}</span>
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>{a.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {AGENT_NFT_ADDRESS && AGENT_REGISTRY_ADDRESS && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <SectionLabel>Agent NFT</SectionLabel>
                <span style={{ background: '#555555', color: '#FBF7F0', borderRadius: 6, padding: '2px 7px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontWeight: 700, fontSize: 10, letterSpacing: '0.06em' }}>INFT</span>
              </div>
              {nftLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[80, 60, 60, 50, 70].map((w, i) => (
                    <div key={i} style={{ height: 14, borderRadius: 6, background: '#D9E4DD', width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              ) : nftMeta ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Row label="Dilithium FP">
                    <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#555555' }}>
                      {nftMeta.dilithiumFingerprint.slice(0, 10)}…{nftMeta.dilithiumFingerprint.slice(-4)}
                    </span>
                  </Row>
                  <Row label="Skill key">
                    <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#555555' }}>
                      {nftMeta.skillKey.slice(0, 10)}…
                    </span>
                  </Row>
                  <Row label="Minted">
                    <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#555555' }}>
                      {new Date(Number(nftMeta.mintedAt) * 1000).toLocaleDateString()}
                    </span>
                  </Row>
                  {perfScore && (
                    <>
                      <Row label="Total actions">
                        <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>
                          {perfScore.totalActions.toString()}
                        </span>
                      </Row>
                      <Row label="Success rate">
                        <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>
                          {perfScore.totalActions > 0n
                            ? ((Number(perfScore.successCount) / Number(perfScore.totalActions)) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      </Row>
                      <Row label="PnL bps">
                        <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 13, color: perfScore.pnlBasisPoints >= 0n ? '#2d6a4f' : '#842029' }}>
                          {perfScore.pnlBasisPoints >= 0n ? '+' : ''}{perfScore.pnlBasisPoints.toString()}
                        </span>
                      </Row>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>No agent NFT found for this session.</div>
              )}
            </Card>
          )}

          {/* Performance */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <SectionLabel>How it&apos;s doing</SectionLabel>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {['7d', '30d', 'All'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{ padding: '4px 10px', borderRadius: 99, border: 'none', background: period === p ? '#555555' : 'transparent', color: period === p ? '#FBF7F0' : '#A8A49E', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s' }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Risk score', value: sharpe.toFixed(2) },
                { label: 'Yearly return', value: `${currentAPY}%` },
                { label: 'Trades made', value: '47' },
              ].map(m => (
                <div key={m.label} style={{ background: '#D9E4DD', borderRadius: 12, padding: '8px 14px' }}>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 900, fontSize: 18, color: '#555555' }}>{m.value}</div>
                  <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 10, color: '#8AADA4', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</div>
                </div>
              ))}
            </div>
            <svg width="100%" viewBox="0 0 320 60" preserveAspectRatio="none" style={{ height: 64 }}>
              <path d={sparkFill} fill="rgba(217,228,221,0.5)" />
              <path d={sparkPath} fill="none" stroke="#5e8880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Card>
        </div>

        {/* Bot activity */}
        <Card sage style={{ marginBottom: 16 }}>
          <SectionLabel>Bot activity</SectionLabel>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Last rebalance', value: '8 min ago' },
              { label: 'Decision quality', value: '94.2%' },
              { label: 'Next check', value: 'in ~52 min' },
              { label: 'Total trades', value: '47' },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8AADA4', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 18, color: '#555555' }}>{m.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent trades */}
        <Card>
          <SectionLabel>Recent trades</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13 }}>
              <thead>
                <tr>
                  {['Time', 'Action', 'Coins', 'Amount', 'Transaction', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8A49E', borderBottom: '1px solid #CDC9C3' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIVITIES.map((a, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#FBF7F0' : '#EDF3F0' }}>
                    <td style={{ padding: '12px 12px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#A8A49E' }}>{a.time}</td>
                    <td style={{ padding: '12px 12px', fontWeight: 700, color: '#555555' }}>{a.action}</td>
                    <td style={{ padding: '12px 12px', color: '#555555' }}>{a.assets}</td>
                    <td style={{ padding: '12px 12px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#555555' }}>{a.amount}</td>
                    <td style={{ padding: '12px 12px' }}>
                      <a href="#" style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#5e8880', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {a.hash} <Icons.ExternalLink />
                      </a>
                    </td>
                    <td style={{ padding: '12px 12px' }}><StatusPill status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      )}

      {/* Pause confirm modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(85,85,85,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FBF7F0', borderRadius: 24, border: '1.5px solid #CDC9C3', padding: 32, maxWidth: 380, width: '100%', animation: 'modalIn 0.2s ease' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#555555', marginBottom: 10 }}>Pause bot?</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 24, lineHeight: 1.7 }}>Your bot will stop all automatic trades. Your funds stay in place and you can resume any time.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</Btn>
              <Btn style={{ flex: 1 }} onClick={handleConfirmPause}>Pause Bot</Btn>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}
