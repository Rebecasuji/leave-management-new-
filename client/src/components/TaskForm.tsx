import { useState, useEffect } from 'react';
import { playSound, popEmoji, speak } from '@/lib/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Play, Square, Save, Clock, X, Check, Plus, Search } from 'lucide-react';
import gamification from '@/lib/gamification';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Target, ArrowRight } from "lucide-react";

interface Task {
  id?: string;
  pmsId?: string;
  pmsSubtaskId?: string;
  project: string;
  title: string;
  keyStep?: string;
  subTask?: string;
  description: string;
  problemAndIssues: string;
  quantify: string;
  achievements: string;
  scopeOfImprovements: string;
  toolsUsed: string[];
  startTime: string;
  endTime: string;
  percentageComplete: number;
  isRecording?: boolean;
}

interface TaskFormProps {
  task?: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
  existingTasks?: Task[];
  user?: { role: string; employeeCode: string; department?: string };
  saveButtonText?: string;
  date?: string;
}

const TOOLS_LIST = [
  'Adobe Scanner', 'Airtable', 'Android Studio', 'Angular', 'AWS', 'Azure',
  'Antigravity', 'Amazon', 'Bitbucket', 'BrowserStack', 'Calls/Phone',
  'Canva', 'ChatGPT', 'Chrome', 'Claude', 'Copilot', 'Whatsapp', 'Confluence', 'CSS', 'Docker',
  'Drizzle', 'Emails', 'ESLint', 'Excel', 'Express', 'Figma', 'Firebase', 'Firefox',
  'Flutter', 'Gemini', 'Git', 'GitHub', 'GitLab', 'Google', 'Google Calendar', 'Google Keep',
  'Google Maps', 'Google Play Console', 'Google Tasks', 'Grafana', 'GSAP', 'GST Portal', 'Heroku', 'Hostinger', 'HTML',
  'IncomeTax Portal', 'Indeed', 'InVision', 'JavaScript', 'Jenkins', 'Jest', 'Jira', 'Kubernetes', 'LinkedIn', 'Loom',
  'Lucide Icons', 'Meeting Others', 'Meeting with Teams', 'Miro', 'MongoDB', 'MS Office', 'MS Teams',
  'MySQL', 'Naukri', 'Netlify', 'Next.js', 'Node.js', 'Notes', 'Notion', 'OpenAI', 'Others', 'Outlook',
  'Porter', 'PostgreSQL', 'Postman', 'Promilo', 'PPT', 'Prettier', 'Prisma', 'React', 'Redis', 'Redux', 'Safari', 'Sentry',
  'Shadcn/UI', 'Shine', 'Slack', 'Storybook', 'Supabase', 'Swift', 'Tailwind CSS', 'TanStack Query', 'Traces',
  'TimeChamp', 'Trello', 'TypeScript', 'Unolo', 'Vercel', 'Vite', 'VS Code', 'Vue', 'Web Browser', 'Word',
  'WorkIndia', 'Wouter', 'XCode', 'Zapier', 'Zeplin', 'Zoho Books', 'Zoho Cliq', 'Zoho Expenses'
].sort();

/* ✅ NEW – project type (does NOT remove anything) */
type Project = {
  project_code: string;
  project_name: string;
};

