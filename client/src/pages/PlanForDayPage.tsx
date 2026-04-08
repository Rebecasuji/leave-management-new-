import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Send, AlertTriangle, Clock, Calendar as CalendarIcon, ClipboardList, Target, Power, PowerOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function PlanForDayPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedTasks, setSelectedTasks] = useState<any[]>([]);
  const [commonReason, setCommonReason] = useState("");
  const [commonNewDueDate, setCommonNewDueDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [showUnselectedForm, setShowUnselectedForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'history'>('plan');
  const [historyDate, setHistoryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [assignedTaskSearch, setAssignedTaskSearch] = useState("");
  const [plannedTaskSearch, setPlannedTaskSearch] = useState("");

  const today = format(new Date(), 'yyyy-MM-dd');
  const isController = user?.employeeCode === 'E0046';

  // Fetch plan window status from server
  const { data: windowData } = useQuery({
    queryKey: ['/api/plan-window'],
    queryFn: async () => {
      const res = await fetch('/api/plan-window');
      return res.json();
    },
    refetchInterval: 10000, // poll every 10s
  });

  const planWindowOpen: boolean = !!windowData?.planWindowOpen;

  // Toggle plan window mutation (E0046 only)
  const toggleWindowMutation = useMutation({
    mutationFn: async (open: boolean) => {
      const res = await apiRequest('PATCH', '/api/plan-window', { employeeId: user?.id, open });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/plan-window'] });
      toast({
        title: data.planWindowOpen ? '🟢 Plan Window Opened' : '🔴 Plan Window Closed',
        description: data.planWindowOpen
          ? 'All employees can now submit their Plan for the Day.'
          : 'Submission is restricted. Please contact your administrator.',
      });
    },
    onError: () => toast({ title: 'Failed', description: 'Could not update window.', variant: 'destructive' }),
  });

  // Morning Reminder mutation (E0046, E0048 only)
  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/daily-plans/reminder', { employeeId: user?.id });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Morning Alerts Sent',
        description: `Reminder email successfully sent to ${data.count} active employees.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: '❌ Failed to send alerts',
        description: err.message || 'Could not send reminder emails.',
        variant: 'destructive',
      });
    },
  });

  // Check if plan already submitted
  const { data: planStatus, isLoading: isLoadingPlan } = useQuery({
    queryKey: ['/api/daily-plans/today', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/daily-plans/today/${user?.id}`);
      if (!res.ok) return { submitted: false };
      return res.json();
    }
  });

  // Fetch plan history for a specific date
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/daily-plans', historyDate, user?.id],
    enabled: !!user?.id && !!historyDate,
    queryFn: async () => {
      const res = await fetch(`/api/daily-plans/${historyDate}/${user?.id}`);
      if (!res.ok) return { submitted: false };
      return res.json();
    }
  });

  // Fetch available tasks from PMS
  const { data: availableTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['/api/available-tasks', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/available-tasks?employeeId=${user?.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });

  // Pre-fill selected tasks from existing plan if available
  useEffect(() => {
    if (planStatus?.submitted && planStatus.tasks && selectedTasks.length === 0 && availableTasks.length > 0) {
      const currentlyPlannedIds = new Set(planStatus.tasks.map((t: any) => t.taskId));
      const initialSelection = availableTasks.filter((t: any) => currentlyPlannedIds.has(t.id));
      if (initialSelection.length > 0) {
        setSelectedTasks(initialSelection);
      }
    }
  }, [planStatus, availableTasks]);

  const submitPlanMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/daily-plans', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-plans/today', user?.id] });
      toast({ title: "Success", description: "Your Plan for the Day has been submitted!" });
      setLocation('/tracker');
    },
    onError: (err: any) => {
      toast({ title: "Submission Failed", description: err.message || "Failed to submit plan.", variant: "destructive" });
    }
  });

  const filteredAvailableTasks = availableTasks.filter((task: any) => 
    task.task_name.toLowerCase().includes(assignedTaskSearch.toLowerCase()) ||
    task.projectName.toLowerCase().includes(assignedTaskSearch.toLowerCase())
  );

  const filteredSelectedTasks = selectedTasks.filter((task: any) => 
    task.task_name.toLowerCase().includes(plannedTaskSearch.toLowerCase()) ||
    task.projectName.toLowerCase().includes(plannedTaskSearch.toLowerCase())
  );

  if (isLoadingPlan || isLoadingTasks) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-950 text-white gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-medium">Checking your schedule...</p>
      </div>
    );
  }

  const toggleTask = (task: any) => {
    if (selectedTasks.find(t => t.id === task.id)) {
      setSelectedTasks(selectedTasks.filter(t => t.id !== task.id));
    } else {
      setSelectedTasks([...selectedTasks, task]);
    }
  };

  const handleNext = () => {
    if (selectedTasks.length === 0) {
      toast({ title: "Selection Required", description: "Please select at least one task for your plan.", variant: "destructive" });
      return;
    }

    const unselected = availableTasks.filter((t: any) => !selectedTasks.find((st: any) => st.id === t.id));
    if (unselected.length > 0) {
      setShowUnselectedForm(true);
      setCommonReason("");
      setCommonNewDueDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    } else {
      submitPlan();
    }
  };

  const submitPlan = () => {
    const unselected = availableTasks.filter((t: any) => !selectedTasks.find((st: any) => st.id === t.id))
      .map((t: any) => ({
        taskId: t.id,
        taskName: t.task_name,
        reason: commonReason,
        newDueDate: commonNewDueDate,
        start_date: t.start_date,
        end_date: t.end_date
      }));

    if (showUnselectedForm) {
      if (!commonReason || !commonNewDueDate) {
        toast({ title: "Missing Information", description: "Please provide a reason and new due date for the pending tasks.", variant: "destructive" });
        return;
      }
    }

    submitPlanMutation.mutate({
      employeeId: user?.id,
      date: today,
      selectedTasks: selectedTasks,
      unselectedTasks: unselected
    });
  };

  const isWindowOpen = true; // No longer restricted by 9-12 AM window

  const isAlreadySubmittedAndBlocked = planStatus?.submitted && !planWindowOpen;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-950 min-h-screen text-white">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-blue-500" />
            PLAN FOR THE DAY
          </h1>
          <p className="text-slate-400 font-medium">Capture your objectives and manage deviations</p>
        </div>

        <div className="flex items-center gap-4">
           {/* Tab Navigation */}
           <div className="bg-slate-900/80 p-1.5 rounded-2xl flex items-center border border-slate-800 shadow-lg">
             <button 
                onClick={() => setActiveTab('plan')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === 'plan' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 scale-[1.05]' : 'text-slate-500 hover:text-slate-300'
                }`}
             >
                Daily Plan
             </button>
             <button 
                onClick={() => setActiveTab('history')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 scale-[1.05]' : 'text-slate-500 hover:text-slate-300'
                }`}
             >
                History
             </button>
           </div>

          {/* Window status badge */}
          {!showUnselectedForm && (
            <div className={`hidden lg:flex items-center gap-3 px-6 py-3 rounded-2xl border ${isWindowOpen ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} backdrop-blur-sm`}>
              <Clock className={`w-4 h-4 ${isWindowOpen ? 'text-green-400' : 'text-red-400'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isWindowOpen ? 'text-green-400' : 'text-red-400'}`}>
                {isWindowOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          )}

          {/* Admin Tools (E0046, E0048 ONLY) */}
          {(user?.employeeCode === 'E0046' || user?.employeeCode === 'E0048') && (
            <Button
              onClick={() => sendReminderMutation.mutate()}
              disabled={sendReminderMutation.isPending}
              variant="outline"
              className="rounded-xl font-bold text-xs px-4 py-5 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400"
            >
              <Send className="w-4 h-4 mr-2" />
              Alert
            </Button>
          )}

          {isController && (
            <Button
              onClick={() => toggleWindowMutation.mutate(!planWindowOpen)}
              disabled={toggleWindowMutation.isPending}
              size="sm"
              className={`rounded-xl font-black text-xs px-4 py-5 ${planWindowOpen ? 'bg-red-600/80 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white`}
            >
              {planWindowOpen ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </header>

      {activeTab === 'history' ? (
         <motion.div 
           initial={{ opacity: 0, scale: 0.98 }}
           animate={{ opacity: 1, scale: 1 }}
           className="max-w-5xl mx-auto"
         >
           <HistorySection 
              historyDate={historyDate} 
              setHistoryDate={setHistoryDate} 
              isLoadingHistory={isLoadingHistory} 
              historyData={historyData} 
              today={today} 
           />
         </motion.div>
      ) : isAlreadySubmittedAndBlocked ? (
        <div className="flex flex-col h-[calc(100vh-250px)] items-center justify-center p-8 bg-slate-950 text-center text-white">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900/50 p-12 rounded-3xl border border-blue-500/20 shadow-2xl backdrop-blur-xl max-w-lg w-full"
          >
            <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 mx-auto mb-8">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h1 className="text-3xl font-extrabold mb-4 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Today's Plan Ready!
            </h1>
            <p className="text-slate-400 text-lg mb-8 max-w-sm mx-auto">
              You've already locked in your tasks for today. Time to turn that plan into results!
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => setLocation('/tracker')}
                className="px-8 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all hover:scale-105"
              >
                Go to Tracker
              </Button>
              <Button
                onClick={() => { setHistoryDate(today); setActiveTab('history'); }}
                variant="outline"
                className="px-8 py-6 border-slate-700 text-white hover:bg-slate-800 rounded-xl font-semibold"
              >
                View My List
              </Button>
            </div>
          </motion.div>
        </div>
      ) : !showUnselectedForm ? (
        <div className="space-y-12">
          {/* Main Plan Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-450px)] min-h-[500px]">
            {/* Left Panel: Assigned Tasks */}
            <Card className="bg-slate-900/60 border-slate-800 flex flex-col h-full overflow-hidden shadow-xl">
              <CardHeader className="border-b border-slate-800/50 pb-4">
                <CardTitle className="text-xl flex items-center gap-3 text-slate-200">
                  <Target className="w-5 h-5 text-slate-400" />
                  Assigned Tasks
                </CardTitle>
                <div className="mt-3 relative">
                  <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Search assigned tasks..."
                    value={assignedTaskSearch}
                    onChange={(e) => setAssignedTaskSearch(e.target.value)}
                    className="bg-slate-950/50 border-slate-800 pl-10 h-10 rounded-xl text-sm focus:ring-blue-500/50"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-3">
                  {filteredAvailableTasks.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
                      {assignedTaskSearch ? "No tasks match your search." : "No tasks assigned for you."}
                    </div>
                  ) : (
                    filteredAvailableTasks.map((task: any) => {
                      const isSelected = selectedTasks.find(t => t.id === task.id);
                      return (
                        <motion.div
                          key={task.id}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          className={`group p-5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                            isSelected 
                              ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.02]' 
                              : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600'
                          }`}
                          onClick={() => toggleTask(task)}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                              isSelected ? 'bg-blue-500 border-blue-400' : 'bg-slate-900 border-slate-800'
                            }`}>
                              {isSelected ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Circle className="w-5 h-5 text-slate-700" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-100 group-hover:text-white transition-colors">{task.task_name}</h3>
                              <p className="text-sm text-slate-500 font-medium">{task.projectName}</p>
                            </div>
                          </div>
                          {isSelected && <ArrowRight className="w-5 h-5 text-blue-400 animate-bounce-horizontal" />}
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Right Panel: Daily Plan */}
            <Card className="bg-slate-900/60 border-blue-500/10 flex flex-col h-full overflow-hidden shadow-xl ring-1 ring-blue-500/5">
              <CardHeader className="bg-blue-500/5 border-b border-blue-500/10 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center gap-3 text-blue-400 font-black">
                    <Target className="w-6 h-6" />
                    MY DAILY PLAN
                  </CardTitle>
                  <div className="bg-blue-500/20 px-3 py-1 rounded-full border border-blue-500/30">
                    <span className="text-xs font-black text-blue-400">{selectedTasks.length} SELECTED</span>
                  </div>
                </div>
                <div className="mt-3 relative">
                  <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/50" />
                  <Input 
                    placeholder="Search your plan..."
                    value={plannedTaskSearch}
                    onChange={(e) => setPlannedTaskSearch(e.target.value)}
                    className="bg-slate-950/50 border-blue-500/20 pl-10 h-10 rounded-xl text-sm focus:ring-blue-500/50 text-blue-100 placeholder:text-blue-900"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {selectedTasks.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4"
                    >
                      <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800">
                        <Target className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="font-semibold text-lg italic opacity-50">Choose tasks from the left panel</p>
                    </motion.div>
                  ) : filteredSelectedTasks.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-20 text-slate-500 italic"
                    >
                      No tasks in your plan match "{plannedTaskSearch}"
                    </motion.div>
                  ) : (
                    <div className="space-y-3">
                      {filteredSelectedTasks.map((task: any) => (
                        <motion.div
                          layout
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          key={task.id}
                          className="p-5 rounded-2xl bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/30 flex items-center justify-between group"
                        >
                          <div>
                            <h3 className="font-black text-blue-100">{task.task_name}</h3>
                            <p className="text-xs text-blue-400/60 font-bold uppercase tracking-widest">{task.projectName}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleTask(task)}
                            className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                          >
                            Cancel
                          </Button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </CardContent>
              <div className="p-6 bg-slate-900/50 border-t border-slate-800 space-y-4">
                 <div className="flex items-center gap-2 text-xs text-slate-500 font-bold px-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ALL SELECTED TASKS MUST BE COMPLETED TODAY.
                 </div>
                 <Button
                  className="w-full py-7 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30"
                  disabled={selectedTasks.length === 0 || !isWindowOpen}
                  onClick={handleNext}
                 >
                  LOCK IN MY PLAN
                  <ArrowRight className="w-6 h-6" />
                 </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Deviation/Unselected Tasks Form */
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-4xl mx-auto"
        >
          <Card className="bg-slate-900/80 border-amber-500/20 shadow-2xl backdrop-blur-xl">
            <CardHeader className="bg-amber-500/5 border-b border-amber-500/10 p-6">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-500/30">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                 </div>
                 <div>
                    <CardTitle className="text-2xl font-black text-white">Controlled Deviation Required</CardTitle>
                    <p className="text-amber-500/80 font-bold text-sm tracking-wide uppercase">Unselected tasks require justification</p>
                 </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="p-8 rounded-3xl bg-slate-800/30 border border-slate-700/50 space-y-8">
                  <div>
                    <Label className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4 block">Pending Tasks Being Postponed</Label>
                    <div className="flex flex-wrap gap-2">
                       {availableTasks.filter((t: any) => !selectedTasks.find((st: any) => st.id === t.id)).map((task: any) => (
                         <div key={task.id} className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-sm font-bold flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-500/50" />
                            {task.task_name}
                         </div>
                       ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-slate-400 font-bold text-xs uppercase tracking-widest">Reason for Deviation (Apply to all) *</Label>
                      <Textarea
                        placeholder="e.g. Waiting for client feedback, Priorities changed..."
                        value={commonReason}
                        onChange={(e) => setCommonReason(e.target.value)}
                        className="bg-slate-900 border-slate-700 text-white rounded-xl focus:ring-amber-500/50 min-h-[120px] text-lg"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-slate-400 font-bold text-xs uppercase tracking-widest">New Target Due Date *</Label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-4 top-4 w-6 h-6 text-green-500" />
                        <Input
                          type="date"
                          value={commonNewDueDate}
                          min={today}
                          onChange={(e) => setCommonNewDueDate(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-white rounded-xl pl-12 h-16 text-lg"
                        />
                      </div>
                      <p className="text-xs text-slate-500 font-medium italic mt-2">
                        This date will be applied to all your postponed tasks for today.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <Button 
                  variant="outline"
                  onClick={() => setShowUnselectedForm(false)}
                  className="px-8 py-6 border-slate-700 text-slate-400 hover:bg-slate-800 rounded-2xl flex items-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Selection
                </Button>
                <Button 
                  onClick={submitPlan}
                  className="flex-1 py-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-amber-900/20 active:scale-[0.98] flex items-center justify-center gap-3"
                  disabled={submitPlanMutation.isPending}
                >
                  {submitPlanMutation.isPending ? 'PROCESSING...' : 'SUBMIT PLAN FOR APPROVAL'}
                  <Send className="w-6 h-6" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function HistorySection({ historyDate, setHistoryDate, isLoadingHistory, historyData, today }: any) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-4">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-3">
            <CalendarIcon className="w-6 h-6 text-green-500" />
            PLAN HISTORY
          </h2>
          <p className="text-slate-400 text-sm font-medium">View your past selections and Deviations</p>
        </div>

        <div className="flex items-center gap-3 bg-slate-900 p-2 pr-4 rounded-2xl border border-slate-800 shadow-lg">
          <Label htmlFor="history-date" className="sr-only">Date</Label>
          <div className="relative flex items-center">
            <CalendarIcon className="absolute left-3 w-4 h-4 text-green-500 pointer-events-none" />
            <Input 
              id="history-date"
              type="date" 
              value={historyDate}
              max={today}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white rounded-xl focus:ring-green-500 h-10 w-48 pl-10 text-sm [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {isLoadingHistory ? (
        <div className="py-20 text-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading history...</p>
        </div>
      ) : historyData?.submitted ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* History: Selected */}
          <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-slate-800/50 bg-green-500/5">
              <CardTitle className="text-lg font-black text-green-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                SELECTED TASKS
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {historyData.tasks.map((t: any) => (
                  <div key={t.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h4 className="font-bold text-slate-100">{t.taskName}</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">{t.projectName}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* History: Not Selected */}
          <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-slate-800/50 bg-amber-500/5">
              <CardTitle className="text-lg font-black text-amber-400 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                TASKS NOT SELECTED
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {historyData.postponedTasks.length === 0 ? (
                <p className="text-slate-500 text-center py-8 font-medium italic">No tasks were unselected.</p>
              ) : (
                <div className="space-y-4">
                  {historyData.postponedTasks.map((t: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                      <h4 className="font-bold text-amber-100">{t.task_name}</h4>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-bold text-amber-500/60 uppercase">Reason</p>
                        <p className="text-sm text-slate-300 italic">{t.reason}</p>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-amber-500/60 font-bold">
                        <CalendarIcon className="w-3 h-3 text-green-500" />
                        NEXT TARGET: {t.new_due_date}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="py-24 text-center bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
          <CalendarIcon className="w-12 h-12 text-slate-800 mx-auto mb-4 opacity-20" />
          <p className="text-slate-500 font-bold text-lg">No daily plan was submitted for {format(new Date(historyDate), 'MMMM dd, yyyy')}</p>
        </div>
      )}
    </div>
  );
}
