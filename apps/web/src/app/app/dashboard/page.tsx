'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { Btn, Card, Row, SectionLabel, StatusPill, Toast } from '@/components/ui/primitives';
import { Icons } from '@/components/ui/icons';
import type { AgentConfig } from '@spike/0g-client';
import { wagmiConfig } from '@/lib/wagmi/config';
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, AGENT_NFT_ADDRESS, AGENT_NFT_ABI } from '@/lib/contracts';
import { zgTestnet } from '@/lib/wagmi/config';
import { pauseAgent, resumeAgent, getPendingActions, ackAction, getAgentStatus, type AgentStatus } from '@/lib/agent/client';
import { fetchPrices, formatPrice } from '@/lib/prices/client';

interface Agent {
  id: number;
  name: string;
  risk: string;
  status: 'running' | 'setting up' | 'paused';
  value: string;
}

const DONUT_COLORS = ['#5e8880', '#8AADA4', '#B8CFC8', '#CDC9C3', '#D9E4DD', '#A8C5BF'];

function weightsToAllocations(weights?: Record<string, number>) {
  if (!weights || Object.keys(weights).length === 0) return [
    { sym: 'ETH', pct: 38, color: '#5e8880' },
    { sym: 'BTC', pct: 28, color: '#8AADA4' },
    { sym: 'SOL', pct: 15, color: '#B8CFC8' },
    { sym: 'USDC', pct: 12, color: '#CDC9C3' },
    { sym: 'Other', pct: 7, color: '#D9E4DD' },
  ];
  return Object.entries(weights).map(([sym, w], i) => ({
    sym,
    pct: Math.round(w * 100),
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
}

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function donutPaths(allocations: Array<{ sym: string; pct: number; color: string }>) {
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
  const { writeContractAsync } = useWriteContract();
  const isWrongNetwork = !!address && chainId !== zgTestnet.id;

  const [botStatus, setBotStatus] = useState<'running' | 'paused'>('running');
  const [period, setPeriod] = useState('30d');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [activeAgent, setActiveAgent] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [nftMeta, setNftMeta] = useState<{ dilithiumFingerprint: `0x${string}`; configRoot: `0x${string}`; actionSigFingerprint: `0x${string}`; skillKey: `0x${string}`; mintedAt: bigint } | null>(null);
  const [perfScore, setPerfScore] = useState<{ totalActions: bigint; successCount: bigint; pnlBasisPoints: bigint; lastUpdatedAt: bigint } | null>(null);
  const [agentOnChain, setAgentOnChain] = useState<{ owner: `0x${string}`; status: number; deployedAt: bigint; lastActionAt: bigint; rebalanceCount: bigint } | null>(null);
  const [nftName, setNftName] = useState<string | null>(null);
  const [nftLoading, setNftLoading] = useState(false);
  const [intelligentData, setIntelligentData] = useState<Array<{ dataDescription: string; dataHash: `0x${string}` }>>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<readonly `0x${string}`[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const isWrongOwner = !!(agentOnChain && address && agentOnChain.owner.toLowerCase() !== address.toLowerCase());

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
    Promise.allSettled([
      readContract(wagmiConfig, { address: AGENT_NFT_ADDRESS, abi: AGENT_NFT_ABI, functionName: 'getAgentMeta', args: [agentId], chainId: zgTestnet.id }),
      readContract(wagmiConfig, { address: AGENT_REGISTRY_ADDRESS, abi: AGENT_REGISTRY_ABI, functionName: 'getPerformanceScore', args: [agentId], chainId: zgTestnet.id }),
      readContract(wagmiConfig, { address: AGENT_REGISTRY_ADDRESS, abi: AGENT_REGISTRY_ABI, functionName: 'getAgent', args: [agentId], chainId: zgTestnet.id }),
      readContract(wagmiConfig, { address: AGENT_NFT_ADDRESS, abi: AGENT_NFT_ABI, functionName: 'tokenURI', args: [agentId], chainId: zgTestnet.id }),
      readContract(wagmiConfig, { address: AGENT_NFT_ADDRESS, abi: AGENT_NFT_ABI, functionName: 'intelligentDataOf', args: [agentId], chainId: zgTestnet.id }),
      readContract(wagmiConfig, { address: AGENT_NFT_ADDRESS, abi: AGENT_NFT_ABI, functionName: 'authorizedUsersOf', args: [agentId], chainId: zgTestnet.id }),
    ])
      .then(([meta, perf, agent, uri, iData, authUsers]) => {
        if (meta.status === 'fulfilled') setNftMeta(meta.value as { dilithiumFingerprint: `0x${string}`; configRoot: `0x${string}`; actionSigFingerprint: `0x${string}`; skillKey: `0x${string}`; mintedAt: bigint });
        if (perf.status === 'fulfilled') setPerfScore(perf.value as { totalActions: bigint; successCount: bigint; pnlBasisPoints: bigint; lastUpdatedAt: bigint });
        if (agent.status === 'fulfilled') {
          const a = agent.value as { owner: `0x${string}`; status: number; deployedAt: bigint; lastActionAt: bigint; rebalanceCount: bigint };
          setAgentOnChain(a);
          if (a.status === 0) setBotStatus('running');
          else if (a.status === 1) setBotStatus('paused');
        }
        if (uri.status === 'fulfilled') {
          try {
            const raw = uri.value as string;
            const prefix = 'data:application/json;charset=utf-8,';
            const json = JSON.parse(raw.startsWith(prefix) ? raw.slice(prefix.length) : raw) as { name: string };
            setNftName(json.name);
          } catch { /* non-critical */ }
        }
        if (iData.status === 'fulfilled') setIntelligentData(iData.value as Array<{ dataDescription: string; dataHash: `0x${string}` }>);
        if (authUsers.status === 'fulfilled') setAuthorizedUsers(authUsers.value as readonly `0x${string}`[]);
      })
      .finally(() => setNftLoading(false));
  }, [address, activeAgent, agents]);

  useEffect(() => {
    const assets = agentStatus?.config.assets ?? ['ETH', 'BTC', 'SOL', 'USDC'];
    fetchPrices(assets).then(setLivePrices).catch(() => null);
  }, [agentStatus?.config.assets?.join(',')]);

  useEffect(() => {
    if (agents.length === 0) return;
    const agentId = agents[activeAgent]?.id;
    if (!agentId) return;
    let cancelled = false;
    async function poll() {
      const status = await getAgentStatus(agentId);
      if (!cancelled) setAgentStatus(status);
    }
    poll();
    const t = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [agents, activeAgent]);

  useEffect(() => {
    if (!address || !AGENT_REGISTRY_ADDRESS || agents.length === 0) return;
    const agent = agents[activeAgent];
    if (!agent) return;
    const agentId = agent.id;

    async function submitPending() {
      if (chainId !== zgTestnet.id) return;
      const pending = await getPendingActions(agentId).catch(() => []);
      for (const action of pending) {
        try {
          const hash = await writeContractAsync({
            address: AGENT_REGISTRY_ADDRESS!,
            abi: AGENT_REGISTRY_ABI,
            functionName: 'recordAction',
            chainId: zgTestnet.id,
            args: [
              BigInt(agentId),
              action.actionHash as `0x${string}`,
              action.success,
              BigInt(action.pnlBps),
            ],
          });
          await waitForTransactionReceipt(wagmiConfig, { hash });
          await ackAction(agentId, action.id).catch(() => null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Surface the first failure — user needs to know (wrong wallet, rejected, wrong chain)
          showToast(`Record action failed: ${msg.slice(0, 100)}`, 'error');
          break;
        }
      }
      if (pending.length > 0) {
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
  }, [address, chainId, activeAgent, agents, writeContractAsync]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  };

  const totalValue = 24831.45;
  const change24h = agentStatus?.pendingActions.slice(-1)[0]?.pnlBps
    ? agentStatus.pendingActions.slice(-1)[0].pnlBps * 2.48
    : 342.18;
  const sharpe = agentStatus?.lastSharpe ?? 0;
  const currentAPY = sharpe > 0 ? parseFloat((sharpe * 6.2).toFixed(1)) : 11.4;

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

  const allocations = weightsToAllocations(agentStatus?.lastWeights);
  const slices = donutPaths(allocations);

  const getAgentId = (): number => agents[activeAgent]?.id ?? parseInt(sessionStorage.getItem('spike_agent_id') ?? '1', 10);

  const handlePauseResume = () => {
    if (botStatus === 'running') setShowConfirm(true);
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
          chainId: zgTestnet.id,
          args: [BigInt(agentId)],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
      setBotStatus('running');
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
          chainId: zgTestnet.id,
          args: [BigInt(agentId)],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
      setBotStatus('paused');
      showToast('Bot paused');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to pause', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const agentId = getAgentId();
    setShowWithdrawConfirm(false);
    setActionLoading(true);
    try {
      if (address && AGENT_REGISTRY_ADDRESS) {
        const hash = await writeContractAsync({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'withdrawAgent',
          chainId: zgTestnet.id,
          args: [BigInt(agentId)],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash });
      }
      setBotStatus('paused');
      setAgents(prev => prev.filter((_, i) => i !== activeAgent));
      setActiveAgent(0);
      sessionStorage.removeItem('spike_deployed');
      sessionStorage.removeItem('spike_agent_id');
      showToast('Agent withdrawn');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to withdraw', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const addAgent = () => {
    const newId = Math.max(0, ...agents.map(a => a.id)) + 1;
    setAgents(prev => [...prev, { id: newId, name: `Agent ${prev.length + 1}`, risk: 'balanced', status: 'setting up', value: '$0' }]);
    setActiveAgent(agents.length);
    // Clear deploy markers so review/page treats this as a new deployAgent, not updateConfig
    sessionStorage.removeItem('spike_deployed');
    sessionStorage.removeItem('spike_agent_id');
    router.push('/app/configure');
  };

  return (
    <div style={{ background: '#FBF7F0', minHeight: '100vh' }}>
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

      {/* Wrong owner warning */}
      {isWrongOwner && (
        <div style={{ background: '#fff3cd', borderBottom: '1px solid #ffe69c', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#856404', fontWeight: 600 }}>
            Connected wallet <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>{address?.slice(0, 6)}…{address?.slice(-4)}</span> is not the owner of this agent. Write operations will fail.
          </span>
        </div>
      )}

      {/* Dashboard header */}
      <div style={{ background: '#FBF7F0', borderBottom: '1px solid #CDC9C3', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, color: '#555555', letterSpacing: '-0.01em' }}>Your portfolio</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: botStatus === 'running' ? '#d4edda' : '#fff3cd', border: `1px solid ${botStatus === 'running' ? '#b7dfbe' : '#ffe69c'}`, borderRadius: 99, padding: '3px 10px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: botStatus === 'running' ? '#2d6a4f' : '#856404' }} />
                <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: botStatus === 'running' ? '#2d6a4f' : '#856404' }}>
                  {botStatus === 'running' ? 'Bot is running' : 'Bot is paused'}
                </span>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>
              {nftMeta ? `Managing since ${relativeTime(new Date(Number(nftMeta.mintedAt) * 1000).toISOString())}` : 'Managing your portfolio'}
              {agentStatus?.lastAction ? ` · Last rebalance ${relativeTime(agentStatus.lastAction)}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="ghost" size="sm" onClick={() => router.push('/app/configure')}>Change strategy</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowWithdrawConfirm(true)}>Withdraw</Btn>
            <Btn variant={botStatus === 'running' ? 'sage' : 'primary'} size="sm"
              icon={actionLoading ? undefined : botStatus === 'running' ? <Icons.Pause /> : <Icons.Play />}
              onClick={handlePauseResume}
              style={{ minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {actionLoading ? (
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(85,85,85,0.3)', borderTopColor: '#555555', animation: 'spin 0.8s linear infinite' }} />
              ) : botStatus === 'running' ? 'Pause bot' : 'Resume bot'}
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
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: change24h >= 0 ? '#2d6a4f' : '#842029', marginBottom: 12 }}>
                  {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)} bps last cycle
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allocations.map(a => (
                    <div key={a.sym} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: '#555555', minWidth: 36 }}>{a.sym}</span>
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#A8A49E' }}>{a.pct}%</span>
                      {livePrices[a.sym] && (
                        <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 11, color: '#8AADA4', marginLeft: 'auto' }}>{formatPrice(livePrices[a.sym])}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {AGENT_NFT_ADDRESS && AGENT_REGISTRY_ADDRESS && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <SectionLabel>Agent NFT</SectionLabel>
                <span style={{ background: '#555555', color: '#FBF7F0', borderRadius: 6, padding: '2px 7px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontWeight: 700, fontSize: 10, letterSpacing: '0.06em' }}>INFT</span>
                {agentOnChain && (
                  <span style={{ background: agentOnChain.status === 0 ? '#d4edda' : agentOnChain.status === 1 ? '#fff3cd' : '#f8d7da', color: agentOnChain.status === 0 ? '#2d6a4f' : agentOnChain.status === 1 ? '#856404' : '#842029', borderRadius: 6, padding: '2px 7px', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10 }}>
                    {['Active', 'Paused', 'Withdrawn'][agentOnChain.status] ?? 'Unknown'}
                  </span>
                )}
              </div>
              {nftName && <div style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 11, color: '#A8A49E', marginBottom: 12 }}>{nftName}</div>}
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
                  {intelligentData.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#8AADA4', marginBottom: 8 }}>Intelligent Data (ERC-7857)</div>
                      {intelligentData.map(d => (
                        <Row key={d.dataDescription} label={d.dataDescription.replace(/_/g, ' ')}>
                          <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 11, color: '#555555' }}>
                            {d.dataHash.slice(0, 10)}…{d.dataHash.slice(-4)}
                          </span>
                        </Row>
                      ))}
                    </div>
                  )}
                  <Row label="Authorized users">
                    <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: authorizedUsers.length > 0 ? '#555555' : '#A8A49E' }}>
                      {authorizedUsers.length > 0 ? `${authorizedUsers.length} address${authorizedUsers.length > 1 ? 'es' : ''}` : 'None'}
                    </span>
                  </Row>
                  <Row label="Deployed">
                    <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#555555' }}>
                      {agentOnChain ? new Date(Number(agentOnChain.deployedAt) * 1000).toLocaleDateString() : new Date(Number(nftMeta.mintedAt) * 1000).toLocaleDateString()}
                    </span>
                  </Row>
                  {agentOnChain && (
                    <Row label="On-chain rebalances">
                      <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#555555' }}>
                        {agentOnChain.rebalanceCount.toString()}
                      </span>
                    </Row>
                  )}
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
                { label: 'Trades made', value: perfScore ? perfScore.totalActions.toString() : '0' },
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
              { label: 'Last rebalance', value: relativeTime(agentStatus?.lastAction) },
              { label: 'Decision quality', value: perfScore && perfScore.totalActions > 0n ? `${((Number(perfScore.successCount) / Number(perfScore.totalActions)) * 100).toFixed(1)}%` : '—' },
              { label: 'Sharpe (live)', value: agentStatus?.lastSharpe ? agentStatus.lastSharpe.toFixed(3) : '—' },
              { label: 'Total actions', value: perfScore ? perfScore.totalActions.toString() : (agentStatus?.pendingActions.length.toString() ?? '0') },
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
                {(agentStatus?.pendingActions.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px 12px', textAlign: 'center', fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#A8A49E' }}>
                      Bot is running — first cycle completes in ~2 minutes
                    </td>
                  </tr>
                ) : (
                  [...(agentStatus?.pendingActions ?? [])].reverse().slice(0, 10).map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? '#FBF7F0' : '#EDF3F0' }}>
                      <td style={{ padding: '12px 12px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#A8A49E' }}>{relativeTime(a.timestamp)}</td>
                      <td style={{ padding: '12px 12px', fontWeight: 700, color: '#555555' }}>Rebalance</td>
                      <td style={{ padding: '12px 12px', color: '#555555' }}>{agentStatus?.config.assets.join('→') ?? 'Portfolio'}</td>
                      <td style={{ padding: '12px 12px', fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: a.pnlBps >= 0 ? '#2d6a4f' : '#842029' }}>
                        {a.pnlBps >= 0 ? '+' : ''}{a.pnlBps} bps
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span style={{ fontFamily: "var(--font-dm-mono), 'DM Mono', monospace", fontSize: 12, color: '#5e8880' }}>
                          {a.actionHash.slice(0, 10)}…
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }}><StatusPill status={a.recorded ? 'attested' : 'pending'} /></td>
                    </tr>
                  ))
                )}
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

      {/* Withdraw confirm modal */}
      {showWithdrawConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(85,85,85,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#FBF7F0', borderRadius: 24, border: '1.5px solid #CDC9C3', padding: 32, maxWidth: 380, width: '100%', animation: 'modalIn 0.2s ease' }}>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontWeight: 800, fontSize: 20, color: '#555555', marginBottom: 10 }}>Withdraw agent?</div>
            <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 14, color: '#A8A49E', marginBottom: 24, lineHeight: 1.7 }}>This will permanently deactivate your agent on-chain. Your funds stay in your wallet and you can deploy a new agent any time.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setShowWithdrawConfirm(false)}>Cancel</Btn>
              <Btn style={{ flex: 1, background: '#842029', color: '#fff' }} onClick={handleWithdraw}>Withdraw</Btn>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  );
}