export default function TaskForm({ task, onSave, onCancel, user, saveButtonText, date }: TaskFormProps) {
  const { user: authUser } = useAuth();
  const [formData, setFormData] = useState<Task>({
    project: task?.project || '',
    keyStep: (task as any)?.keyStep || '',
    title: task?.title || '',
    subTask: task?.subTask || '',
    description: task?.description || '',
    problemAndIssues: task?.problemAndIssues || '',
    quantify: task?.quantify || '',
    achievements: task?.achievements || '',
    scopeOfImprovements: task?.scopeOfImprovements || '',
    toolsUsed: task?.toolsUsed || [],
    startTime: task?.startTime || '',
    endTime: task?.endTime || '',
    percentageComplete: task?.percentageComplete || 0,
    pmsId: task?.pmsId,
    pmsSubtaskId: (task as any)?.pmsSubtaskId,
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [postponements, setPostponements] = useState<Array<any>>([]);
  const [showPostponements, setShowPostponements] = useState(false);

  /* ✅ UPDATED – always an array */
  const [projects, setProjects] = useState<Project[]>([]);

  /* ✅ ADDED – tasks state */
  const [tasks, setTasks] = useState<{ id: string; task_name: string }[]>([]);

  /* ✅ ADDED – subtasks state */
  const [subtasks, setSubtasks] = useState<{ id: string; title: string }[]>([]);

  /* ✅ ADDED – key steps state (from PMS) */
  const [keySteps, setKeySteps] = useState<{ id: string; name: string }[]>([]);

  /* ✅ SAFE FILTER (NO CRASH EVER) */
  const { toast } = useToast();
  const [dailyPlan, setDailyPlan] = useState<any>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [showDeviationDialog, setShowDeviationDialog] = useState(false);
  const [deviationReason, setDeviationReason] = useState('');
  const [selectedDeviationTask, setSelectedDeviationTask] = useState<any>(null);

  const filteredProjects = Array.isArray(projects)
    ? projects.filter(p =>
      p.project_name?.toLowerCase().includes(projectSearch.toLowerCase())
    )
    : [];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        setElapsedTime(
          Math.floor((Date.now() - recordingStartTime.getTime()) / 1000)
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  /* ✅ UPDATED – SAFE FETCH */
  useEffect(() => {
    async function fetchProjects() {
      try {
        const params = new URLSearchParams();
        if (user?.role) params.append('userRole', user.role);
        if (user?.employeeCode) params.append('userEmpCode', user.employeeCode);
        if (authUser?.department) params.append('userDepartment', authUser.department);
        const url = `/api/projects${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url);
        const json = await res.json();

        if (Array.isArray(json)) {
          setProjects(json);
        } else if (Array.isArray(json?.data)) {
          setProjects(json.data);
        } else {
          setProjects([]);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setProjects([]);
      }
    }
    fetchProjects();
  }, [user]);

  // Fetch postponements for PMS-backed tasks (if pmsId provided)
  useEffect(() => {
    async function fetchPostponements() {
      try {
        // @ts-ignore accept extra prop
        const pmsId = (task as any)?.pmsId;
        if (!pmsId) {
          setPostponements([]);
          return;
        }
        const res = await fetch(`/api/tasks/${pmsId}/postponements`);
        if (!res.ok) {
          setPostponements([]);
          return;
        }
        const json = await res.json();
        setPostponements(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error('Failed to fetch postponements', err);
        setPostponements([]);
      }
    }
    fetchPostponements();
  }, [task]);


  useEffect(() => {
    async function fetchDailyPlan() {
      setIsLoadingPlan(true);
      if (!authUser?.id) {
        setIsLoadingPlan(false);
        return;
      }
      try {
        // Use the provided date or fall back to today's date in YYYY-MM-DD format
        const targetDate = date || new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/daily-plans/${targetDate}/${authUser.id}`);
        if (res.ok) {
           const json = await res.json();
           if (json.submitted) setDailyPlan(json);
           else setDailyPlan(null); // Reset if no plan for that date
        } else {
           setDailyPlan(null);
        }
      } catch (err) {
        console.error('Failed to fetch daily plan:', err);
        setDailyPlan(null);
      } finally {
        setIsLoadingPlan(false);
      }
    }
    fetchDailyPlan();
  }, [authUser, date]);

  const sortedTasks = [...(tasks || [])].sort((a, b) => {
    if (!dailyPlan) return 0;
    const aPlanned = dailyPlan.tasks.some((pt: any) => pt.taskId === a.id);
    const bPlanned = dailyPlan.tasks.some((pt: any) => pt.taskId === b.id);
    if (aPlanned && !bPlanned) return -1;
    if (!aPlanned && bPlanned) return 1;
    return 0;
  });

  const addDeviationMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/daily-plans/deviations', payload);
      return res.json();
    },
    onSuccess: (newTask) => {
       // Refresh plan tasks
       setDailyPlan((prev: any) => ({ 
          ...prev, 
          tasks: [...(prev?.tasks || []), newTask] 
       }));
       setShowDeviationDialog(false);
       setDeviationReason('');
       setSelectedDeviationTask(null);
       toast({ title: "Deviation Added", description: "This task is now available for timesheet entry." });
    },
    onError: (err: any) => {
       toast({ title: "Error", description: err.message || "Failed to add deviation", variant: "destructive" });
    }
  });

  const handleAddDeviation = () => {
     if (!selectedDeviationTask || !deviationReason) {
        toast({ title: "Selection Required", description: "Please select a task and provide a reason.", variant: "destructive" });
        return;
     }

     const projectCode = projects.find(p => p.project_name === formData.project)?.project_code;

     addDeviationMutation.mutate({
        employeeId: authUser?.id,
        taskId: selectedDeviationTask.id,
        taskName: selectedDeviationTask.task_name,
        projectName: formData.project,
        reason: deviationReason
     });
  };

  /* ✅ ADDED – fetch tasks when project changes */
  useEffect(() => {
    async function fetchTasks() {
      if (!formData.project) {
        setTasks([]);
        return;
      }

      try {
        // Find the project_code from the selected project name
        const selectedProject = projects.find(p => p.project_name === formData.project);
        if (!selectedProject) {
          setTasks([]);
          return;
        }

        const params = new URLSearchParams();
        params.append('projectId', selectedProject.project_code);
        if (authUser?.department || user?.department) params.append('userDepartment', authUser?.department || user?.department || '');
        if (authUser?.employeeCode || user?.employeeCode) params.append('userEmpCode', authUser?.employeeCode || user?.employeeCode || '');
        if (authUser?.role || user?.role) params.append('userRole', authUser?.role || user?.role || '');

        const res = await fetch(`/api/tasks?${params.toString()}`);
        const json = await res.json();

        if (Array.isArray(json)) {
          setTasks(json);
        } else {
          setTasks([]);
        }
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
        setTasks([]);
      }
    }
    fetchTasks();
  }, [formData.project, projects]);

  // Update pmsId when task changes
  useEffect(() => {
    if (formData.title) {
      const selectedTask = tasks.find(t => t.task_name === formData.title);
      if (selectedTask && selectedTask.id !== formData.pmsId) {
        setFormData(prev => ({ ...prev, pmsId: selectedTask.id }));
      }
    }
  }, [formData.title, tasks]);

  /* ✅ ADDED – fetch key steps for project from PMS */
  useEffect(() => {
    async function fetchKeySteps() {
      if (!formData.project) {
        setKeySteps([]);
        return;
      }
      try {
        const selectedProject = projects.find(p => p.project_name === formData.project);
        if (!selectedProject) {
          setKeySteps([]);
          return;
        }
        const params = new URLSearchParams();
        params.append('projectId', selectedProject.project_code);
        if (authUser?.department) params.append('userDepartment', authUser.department);
        const res = await fetch(`/api/key-steps?${params.toString()}`);
        const json = await res.json();
        if (Array.isArray(json)) {
          // accept both {id,name} or simple strings
          const mapped = json.map((k: any) => (typeof k === 'string' ? { id: k, name: k } : { id: k.id || k.key || k.name, name: k.name || k.key || String(k) }));
          setKeySteps(mapped);
        } else {
          setKeySteps([]);
        }
      } catch (err) {
        console.error('Failed to fetch key steps:', err);
        setKeySteps([]);
      }
    }
    fetchKeySteps();
  }, [formData.project, projects]);

  useEffect(() => {
    async function fetchSubtasks() {
      if (!formData.title) {
        setSubtasks([]);
        return;
      }

      try {
        // Find the task_id from the selected task name
        const selectedTask = tasks.find(t => t.task_name === formData.title);
        if (!selectedTask) {
          setSubtasks([]);
          return;
        }

        const params = new URLSearchParams();
        params.append('taskId', selectedTask.id);
        if (authUser?.department || user?.department) params.append('userDepartment', authUser?.department || user?.department || '');
        if (authUser?.employeeCode || user?.employeeCode) params.append('userEmpCode', authUser?.employeeCode || user?.employeeCode || '');

        const res = await fetch(`/api/subtasks?${params.toString()}`);
        const json = await res.json();

        if (Array.isArray(json)) {
          setSubtasks(json);
        } else {
          setSubtasks([]);
        }
      } catch (err) {
        console.error('Failed to fetch subtasks:', err);
        setSubtasks([]);
      }
    }
    fetchSubtasks();
  }, [formData.title, tasks]);

  const getCurrentISTTime = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset).toISOString().slice(11, 16);
  };

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = () => {
    setIsRecording(true);
    setRecordingStartTime(new Date());
    setFormData({ ...formData, startTime: getCurrentISTTime() });
  };

  const stopRecording = () => {
    setIsRecording(false);
    setFormData({ ...formData, endTime: getCurrentISTTime() });
  };

  const toggleTool = (tool: string) => {
    setFormData({
      ...formData,
      toolsUsed: formData.toolsUsed.includes(tool)
        ? formData.toolsUsed.filter(t => t !== tool)
        : [...formData.toolsUsed, tool],
    });
  };

  const validateForm = () => {
    const errs: string[] = [];
    if (!formData.project) errs.push('Project is required');
    if (!formData.title) errs.push('Task is required');
    // If subtasks exist, one must be selected
    if (subtasks.length > 0 && !formData.subTask) {
      errs.push('Sub Task selection is mandatory for this task');
    }
    if (!formData.quantify) errs.push('Quantify is required');
    if (!formData.startTime) errs.push('Start time is required');
    if (!formData.endTime) errs.push('End time is required');
    if (formData.toolsUsed.length === 0) errs.push('At least one tool must be selected');
    setErrors(errs);
    return errs.length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    // include original id when saving so drafts are updated
    const payload: any = { ...formData };
    if (task?.id) payload.id = task.id;
    // include pmsId if present
    // include pmsId if present
    // @ts-ignore
    if (formData.pmsId) payload.pmsId = formData.pmsId;
    if (formData.pmsSubtaskId) (payload as any).pmsSubtaskId = formData.pmsSubtaskId;
    try { playSound('confirm'); popEmoji(document.querySelector('[data-testid="button-save-task"]') as HTMLElement, '💾'); } catch { };
    onSave(payload);
    try {
      playSound('hurray');
      window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Wow, really great!", x: 50, y: 30 } }));
      speak('Wow, really great!');
    } catch { }
    try {
      // Award points only when task marked complete (100%) — per-project
      try {
        if (formData.percentageComplete === 100 && formData.project) {
          const projectId = formData.project;
          const res = (require('@/lib/gamification') as any).addPointsForProject(projectId, 10, 'task-complete');
          try { const { toast } = require('@/hooks/use-toast'); if (res.pointsAdded) toast({ title: `+${res.pointsAdded} pts`, description: `Great! You earned points for completing this task.` }); } catch { }
        }
      } catch (e) { }
    } catch { }
  };

  return (
    <Card className="bg-slate-800/50 border-blue-500/20">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-white flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <span>{task?.id ? 'Edit Task' : 'Add New Task'}</span>
            {postponements.length > 0 && (
              <Badge variant="outline" className="bg-green-600/10 text-green-300">
                {postponements.length === 1 ? 'Postponed once' : `Postponed ${postponements.length} times`}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isRecording ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-md border border-red-500/30">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 font-mono text-sm">{formatElapsedTime(elapsedTime)}</span>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={stopRecording}
                  data-testid="button-stop-recording"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={startRecording}
                className="bg-green-600 hover:bg-green-500"
                data-testid="button-start-recording"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.length > 0 && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
              {errors.map((error, i) => (
                <p key={i} className="text-sm text-red-400">{error}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project" className="text-blue-100">Project *</Label>
              <Select
                value={formData.project}
                onValueChange={(v) => {
                  setFormData({ ...formData, project: v, title: '', subTask: '' });
                  try {
                    // choose variant based on index so different projects produce slightly varied tones
                    const idx = filteredProjects.findIndex(p => p.project_name === v);
                    const variant = idx >= 0 ? (idx % 5) + 1 : undefined;
                    playSound('select', variant);
                    popEmoji(document.querySelector('[data-testid="select-project"]') as HTMLElement);
                  } catch { }
                }}
              >
                <SelectTrigger className="bg-slate-700/50 border-blue-500/20 text-white" data-testid="select-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="flex items-center px-3 pb-2 pt-1 border-b border-blue-500/10">
                    <Search className="w-3.5 h-3.5 text-blue-400/50 mr-2" />
                    <input
                      className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder:text-blue-400/30"
                      placeholder="Search projects..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {/* Ensure prefilled project is visible even if not in fetched list */}
                  {/* Ensure prefilled project is visible even if not in fetched list */}
                  {formData.project && !projects.find(p => p.project_name === formData.project) && (
                    <SelectItem value={formData.project}>{formData.project}</SelectItem>
                  )}
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map(p => (
                      <SelectItem key={p.project_code} value={p.project_name}>{p.project_name}</SelectItem>
                    ))
                  ) : (
                    <div className="py-2 px-8 text-xs text-blue-400/40 italic">No projects found</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keyStep" className="text-blue-100">Key Step</Label>
              <Select
                value={(formData as any).keyStep || ''}
                onValueChange={(v) => {
                  setFormData({ ...formData, keyStep: v });
                  try {
                    const idx = keySteps.findIndex(k => k.name === v);
                    const variant = idx >= 0 ? (idx % 5) + 1 : undefined;
                    playSound('select', variant);
                    popEmoji(document.querySelector('[data-testid="select-keystep"]') as HTMLElement, '🔑');
                  } catch { }
                }}
              >
                <SelectTrigger className="bg-slate-700/50 border-blue-500/20 text-white" data-testid="select-keystep">
                  <SelectValue placeholder="Select key step" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {/* Ensure prefilled key step is visible even if not in fetched list */}
                  {formData.keyStep && !keySteps.find(k => k.name === formData.keyStep) && (
                    <SelectItem value={formData.keyStep}>{formData.keyStep}</SelectItem>
                  )}
                  {keySteps.length === 0 && !formData.keyStep && (
                    <div className="py-2 px-8 text-xs text-blue-400/40 italic">No key steps found for this project</div>
                  )}
                  {keySteps.map(k => (
                    <SelectItem key={k.id} value={k.name}>{k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title" className="text-blue-100">Task *</Label>
                   <button 
                     type="button"
                     onClick={() => setShowDeviationDialog(true)}
                     className="text-[10px] text-amber-500 hover:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1"
                   >
                     <Plus className="w-3 h-3" />
                     Add Deviation
                   </button>
              </div>
              <Select
                value={formData.title}
                onValueChange={(v) => {
                  setFormData({ ...formData, title: v, subTask: '' });
                  try {
                    const idx = tasks.findIndex(t => t.task_name === v);
                    const variant = idx >= 0 ? (idx % 5) + 1 : undefined;
                    playSound('select', variant);
                    popEmoji(document.querySelector('[data-testid="select-task"]') as HTMLElement, '🧩');
                  } catch { }
                }}
              >
                <SelectTrigger className="bg-slate-700/50 border-blue-500/20 text-white" data-testid="select-task">
                  <SelectValue placeholder="Select a task" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {/* Ensure prefilled task is visible even if not in fetched list */}
                  {sortedTasks.length > 0 ? (
                    sortedTasks.map(task => {
                      const isPlanned = dailyPlan?.tasks?.some((pt: any) => pt.taskId === task.id);
                      return (
                        <SelectItem key={task.id} value={task.task_name} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {task.task_name}
                            {isPlanned && (
                              <Badge variant="outline" className="bg-blue-600/20 text-blue-300 border-blue-500/30 text-[9px] py-0 h-4">
                                PLANNED
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <div className="py-2 px-8 text-xs text-blue-400/40 italic">
                      {formData.project ? 'No tasks found for this project' : 'Select a project first'}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subTask" className="text-blue-100">
                Sub Task {subtasks.length > 0 && <span className="text-red-400">*</span>}
              </Label>
              <Select
                value={formData.subTask}
                onValueChange={(value) => {
                  const selected = subtasks.find(s => s.title === value);
                  setFormData({
                    ...formData,
                    subTask: value,
                    pmsSubtaskId: selected?.id
                  });
                  try {
                    const idx = subtasks.findIndex(s => s.title === value);
                    const variant = idx >= 0 ? (idx % 5) + 1 : undefined;
                    playSound('select', variant);
                    popEmoji(document.querySelector('[data-testid="select-subtask"]') as HTMLElement, '📎');
                  } catch { }
                }}
                data-testid="select-subtask"
              >
                <SelectTrigger className="bg-slate-700/50 border-blue-500/20 text-white">
                  <SelectValue placeholder="Select a sub task" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-blue-500/20">
                  {/* Ensure prefilled subtask is visible even if not in fetched list */}
                  {formData.subTask && !subtasks.find(s => s.title === formData.subTask) && (
                    <SelectItem value={formData.subTask}>{formData.subTask}</SelectItem>
                  )}
                  {subtasks.length > 0 ? (
                    subtasks.map((subtask) => (
                      <SelectItem key={subtask.id} value={subtask.title}>{subtask.title}</SelectItem>
                    ))
                  ) : (
                    <div className="py-2 px-8 text-xs text-blue-400/40 italic">
                      {formData.title ? 'No subtasks available for this task' : 'Select a task first'}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantify" className="text-blue-100">Quantify Your Result *</Label>
              <Input
                id="quantify"
                placeholder="Enter quantify (e.g., 5 reports, 10 calls)"
                value={formData.quantify}
                onChange={(e) => setFormData({ ...formData, quantify: e.target.value })}
                onFocus={(e) => { try { playSound('confirm'); if (Math.random() < 0.5) { speak('Tell me the numbers — how many?'); const el = (e.target || e.currentTarget) as HTMLElement | null; if (el) { const r = el.getBoundingClientRect(); window.dispatchEvent(new CustomEvent('mascot:showNear', { detail: { text: 'Tell me the numbers — how many?', rect: { left: r.left, top: r.top, width: r.width, height: r.height } } })); } } } catch { } }}
                onBlur={() => {
                  try {
                    if (formData.quantify && formData.quantify.trim().length > 0) {
                      playSound('confirm', 2);
                      // window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Nice numbers!", x: 70, y: 60 } }));
                      speak('Haha! Nice numbers.');
                      const el = document.querySelector('[data-testid="input-quantify"]') as HTMLElement | null;
                      if (el) {
                        const rect = el.getBoundingClientRect();
                        const detail = { text: `Haha! Nice — ${formData.quantify}`, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
                        console.debug('[TaskForm] dispatching mascot:showNear (blur quantify)', detail);
                        window.dispatchEvent(new CustomEvent('mascot:showNear', { detail }));
                      }
                    }
                  } catch { }
                }}
                className="bg-slate-700/50 border-blue-500/20 text-white"
                data-testid="input-quantify"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="achievements" className="text-blue-100">Achievements</Label>
              <Input
                id="achievements"
                placeholder="What did you accomplish?"
                value={formData.achievements}
                onChange={(e) => setFormData({ ...formData, achievements: e.target.value })}
                onFocus={(e) => {
                  try {
                    playSound('confirm');
                    speak('Hey! Tell me what you achieved today.');
                    const el = (e.target || e.currentTarget) as HTMLElement | null;
                    const rect = el ? el.getBoundingClientRect() : null;
                    if (rect && Math.random() < 0.5) {
                      // pass a plain object with the rect numbers to avoid cross-origin serialization issues
                      const detail = { text: 'Tell me, what did you achieve?', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
                      console.debug('[TaskForm] dispatching mascot:showNear', detail);
                      window.dispatchEvent(new CustomEvent('mascot:showNear', { detail }));
                    }
                  } catch { }
                }}
                onBlur={() => { try { if (formData.achievements && formData.achievements.trim().length > 0) { playSound('wow'); speak('Wow, really great! Keep it up.'); popEmoji(document.querySelector('[data-testid="input-achievements"]') as HTMLElement, '🎉'); } } catch { } }}
                className="bg-slate-700/50 border-blue-500/20 text-white"
                data-testid="input-achievements"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="problemAndIssues" className="text-blue-100">Problems & Issues</Label>
              <Input
                id="problemAndIssues"
                placeholder="Enter any problems or issues faced"
                value={formData.problemAndIssues}
                onChange={(e) => setFormData({ ...formData, problemAndIssues: e.target.value })}
                onFocus={(e) => { try { playSound('select', 2); if (Math.random() < 0.4) { speak('Any blockers? Tell me the problem.'); const el = (e.target || e.currentTarget) as HTMLElement | null; if (el) { const r = el.getBoundingClientRect(); window.dispatchEvent(new CustomEvent('mascot:showNear', { detail: { text: 'Any blockers? Tell me the problem.', rect: { left: r.left, top: r.top, width: r.width, height: r.height } } })); } } } catch { } }}
                onBlur={() => { try { if (formData.problemAndIssues && formData.problemAndIssues.trim().length > 0) { playSound('confirm'); speak('Thanks for noting that — you are thorough.'); } } catch { } }}
                className="bg-slate-700/50 border-blue-500/20 text-white"
                data-testid="input-problem-issues"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scopeOfImprovements" className="text-blue-100">Scope of Improvements</Label>
              <Input
                id="scopeOfImprovements"
                placeholder="Areas for improvement"
                value={formData.scopeOfImprovements}
                onChange={(e) => setFormData({ ...formData, scopeOfImprovements: e.target.value })}
                onFocus={(e) => { try { playSound('select', 3); if (Math.random() < 0.4) { speak('How can this get even better?'); const el = (e.target || e.currentTarget) as HTMLElement | null; if (el) { const r = el.getBoundingClientRect(); window.dispatchEvent(new CustomEvent('mascot:showNear', { detail: { text: 'How can this get even better?', rect: { left: r.left, top: r.top, width: r.width, height: r.height } } })); } } } catch { } }}
                onBlur={() => { try { if (formData.scopeOfImprovements && formData.scopeOfImprovements.trim().length > 0) { playSound('confirm'); speak('Great improvement idea — small steps make a difference.'); } } catch { } }}
                className="bg-slate-700/50 border-blue-500/20 text-white"
                data-testid="input-scope-improvements"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-blue-100">
              Description <span className="text-blue-400/60 text-xs">(optional, max 35 words)</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe the task (optional, max 35 words)..."
              value={formData.description}
              onChange={(e) => {
                const words = e.target.value.trim().split(/\s+/).filter(w => w.length > 0);
                if (words.length <= 35) {
                  setFormData({ ...formData, description: e.target.value });
                  if (words.length === 20) {
                    playSound('wow');
                    // window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Love the detail!", x: 80, y: 70 } }));
                  }
                }
              }}
              className="bg-slate-700/50 border-blue-500/20 text-white resize-none"
              rows={3}
              data-testid="input-description"
            />
            <p className="text-xs text-blue-400/60">
              {formData.description.trim().split(/\s+/).filter(w => w.length > 0).length}/35 words
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="text-blue-100">Start Time (IST) *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="pl-10 bg-slate-700/50 border-blue-500/20 text-white"
                  data-testid="input-start-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime" className="text-blue-100">End Time (IST) *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="pl-10 bg-slate-700/50 border-blue-500/20 text-white"
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="percentage" className="text-blue-100">Completion %</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, percentageComplete: Math.max(0, formData.percentageComplete - 10) })}
                  className="bg-slate-700/50 border-blue-500/20 text-white hover:bg-slate-600/50"
                  data-testid="btn-decrease-percentage"
                >
                  -
                </Button>
                <Input
                  id="percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.percentageComplete}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    setFormData({ ...formData, percentageComplete: val });
                    if (val === 100) {
                      playSound('hurray');
                      // window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Hurray! 100%!", x: 50, y: 20 } }));
                    }
                  }}
                  className="bg-slate-700/50 border-blue-500/20 text-white text-center"
                  data-testid="input-percentage"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, percentageComplete: Math.min(100, formData.percentageComplete + 10) })}
                  className="bg-slate-700/50 border-blue-500/20 text-white hover:bg-slate-600/50"
                  data-testid="btn-increase-percentage"
                >
                  +
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-blue-100">Tools Used</Label>
            <Command className="bg-slate-700/30 border border-blue-500/10 rounded-md">
              <CommandInput
                placeholder="Search tools..."
                value={toolSearch}
                onValueChange={setToolSearch}
                className="bg-transparent border-none text-white placeholder:text-slate-400"
                data-testid="input-tool-search"
              />
              <CommandList className="max-h-40">
                <CommandEmpty className="text-slate-400 p-2">No tools found.</CommandEmpty>
                <CommandGroup>
                  {TOOLS_LIST.filter(tool =>
                    tool.toLowerCase().includes(toolSearch.toLowerCase())
                  ).map(tool => (
                    <CommandItem
                      key={tool}
                      onSelect={() => { toggleTool(tool); setToolSearch(''); }}
                      className={`cursor-pointer ${formData.toolsUsed.includes(tool)
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-slate-300 hover:bg-slate-600/50'
                        }`}
                      data-testid={`command-tool-${tool.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Check className={`w-4 h-4 mr-2 ${formData.toolsUsed.includes(tool) ? 'opacity-100' : 'opacity-0'}`} />
                      {tool}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            {formData.toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.toolsUsed.map(tool => (
                  <Badge
                    key={tool}
                    variant="outline"
                    className="bg-blue-500/20 text-blue-300 border-blue-500/50"
                    onClick={() => toggleTool(tool)}
                    data-testid={`badge-selected-tool-${tool.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {tool}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="border-slate-600 text-slate-300"
              data-testid="button-cancel"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-cyan-600"
              data-testid="button-save-task"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveButtonText || 'Save Task'}
            </Button>
          </div>
        </form>

        {/* Deviation Dialog */}
        <Dialog open={showDeviationDialog} onOpenChange={setShowDeviationDialog}>
          <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-white p-6 shadow-2xl rounded-3xl">
            <DialogHeader className="mb-6">
              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 mb-4">
                 <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
              <DialogTitle className="text-2xl font-black">Add Task Deviation</DialogTitle>
              <DialogDescription className="text-slate-400 font-medium pt-1">
                This task isn't in your initial plan. Adding it counts as a daily deviation.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-2">
              <div className="space-y-3">
                <Label className="text-slate-400 font-bold text-xs uppercase tracking-widest">Select Task from PMS *</Label>
                <Select 
                  onValueChange={(v) => setSelectedDeviationTask(tasks.find(t => t.id === v))}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 h-14 rounded-2xl focus:ring-amber-500/30">
                    <SelectValue placeholder="Search tasks for deviation..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px] bg-slate-900 border-slate-800 text-white">
                     {tasks.filter(t => !dailyPlan?.tasks.some((pt: any) => pt.taskId === t.id)).length > 0 ? (
                        tasks.filter(t => !dailyPlan?.tasks.some((pt: any) => pt.taskId === t.id)).map(task => (
                           <SelectItem key={task.id} value={task.id} className="hover:bg-slate-800 focus:bg-slate-800">{task.task_name}</SelectItem>
                        ))
                     ) : (
                        <div className="p-4 text-center text-xs text-slate-500 italic">All available tasks are already in your plan</div>
                     )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-slate-400 font-bold text-xs uppercase tracking-widest">Reason for Deviation *</Label>
                <Textarea 
                  placeholder="Why are you adding this task today? (Mandatory)"
                  value={deviationReason}
                  onChange={(e) => setDeviationReason(e.target.value)}
                  className="bg-slate-950 border-slate-800 min-h-[120px] rounded-2xl focus:ring-amber-500/30 text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            <DialogFooter className="mt-8 flex gap-3">
              <Button variant="ghost" className="rounded-xl flex-1 h-12" onClick={() => setShowDeviationDialog(false)}>Cancel</Button>
              <Button 
                disabled={addDeviationMutation.isPending || !selectedDeviationTask || !deviationReason}
                onClick={handleAddDeviation}
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black rounded-xl flex-[2] h-12 shadow-lg shadow-amber-900/20"
              >
                {addDeviationMutation.isPending ? 'ADDING...' : 'ADD TO PLAN'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
