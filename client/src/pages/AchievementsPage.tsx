import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import gamification, { fetchProjectPoints, fetchProjectDecayStatus } from '@/lib/gamification';
import { confettiBurst } from '@/lib/feedback';
import AchievementTree from '@/components/AchievementTree';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const JOLLY_MOTIVATIONS = [
  "🌟 Keep shining! You're making a massive impact today!",
  "🚀 To the moon! Your productivity is out of this world!",
  "🌈 Your hard work is the secret ingredient to our success!",
  "🔥 You're on fire! Keep that momentum rolling!",
  "🎈 High five! You've mastered the art of getting things done!",
  "💎 Simply brilliant! Every entry is a step toward greatness!",
  "👑 Productivity Royalty! Your tree is looking magnificent!",
  "⚡ Zap! You're moving faster than light today!",
];

const STAGES = [
  { key: "seed", threshold: 0, label: "Seed" },
  { key: "sprout", threshold: 10, label: "Sprout" },
  { key: "sapling", threshold: 40, label: "Sapling" },
  { key: "tree", threshold: 120, label: "Tree" },
  { key: "flowering", threshold: 300, label: "Flowering" },
  { key: "fruiting", threshold: 600, label: "Fruiting" },
];

function computeStage(p: number) {
  let s = STAGES[0];
  for (const st of STAGES) if (p >= st.threshold) s = st;
  return s;
}

function StageGuideCard({ stages, currentIdx }: { stages: any[]; currentIdx: number }) {
  return (
    <div className="bg-slate-900 shadow-xl border border-blue-500/10 p-5 rounded-[22px]">
      <div className="text-sm font-bold text-slate-300 mb-4 tracking-tight uppercase opacity-60">Maturation Stages</div>
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center gap-4 mb-3 group">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${i <= currentIdx ? "bg-green-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)]" : "bg-slate-800 text-slate-600 border border-slate-700"}`}>
            {i <= currentIdx ? "✓" : i + 1}
          </div>
          <div className="flex-1">
            <div className={`text-sm font-bold transition-colors ${i === currentIdx ? "text-green-400" : i < currentIdx ? "text-slate-300" : "text-slate-600"}`}>{s.label}</div>
            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{s.threshold} Points Required</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [currentPoints, setCurrentPoints] = useState<number>(0);
  const [decayStatus, setDecayStatus] = useState<'active'|'wilting'|'dying'>('active');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const badges = gamification.getBadges();

  const { data: pmsProjects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects', user?.id],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/projects?userRole=${user?.role}&userEmpCode=${user?.employeeCode}&userDepartment=${user?.department}`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].project_name);
        }
        return data;
      } catch (e) { return []; }
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    const qId = setInterval(() => {
      setQuoteIdx(prev => (prev + 1) % JOLLY_MOTIVATIONS.length);
    }, 6000);
    return () => clearInterval(qId);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!selectedProject) {
        setCurrentPoints(0);
        setDecayStatus('active');
        return;
      }
      try {
        const pts = await fetchProjectPoints(selectedProject);
        if (!mounted) return;
        // fetchProjectPoints returns raw points; apply decay calculation on server side via fetchProjectDecayStatus
        const ds = await fetchProjectDecayStatus(selectedProject);
        if (!mounted) return;
        // apply decay locally: getDecayedPointsForProject is still synchronous fallback; but fetchProjectPoints returns stored points (not decayed)
        // For now, use fetchProjectPoints result as currentPoints (server currently stores raw points)
        setCurrentPoints(pts);
        setDecayStatus(ds as any);
      } catch (e) {
        setCurrentPoints(0);
        setDecayStatus('active');
      }
    }
    load();
    return () => { mounted = false; };
  }, [selectedProject]);

  const stage = computeStage(currentPoints);
  const idx = STAGES.findIndex(s => s.key === stage.key);
  const nextStage = STAGES[idx + 1];
  const progress = nextStage ? Math.round(((currentPoints - stage.threshold) / (nextStage.threshold - stage.threshold)) * 100) : 100;

  const handleCelebrate = () => { try { confettiBurst(); } catch { } };

  return (
    <div className="min-h-screen bg-[#050810] text-slate-200 p-6 md:p-10 font-sans">
      <style>{`
        @keyframes growIn{ from{transform:scale(0.95);opacity:0;} to{transform:scale(1);opacity:1;} }
        @keyframes float{ from{transform:translateY(0px) rotate(0deg);} to{transform:translateY(-8px) rotate(1deg);} }
        .ach-card:hover { transform: translateY(-4px); background: rgba(255,255,255,0.05); }
        .spark-box { 
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(236, 72, 153, 0.15));
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: float 4s ease-in-out infinite alternate;
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .spark-box:hover {
          transform: translateY(-12px) scale(1.02);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(236, 72, 153, 0.25));
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 20px rgba(99, 102, 241, 0.2);
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8">

        {/* Main Tree Column */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black text-white tracking-tighter">THE GROWTH ARCHIVE</h1>
              <p className="text-blue-400 font-medium tracking-wide text-sm uppercase opacity-70">Employee Productivity Visualizer</p>
            </div>

            <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-blue-500/20 shadow-2xl">
              <Select value={selectedProject} onValueChange={(v) => setSelectedProject(v)}>
                <SelectTrigger className="w-56 bg-transparent border-none text-white font-semibold focus:ring-0">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-blue-500/20 text-white">
                  {pmsProjects.map((p: any) => (
                    <SelectItem key={p.project_name} value={p.project_name} className="focus:bg-blue-500/20 focus:text-white">{p.project_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="h-8 w-px bg-slate-800" />
              <div className="text-right px-2">
                <div className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Points</div>
                <div className="text-2xl font-black text-white leading-none">{currentPoints}</div>
              </div>
              <button
                onClick={handleCelebrate}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-lg active:scale-95 text-sm"
              >
                Celebrate
              </button>
            </div>
          </div>

          <div className="bg-slate-900/40 rounded-[32px] border border-blue-500/10 overflow-hidden shadow-inner flex flex-col max-w-5xl mx-auto w-full">
            <div className="relative w-full aspect-[16/8] overflow-hidden group p-4">
              <AchievementTree projectId={selectedProject} />
            </div>

            <div className="p-8 border-t border-white/5 bg-slate-900/60 transition-all duration-300">
              <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                  <span className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">Next Milestone: {nextStage?.label || 'Supreme'}</span>
                  <span className={`text-[10px] font-bold mt-1 ${decayStatus === 'dying' ? 'text-red-500' : decayStatus === 'wilting' ? 'text-amber-500' : 'text-green-500'}`}>
                    {decayStatus === 'dying' ? '🥀 Project Abandoned' : decayStatus === 'wilting' ? '🍂 Wilting Inactivity' : '🌱 Growing Healthy'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">{currentPoints} / {nextStage?.threshold || 600}</span>
                  <span className="text-sm font-black text-green-400">{progress}%</span>
                </div>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                <div
                  className={`h-full transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.3)] rounded-full ${decayStatus === 'dying' ? 'bg-red-500' : decayStatus === 'wilting' ? 'bg-amber-500' : 'bg-gradient-to-r from-green-600 via-green-400 to-emerald-300'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Info Column (Right Side) */}
        <div className="xl:col-span-4 flex flex-col gap-6">

          <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 p-8 rounded-[32px] border border-indigo-500/20 shadow-2xl">
            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-3 italic">
              <span className="text-3xl not-italic">🎖️</span> ACHIEVEMENTS
            </h2>
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {badges.length === 0 ? (
                <div className="py-10 text-center opacity-40 italic text-sm text-slate-400">Submit your first task to unlock your legacy.</div>
              ) : badges.map(b => (
                <div key={b.id} className="ach-card flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 transition-all cursor-default">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-xl">
                    {b.id.includes('streak') ? '🔥' : b.id.includes('first') ? '⭐' : '🏆'}
                  </div>
                  <div>
                    <div className="text-sm font-black text-white uppercase tracking-wider">{b.name}</div>
                    <div className="text-[10px] text-indigo-300 font-bold opacity-70">UNLOCKED {new Date(b.awardedAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <StageGuideCard stages={STAGES} currentIdx={idx} />

          <div className="spark-box relative overflow-hidden p-8 rounded-[32px] group cursor-pointer">
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-500/20 blur-[60px] group-hover:bg-indigo-500/40 transition-colors" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-pink-500/20 blur-[60px] group-hover:bg-pink-500/40 transition-colors" />

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 mb-4 bg-white/10 rounded-2xl flex items-center justify-center text-2xl animate-bounce shadow-xl">
                ✨
              </div>
              <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-3 opacity-80">Daily Spark</div>
              <p className="text-white text-lg font-black leading-tight tracking-tight min-h-[3.5rem] flex items-center justify-center transition-all duration-500" key={quoteIdx}>
                {JOLLY_MOTIVATIONS[quoteIdx]}
              </p>
              <div className="mt-4 flex gap-1">
                {JOLLY_MOTIVATIONS.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === quoteIdx ? "w-6 bg-indigo-500" : "w-1 bg-white/10"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
