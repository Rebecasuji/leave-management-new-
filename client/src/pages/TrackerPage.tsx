import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, Send, Download, FileSpreadsheet, CheckCircle, Mail, Clock, Zap, AlertCircle, Settings, Target } from 'lucide-react';
import TaskTable, { Task } from '@/components/TaskTable';
import ShiftSelector from '@/components/ShiftSelector';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import GreetingAssistant from '@/components/GreetingAssistant';
import { User } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { format, addDays, isAfter, startOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { confettiBurst, playSound } from '@/lib/feedback';
import gamification from '@/lib/gamification';
import PointsDisplay from '@/components/PointsDisplay';
import type { TimeEntry } from '@shared/schema';
// ProjectTreesPanel removed from Tracker page (kept component for Achievements page use)

interface TrackerPageProps {
  user: User;
}

// Structure returned by /api/pending-deadline-tasks
interface PendingDeadlineTask {
  id: string;
  task_name: string;
  projectName: string;
  isAssignedToEmployee: boolean;
  end_date?: string | null;
  start_date?: string | null;
  projectCode?: string;
}

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const formatTaskDescription = (task: any) => {
  let desc = task.title;
  if (task.subTask) desc += ' | ' + task.subTask;
  else desc += ' | ';
  if (task.description) desc += ' | ' + task.description;
  return desc;
};

export default function TrackerPage({ user }: TrackerPageProps) {
  const { toast } = useToast();
  // Initialize date from URL query parameter if available
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam) {
      const parsedDate = new Date(dateParam);
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }
    return new Date();
  });
  const [shiftHours, setShiftHours] = useState<4 | 8 | 12>(8);
  const [, setLocation] = useLocation();
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [showSubmissionConfirm, setShowSubmissionConfirm] = useState(false);
  const [submittedTasks, setSubmittedTasks] = useState<Task[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [blockUnassignedTasks, setBlockUnassignedTasks] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [projectFilter, setProjectFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Fetch timesheet blocking settings
  const { data: blockingSettings } = useQuery({
    queryKey: ['/api/settings/timesheet-blocking'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/settings/timesheet-blocking');
        if (!response.ok) throw new Error('Failed to fetch settings');
        const data = await response.json();
        setBlockUnassignedTasks(data.blockUnassignedProjectTasks || false);
        return data;
      } catch (error) {
        console.error('Error fetching settings:', error);
        return { blockUnassignedProjectTasks: false };
      }
    },
  });

  // Update blocking settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (blockUnassigned: boolean) => {
      const response = await fetch('/api/settings/timesheet-blocking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockUnassignedProjectTasks: blockUnassigned }),
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: (data) => {
      setBlockUnassignedTasks(data.blockUnassignedProjectTasks);
      queryClient.invalidateQueries({ queryKey: ['/api/settings/timesheet-blocking'] });
      toast({
        title: "Settings Updated",
        description: `Unassigned project tasks will ${data.blockUnassignedProjectTasks ? 'now' : 'no longer'} block submission.`,
      });
    },
  });

  const formattedDate = format(selectedDate, 'yyyy-MM-dd');

  // Helper to get storage key for user's pending tasks
  const getPendingTasksKey = (userId: string, date: string) => `pendingTasks_${userId}_${date}`;

  const storageKey = getPendingTasksKey(user.id, formattedDate);

  // Initialize pendingTasks from localStorage
  const [pendingTasks, setPendingTasks] = useState<Task[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Check if daily plan is submitted
  const { data: dailyPlanStatus } = useQuery({
    queryKey: ['/api/daily-plans/today', user.id, formattedDate],
    queryFn: async () => {
      // Only check for today or past days if relevant, but typically "Plan for the Day" is for "today"
      const res = await fetch(`/api/daily-plans/today/${user.id}`);
      if (!res.ok) return { submitted: false };
      return res.json();
    },
    enabled: !!user?.id && formattedDate === format(new Date(), 'yyyy-MM-dd'),
  });

  const checkPlanAndNavigate = (targetUrl: string) => {
    const isToday = formattedDate === format(new Date(), 'yyyy-MM-dd');
    if (isToday && !dailyPlanStatus?.submitted) {
      // Allow navigation but show a small toast/warning if needed, but per user request we allow manual tasks
      console.log('Daily plan not submitted, but allowing manual task entry per user request.');
    }
    setLocation(targetUrl);
  };

  // Tasks fetched from PMS that are due today but not yet added to timesheet
  const [pendingDeadlineTasks, setPendingDeadlineTasks] = useState<PendingDeadlineTask[]>([]);
  const [showPlanAlert, setShowPlanAlert] = useState(false);

  // Persist pendingTasks to localStorage whenever they change
  const updatePendingTasks = (newTasks: Task[]) => {
    setPendingTasks(newTasks);
    if (newTasks.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(newTasks));
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  // Load tasks when date changes
  const loadTasksForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const key = getPendingTasksKey(user.id, dateStr);
    try {
      const stored = localStorage.getItem(key);
      setPendingTasks(stored ? JSON.parse(stored) : []);
    } catch {
      setPendingTasks([]);
    }
  };

  // Fetch user's time entries from database
  const { data: serverEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['/api/time-entries/employee', user.id],
  });

  // Fetch LMS hours for the selected date
  const { data: lmsHoursData } = useQuery<{ leaveHours: number; permissionHours: number; totalLMSHours: number }>({
    queryKey: ['/api/lms/hours', user.employeeCode, formattedDate],
    queryFn: async () => {
      const response = await fetch(`/api/lms/hours?employeeCode=${user.employeeCode}&date=${formattedDate}`);
      if (!response.ok) return { leaveHours: 0, permissionHours: 0, totalLMSHours: 0 };
      return response.json();
    },
    enabled: !!user?.employeeCode && !!formattedDate,
  });

  const lmsHours = lmsHoursData?.totalLMSHours || 0;
  const lmsMinutes = Math.round(lmsHours * 60);

  // Fetch available PMS tasks for the employee
  const { data: availableTasks = [], isLoading: isLoadingPMSTasks, error: pmsError } = useQuery<any[]>({
    queryKey: ['/api/available-tasks', user.id],
    queryFn: async () => {
      try {
        console.log('[DEBUG] Fetching available PMS tasks for employee:', user.id);
        const response = await fetch(`/api/available-tasks?employeeId=${user.id}`);
        if (!response.ok) {
          console.error('[DEBUG] API response not ok:', response.status);
          return [];
        }
        const data = await response.json();
        console.log('[DEBUG] Available tasks fetched:', data);
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('[DEBUG] Error fetching available tasks:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });

  // Fetch all projects for the department to populate filters
  const { data: pmsProjects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects', user.id],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/projects?userRole=${user.role}&userEmpCode=${user.employeeCode}&userDepartment=${user.department}`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json();
      } catch (error) {
        console.error('Error fetching projects:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });

  // Filter entries for selected date, but ALWAYS include rejected entries from any date
  const todaysEntries = serverEntries.filter(e => e.date === formattedDate || e.status === 'rejected');


  // Create time entry mutation
  const submitMutation = useMutation({
    mutationFn: async (task: Task) => {
      const response = await apiRequest('POST', '/api/time-entries', {
        employeeId: user.id,
        employeeCode: user.employeeCode,
        employeeName: user.name,
        date: formattedDate,
        projectName: task.project,
        taskDescription: formatTaskDescription(task),
        problemAndIssues: (task as any).problemAndIssues || '',
        quantify: (task as any).quantify || '',
        achievements: (task as any).achievements || '',
        scopeOfImprovements: (task as any).scopeOfImprovements || '',
        toolsUsed: task.toolsUsed || [],
        startTime: task.startTime,
        endTime: task.endTime,
        totalHours: formatDuration(task.durationMinutes),
        percentageComplete: task.percentageComplete,
        pmsId: task.pmsId,
        pmsSubtaskId: (task as any).pmsSubtaskId,
        status: 'pending',
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit task. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update time entry mutation (for server entries)
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PUT', `/api/time-entries/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({
        title: "Task Updated",
        description: "Your task has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task. Only pending tasks can be edited.",
        variant: "destructive",
      });
    },
  });

  // Delete time entry mutation (for server entries)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/time-entries/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({
        title: "Task Deleted",
        description: "Your task has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete task. Only pending tasks can be deleted.",
        variant: "destructive",
      });
    },
  });

  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+)h\s*(\d+)m?/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2] || '0');
    }
    return 0;
  };

  // Parse task description that may contain task and subtask
  const parseTaskDescription = (taskDesc: string) => {
    const parts = taskDesc.split(' | ');
    if (parts.length >= 2) {
      return { title: parts[0], subTask: parts[1], description: parts.slice(2).join(' | ') };
    }
    const colonParts = taskDesc.split(':');
    return { title: colonParts[0] || taskDesc, subTask: '', description: colonParts[1]?.trim() || '' };
  };

  // Combine pending tasks with submitted entries for display
  const allTasks: Task[] = useMemo(() => [
    // Convert server entries to Task format
    ...todaysEntries.map(entry => {
      const parsed = parseTaskDescription(entry.taskDescription);
      return {
        id: entry.id,
        project: entry.projectName,
        title: parsed.title,
        subTask: parsed.subTask,
        description: parsed.description,
        problemAndIssues: entry.problemAndIssues || '',
        quantify: entry.quantify || '',
        achievements: entry.achievements || '',
        scopeOfImprovements: entry.scopeOfImprovements || '',
        toolsUsed: entry.toolsUsed || [],
        startTime: entry.startTime,
        endTime: entry.endTime,
        durationMinutes: parseDuration(entry.totalHours),
        percentageComplete: entry.percentageComplete ?? 0,
        pmsId: entry.pmsId || undefined,
        pmsSubtaskId: entry.pmsSubtaskId || undefined,
        keyStep: (entry as any).keyStep || undefined,
        isComplete: entry.status === 'approved',
        serverStatus: entry.status as Task['serverStatus'],
        date: entry.date,
        rejectionReason: entry.rejectionReason || undefined,
      };
    }),
    // Add pending local tasks
    ...pendingTasks.map(t => ({ ...t, serverStatus: 'draft' as const })),
  ], [todaysEntries, pendingTasks]);

  // Apply filters to tasks
  const filteredAllTasks = useMemo(() => {
    return allTasks.filter(task => {
      const matchesProject = task.project.toLowerCase().includes(projectFilter.toLowerCase());
      const matchesTask = task.title.toLowerCase().includes(taskFilter.toLowerCase()) ||
        (task.description || '').toLowerCase().includes(taskFilter.toLowerCase());
      return matchesProject && matchesTask;
    });
  }, [allTasks, projectFilter, taskFilter]);

  const filteredAvailableTasks = useMemo(() => {
    return availableTasks.filter(task => {
      const matchesProject = task.projectName.toLowerCase().includes(projectFilter.toLowerCase());
      const matchesTask = task.task_name.toLowerCase().includes(taskFilter.toLowerCase()) ||
        (task.description || '').toLowerCase().includes(taskFilter.toLowerCase());
      return matchesProject && matchesTask;
    });
  }, [availableTasks, projectFilter, taskFilter]);

  // Extract unique projects and tasks for dropdowns
  const uniqueProjects = useMemo(() => {
    const projects = new Set<string>();
    pmsProjects.forEach(p => projects.add(p.project_name || p.title));
    availableTasks.forEach(t => projects.add(t.projectName));
    allTasks.forEach(t => projects.add(t.project));
    return Array.from(projects).sort();
  }, [pmsProjects, availableTasks, allTasks]);

  const uniqueTasks = useMemo(() => {
    const tasks = new Set<string>();

    // If a project is selected, only show tasks for that project
    const pmsSource = projectFilter && projectFilter !== 'all'
      ? availableTasks.filter(t => t.projectName === projectFilter)
      : availableTasks;

    const trackerSource = projectFilter && projectFilter !== 'all'
      ? allTasks.filter(t => t.project === projectFilter)
      : allTasks;

    pmsSource.forEach(t => tasks.add(t.task_name));
    trackerSource.forEach(t => tasks.add(t.title));

    return Array.from(tasks).sort();
  }, [availableTasks, allTasks, projectFilter]);

  // Update filtering logic to handle 'all'
  const filteredAllTasksDropdown = useMemo(() => {
    return allTasks.filter(task => {
      const matchesProject = !projectFilter || projectFilter === 'all' || task.project === projectFilter;
      const matchesTask = !taskFilter || taskFilter === 'all' || task.title === taskFilter;

      // For tracked tasks, compare against today's date (formattedDate)
      let matchesDateRange = true;
      if (startDateFilter && formattedDate < startDateFilter) matchesDateRange = false;
      if (endDateFilter && formattedDate > endDateFilter) matchesDateRange = false;

      return matchesProject && matchesTask && matchesDateRange;
    });
  }, [allTasks, projectFilter, taskFilter, startDateFilter, endDateFilter, formattedDate]);

  const filteredAvailableTasksDropdown = useMemo(() => {
    return availableTasks.filter(task => {
      const matchesProject = !projectFilter || projectFilter === 'all' || task.projectName === projectFilter;
      const matchesTask = !taskFilter || taskFilter === 'all' || task.task_name === taskFilter;

      // For PMS tasks, compare against deadlines or start/end dates
      const taskStart = task.start_date || task.projectStartDate;
      const taskEnd = task.taskDeadline || task.end_date || task.projectDeadline;

      let matchesDateRange = true;
      if (startDateFilter) {
        // If task has an end date, it must be >= start filter. If only start date, it must be >= start filter.
        const compareDate = taskEnd || taskStart;
        if (compareDate) {
          const formattedCompare = format(new Date(compareDate), 'yyyy-MM-dd');
          if (formattedCompare < startDateFilter) matchesDateRange = false;
        }
      }
      if (endDateFilter) {
        // If task has a start date, it must be <= end filter.
        const compareDate = taskStart || taskEnd;
        if (compareDate) {
          const formattedCompare = format(new Date(compareDate), 'yyyy-MM-dd');
          if (formattedCompare > endDateFilter) matchesDateRange = false;
        }
      }
      return matchesProject && matchesTask && matchesDateRange;
    });
  }, [availableTasks, projectFilter, taskFilter, startDateFilter, endDateFilter]);

  const todaysTasksOnly = useMemo(() =>
    allTasks.filter(t => t.serverStatus === 'draft' || t.date === formattedDate),
    [allTasks, formattedDate]
  );

  // Robust calculation of task duration (minutes)
  const calculateTaskMinutes = (task: Task): number => {
    if (task.durationMinutes && task.durationMinutes > 0) return task.durationMinutes;
    if (task.startTime && task.endTime) {
      try {
        const [sh, sm] = task.startTime.split(':').map(Number);
        const [eh, em] = task.endTime.split(':').map(Number);
        let duration = (eh * 60 + em) - (sh * 60 + sm);
        return duration > 0 ? duration : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  };

  const totalWorkedMinutes = useMemo(() => 
    todaysTasksOnly.reduce((acc, task) => acc + calculateTaskMinutes(task), 0),
    [todaysTasksOnly]
  );
  
  const totalCombinedMinutes = totalWorkedMinutes + lmsMinutes;
  
  // Debug log for LMS
  console.log(`[LMS Debug] Code: ${user?.employeeCode}, Date: ${formattedDate}, Hours: ${lmsHours}, Minutes: ${lmsMinutes}, Total: ${totalCombinedMinutes}`);

  const alreadySubmittedToday = todaysEntries.some(e => e.date === formattedDate && (e.status === 'pending' || e.status === 'approved'));

  // Allow submission if there are pending (draft) tasks, regardless of previous submissions
  const canSubmit =
    !isSubmitting &&
    pendingTasks.length > 0 &&
    totalCombinedMinutes > 0;


  const handleSaveTask = async (taskData: Task) => {
    // This function is now handled in TaskEntryPage.tsx
    // Keeping minimal logic if any other direct calls exist, but normally not needed
  };

  const handleEditTask = (task: Task) => {
    checkPlanAndNavigate(`/task-entry/${task.id}?date=${formattedDate}`);
  };

  const handleResubmitTask = async (task: Task) => {
    try {
      await apiRequest('PATCH', `/api/time-entries/${task.id}/resubmit`, {
        date: formattedDate
      });
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user.id] });
      toast({
        title: "Task Resubmitted",
        description: `Task resubmitted with today's date (${formattedDate}).`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resubmit task.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // Allow deletion of local tasks OR server tasks that are still pending
    const task = allTasks.find(t => t.id === taskId);

    if (taskId.startsWith('local-')) {
      // Local task - remove from state and localStorage
      updatePendingTasks(pendingTasks.filter(t => t.id !== taskId));
    } else if (task?.serverStatus === 'pending') {
      // Server task - delete via API
      await deleteMutation.mutateAsync(taskId);
    } else {
      toast({
        title: "Cannot Delete",
        description: "Only pending tasks can be deleted.",
        variant: "destructive",
      });
    }
  };

  const handleQuickAddTask = (task: any) => {
    const params = new URLSearchParams();
    params.append('date', formattedDate);
    // @ts-ignore
    params.append('pmsId', task.id || task.pmsId || '');
    params.append('pmsTaskName', task.task_name || '');
    params.append('pmsProjectName', task.projectName || '');
    params.append('pmsDescription', task.description || '');
    checkPlanAndNavigate(`/task-entry?${params.toString()}`);
  };

  const handleCompleteTask = (taskId: string) => {
    updatePendingTasks(pendingTasks.map(t =>
      t.id === taskId ? { ...t, isComplete: true, percentageComplete: 100 } : t
    ));
    // Trigger celebratory doll
    window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Task Complete! Hurray!", x: 50, y: 30 } }));
  };


  // automatically refresh pending deadline tasks whenever date or user changes
  // helper that filters a list of PMS tasks for those due on selected date
  // and not yet added as a serverEntry or pendingTask
  const extractDueToday = (list: any[]): any[] => {
    const existingIds = new Set<string>([
      ...todaysEntries.map(e => e.id.toString()),
      ...pendingTasks.map(t => t.id.toString()),
    ]);
    return list.filter(t => {
      if (existingIds.has(t.id?.toString())) return false;
      const dt = t.end_date || t.start_date;
      if (!dt) return false;
      try {
        return format(new Date(dt), 'yyyy-MM-dd') === formattedDate;
      } catch {
        return false;
      }
    });
  };

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const res = await fetch(`/api/pending-deadline-tasks?employeeId=${user.id}&date=${formattedDate}`);
        let serverPending: any[] = [];
        if (res.ok) {
          const data = await res.json();
          console.debug('[Tracker] pending-deadline response', formattedDate, data);
          serverPending = Array.isArray(data) ? data : [];
        } else {
          console.debug('[Tracker] pending-deadline fetch returned non-ok', res.status);
        }
        // also include availableTasks due today that aren't already represented
        const dueFromAvailable = extractDueToday(availableTasks);
        // merge preserving unique ids (string)
        const combined = [...serverPending];
        dueFromAvailable.forEach(t => {
          if (!combined.some(x => x.id === t.id)) combined.push(t);
        });
        setPendingDeadlineTasks(combined);
      } catch (e) {
        console.error('Failed to fetch pending deadline tasks in effect', e);
        // fallback to availableTasks if any
        setPendingDeadlineTasks(extractDueToday(availableTasks));
      }
    };
    load();
  }, [formattedDate, user, availableTasks]);

  // Update type to include 'acknowledge'
  const [postponeForm, setPostponeForm] = useState<Record<string, { selected: boolean; reason: string; newDate: string; action: 'extend' | 'keep' }>>({});

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (pendingTasks.length === 0) {
        toast({ title: 'Nothing to submit', description: 'Please add at least one task before submitting.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      // Detailed validation of each pending task
      const invalidTasks = pendingTasks.filter(t => {
        const hasProject = !!t.project;
        const hasTitle = !!t.title;
        const hasTimes = !!t.startTime && !!t.endTime;
        const hasTools = t.toolsUsed && t.toolsUsed.length > 0;
        const hasQuantify = !!(t as any).quantify;
        return !hasProject || !hasTitle || !hasTimes || !hasTools || !hasQuantify;
      });

      if (invalidTasks.length > 0) {
        toast({
          title: 'Incomplete Tasks',
          description: `Please fill in all required fields (Project, Task, Start/End Time, Quantify, Tools) for all tasks before submitting.`,
          variant: 'destructive'
        });
        setIsSubmitting(false);
        return;
      }

      // Check for overlapping times or invalid durations
      const hasInvalidDuration = pendingTasks.some(t => calculateTaskMinutes(t) <= 0);
      if (hasInvalidDuration) {
        toast({
          title: 'Invalid Time Entries',
          description: 'One or more tasks have invalid start/end times. Please correct them.',
          variant: 'destructive'
        });
        setIsSubmitting(false);
        return;
      }

      // Store tasks for confirmation display
      const tasksToSubmit = [...pendingTasks];

      // Submit all pending tasks to database in parallel for performance
      await Promise.all(pendingTasks.map(task => 
        apiRequest('POST', '/api/time-entries', {
          employeeId: user.id,
          employeeCode: user.employeeCode,
          employeeName: user.name,
          date: formattedDate,
          projectName: task.project,
          taskDescription: formatTaskDescription(task),
          problemAndIssues: (task as any).problemAndIssues || '',
          quantify: (task as any).quantify || '',
          achievements: (task as any).achievements || '',
          scopeOfImprovements: (task as any).scopeOfImprovements || '',
          toolsUsed: task.toolsUsed || [],
          startTime: task.startTime,
          endTime: task.endTime,
          totalHours: formatDuration(calculateTaskMinutes(task)), // Use calculated duration
          percentageComplete: task.percentageComplete,
          pmsId: task.pmsId,
          pmsSubtaskId: (task as any).pmsSubtaskId,
          keyStep: task.keyStep,
          status: 'pending',
        })
      ));

      // Send daily summary email to managers and confirmation to employee
      try {
        await apiRequest('POST', `/api/time-entries/submit-daily/${user.id}/${formattedDate}`);
      } catch (emailError) {
        console.log('Daily summary email notification skipped or failed', emailError);
      }

      // Save submitted tasks for display and show confirmation
      setSubmittedTasks(tasksToSubmit);
      setShowSubmissionConfirm(true);
      try {
        confettiBurst();
        playSound('submit');
        // Trigger celebratory dolls
        window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Timesheet Submitted!", x: 40, y: 30 } }));
        setTimeout(() => window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Great Job!", x: 60, y: 40 } })), 400);
      } catch { }

      // Note: Points are now awarded per-project when tasks are completed (100%).
      // We intentionally do not award points here for timesheet submission to avoid duplicate awards.

      toast({
        title: "Timesheet Submitted",
        description: "Your timesheet has been sent for approval.",
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Some tasks failed to submit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostponeSubmit = async () => {
    // Validate all selected pending tasks
    const toProcess = pendingDeadlineTasks.filter(t => postponeForm[t.id]?.selected);

    if (toProcess.length === 0) {
      toast({ title: 'Validation', description: 'Please select tasks to resolve', variant: 'destructive' });
      return;
    }

    for (const t of toProcess) {
      const f = postponeForm[t.id];
      if (f.action === 'extend' && (!f.reason || !f.newDate)) {
        toast({ title: 'Validation', description: 'Please provide reason and new date for extending tasks', variant: 'destructive' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Process each task based on action
      for (const t of toProcess) {
        const f = postponeForm[t.id];

        if (f.action === 'extend') {
          await apiRequest('POST', `/api/tasks/${t.id}/postpone`, {
            taskName: t.task_name,
            previousDueDate: t.end_date || t.start_date || null,
            newDueDate: f.newDate,
            reason: f.reason,
            postponedBy: user.id,
          });
          try {
            // apply a small penalty for postponing the task so project tree reflects postponements
            const projectId = t.projectCode || t.projectName || String(t.id);
            // default penalty: 10 points
            (gamification as any).subtractPointsForProject(projectId, 10, 'postpone-penalty');
          } catch (e) { }
        } else {
          // Acknowledge logic
          await apiRequest('POST', `/api/tasks/${t.id}/acknowledge`, {
            acknowledgedBy: user.id,
            projectCode: t.projectCode
          });
        }
      }

      // close dialog and continue to submit timesheet automatically
      setShowPendingDialog(false);
      toast({ title: 'Resolved', description: 'Deadline tasks resolved. Submitting timesheet...' });

      // Re-run final submit flow
      await handleFinalSubmit();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to process tasks', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearPendingTasksAndReload = () => {
    updatePendingTasks([]);
    setShowSubmissionConfirm(false);
    queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user.id] });
  };

  // Export to Excel function
  const handleExportToExcel = () => {
    // Prepare data for export
    const exportData = serverEntries.map(entry => ({
      'Date': entry.date,
      'Employee Code': entry.employeeCode,
      'Employee Name': entry.employeeName,
      'Project Name': entry.projectName,
      'Task Description': entry.taskDescription,
      'Start Time': entry.startTime,
      'End Time': entry.endTime,
      'Total Hours': entry.totalHours,
      'Status': entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : 'Pending',
      'Submitted At': entry.submittedAt ? format(new Date(entry.submittedAt), 'yyyy-MM-dd HH:mm') : '',
      'Approved By': entry.approvedBy || '',
      'Approved At': entry.approvedAt ? format(new Date(entry.approvedAt), 'yyyy-MM-dd HH:mm') : '',
    }));

    if (exportData.length === 0) {
      toast({
        title: "No Data",
        description: "There are no time entries to export.",
        variant: "destructive",
      });
      return;
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 14 }, // Employee Code
      { wch: 20 }, // Employee Name
      { wch: 20 }, // Project Name
      { wch: 40 }, // Task Description
      { wch: 10 }, // Start Time
      { wch: 10 }, // End Time
      { wch: 12 }, // Total Hours
      { wch: 10 }, // Status
      { wch: 18 }, // Submitted At
      { wch: 15 }, // Approved By
      { wch: 18 }, // Approved At
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Time Entries');

    // Generate filename with date range
    const fileName = `TimeEntries_${user.employeeCode}_${format(new Date(), 'yyyyMMdd')}.xlsx`;

    // Download file
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export Successful",
      description: `Downloaded ${exportData.length} time entries as Excel file.`,
    });
  };

  // Calculate live tools usage from actual tasks
  const toolsUsageMap = new Map<string, number>();
  todaysTasksOnly.forEach(task => {
    if (task.toolsUsed && task.toolsUsed.length > 0) {
      const minutesPerTool = task.durationMinutes / task.toolsUsed.length;
      task.toolsUsed.forEach(tool => {
        toolsUsageMap.set(tool, (toolsUsageMap.get(tool) || 0) + minutesPerTool);
      });
    }
  });
  const liveToolsUsage = Array.from(toolsUsageMap.entries())
    .map(([tool, minutes]) => ({ tool, minutes: Math.round(minutes) }))
    .sort((a, b) => b.minutes - a.minutes);

  // Calculate live hourly productivity from actual task times
  const hourlyMap = new Map<string, number>();
  todaysTasksOnly.forEach(task => {
    if (task.startTime && task.endTime) {
      const startHour = parseInt(task.startTime.split(':')[0]);
      const endHour = parseInt(task.endTime.split(':')[0]);
      const startMin = parseInt(task.startTime.split(':')[1]);
      const endMin = parseInt(task.endTime.split(':')[1]);

      for (let h = startHour; h <= endHour; h++) {
        let mins = 60;
        if (h === startHour) mins = 60 - startMin;
        if (h === endHour) mins = Math.min(mins, endMin);
        if (h === startHour && h === endHour) mins = endMin - startMin;

        const hourLabel = h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`;
        hourlyMap.set(hourLabel, (hourlyMap.get(hourLabel) || 0) + Math.max(0, mins));
      }
    }
  });

  // Create ordered hourly data
  const hours = ['9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM'];
  const liveHourlyProductivity = hours
    .map(hour => ({ hour, minutes: hourlyMap.get(hour) || 0 }))
    .filter(h => h.minutes > 0 || hours.indexOf(h.hour) <= hours.findIndex(hh => hourlyMap.has(hh)));

  // Analytics data based on live tracked tasks only
  const analyticsData = {
    productiveMinutes: totalWorkedMinutes,
    idleMinutes: 0,
    neutralMinutes: 0,
    nonProductiveMinutes: 0,
    taskHours: todaysTasksOnly.map(t => ({ task: t.title.slice(0, 20), hours: t.durationMinutes / 60 })),
    toolsUsage: liveToolsUsage,
    hourlyProductivity: liveHourlyProductivity.length > 0 ? liveHourlyProductivity : [],
  };

  return (
    <div className="p-4 md:p-6 space-y-6" data-testid="tracker-page">
      {user?.name?.toLowerCase() !== 'durga devi' && <GreetingAssistant userName={user.name} />}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk' }}>
            Time Tracker
          </h1>
          <p className="text-blue-200/60 text-sm">
            Welcome, {user.name} ({user.employeeCode})
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-3">
            <PointsDisplay />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="bg-slate-800 border-blue-500/20 text-white hover:bg-slate-700"
                data-testid="button-date-picker"
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-blue-500/20" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    const today = startOfDay(new Date());
                    const maxDate = addDays(today, 4);
                    
                    if (isAfter(startOfDay(date), maxDate)) {
                      toast({
                        title: "Action Restricted",
                        description: "not applicable to early to enter",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    setSelectedDate(date);
                    loadTasksForDate(date);
                  }
                }}
                onDayClick={(date, modifiers) => {
                  if (modifiers.tooEarly) {
                    toast({
                      title: "Action Restricted",
                      description: "not applicable to early to enter",
                      variant: "destructive"
                    });
                  }
                }}
                modifiers={{
                  tooEarly: { after: addDays(startOfDay(new Date()), 4) }
                }}
                modifiersClassNames={{
                  tooEarly: "text-muted-foreground opacity-50 cursor-not-allowed"
                }}
                className="rounded-md"
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            className="bg-slate-800 border-blue-500/20 text-blue-300 hover:bg-slate-700"
            onClick={() => setShowSettingsDialog(true)}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ShiftSelector
        shiftHours={shiftHours}
        onShiftChange={setShiftHours}
        totalWorkedMinutes={totalCombinedMinutes} // Pass the COMBINED minutes here
        onFinalSubmit={handleFinalSubmit}
        canSubmit={canSubmit}
        isLocked={alreadySubmittedToday && pendingTasks.length === 0}
      />

      {/* LMS Hours Display - Debug visibility */}
      <div className="hidden" data-lms-debug={`hours:${lmsHours},code:${user?.employeeCode},date:${formattedDate}`} />

      {/* LMS Hours Display */}
      {lmsHours > 0 ? (
        <Card className="bg-blue-500/10 border-blue-500/20 p-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  LMS Approved Hours
                </h3>
                <div className="flex gap-3 mt-1">
                  {lmsHoursData?.leaveHours ? (
                    <span className="text-xs text-blue-200/70">
                      Leaves: <strong className="text-white">{lmsHoursData.leaveHours}h</strong>
                    </span>
                  ) : null}
                  {lmsHoursData?.permissionHours ? (
                    <span className="text-xs text-blue-200/70">
                      Permissions: <strong className="text-white">{lmsHoursData.permissionHours}h</strong>
                    </span>
                  ) : null}
                  <span className="text-xs text-blue-200/70">
                    Total: <strong className="text-blue-400 font-bold">{lmsHours}h</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Added to Total</p>
              <p className="text-2xl font-bold text-white">+{lmsHours}h</p>
            </div>
          </div>
        </Card>
      ) : lmsHoursData ? (
        <p className="hidden">LMS Data received but 0 hours: {JSON.stringify(lmsHoursData)}</p>
      ) : null}

      {/* Project achievement trees removed from Tracker page; view them on Achievements page */}

      {/* Pending Tasks Info */}
      {(pendingTasks.length > 0 || pendingDeadlineTasks.length > 0) && (
        <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              {pendingDeadlineTasks.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-200">
                      {pendingDeadlineTasks.length} PMS task{pendingDeadlineTasks.length > 1 ? 's' : ''} due today not added
                    </span>
                  </div>
                  <ul className="text-xs text-red-100 list-disc list-inside">
                    {pendingDeadlineTasks.slice(0, 5).map(t => (
                      <li key={t.id}>{t.task_name || t.projectName || t.id}</li>
                    ))}
                    {pendingDeadlineTasks.length > 5 && <li>...and {pendingDeadlineTasks.length - 5} more</li>}
                  </ul>
                </div>
              )}
              {pendingTasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-200">
                    {alreadySubmittedToday 
                      ? "Some tasks already submitted for today. You can still submit additional drafts." 
                      : `${pendingTasks.length} task${pendingTasks.length > 1 ? 's' : ''} pending submission`}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={handleFinalSubmit}
              disabled={submitMutation.isPending}
              className={`bg-yellow-600 hover:bg-yellow-500 ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit All
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Warning for Rejected entries that need action (Check all history, not just today) */}
      {serverEntries.some(e => e.status === 'rejected') && (
        <Card className="bg-rose-500/10 border-rose-500/20 p-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-rose-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-3 h-3" /> Needs Rectification ({serverEntries.filter(e => e.status === 'rejected').length})
                </h3>
                <p className="text-rose-200/60 text-xs mt-1">
                  You have rejected tasks that need to be fixed and re-submitted.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const firstRejected = serverEntries.find(e => e.status === 'rejected');
                if (firstRejected) checkPlanAndNavigate(`/task-entry/${firstRejected.id}`);
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold uppercase text-[10px] tracking-widest px-4 h-8 shadow-lg shadow-rose-900/20"
            >
              Fix Rejected Entries
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-white">Today's Tasks</h2>
        <Button
          onClick={() => checkPlanAndNavigate(`/task-entry?date=${formattedDate}`)}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all"
          data-testid="button-add-task"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add New Task
        </Button>
      </div>

      {/* Filters Section */}
      <div className="glass-card rounded-2xl p-6 border-none animate-in fade-in slide-in-from-top-2 duration-700">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 flex items-center gap-2">
              <Settings className="w-3 h-3" />
              Project
            </label>
            <Select value={projectFilter || 'all'} onValueChange={setProjectFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-blue-500/50 h-10 rounded-xl transition-all">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                <SelectItem value="all">All Projects</SelectItem>
                {uniqueProjects.map(project => (
                  <SelectItem key={project} value={project}>{project}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 flex items-center gap-2">
              <Zap className="w-3 h-3" />
              Task
            </label>
            <Select value={taskFilter || 'all'} onValueChange={setTaskFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-blue-500/50 h-10 rounded-xl transition-all">
                <SelectValue placeholder="All Tasks" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                <SelectItem value="all">All Tasks</SelectItem>
                {uniqueTasks.map(task => (
                  <SelectItem key={task} value={task}>{task}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 flex items-center gap-2">
              <CalendarIcon className="w-3 h-3" />
              Start Date
            </label>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-blue-500/50 h-10 rounded-xl transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-200/40 flex items-center gap-2">
              <CalendarIcon className="w-3 h-3" />
              End Date
            </label>
            <Input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-blue-500/50 h-10 rounded-xl transition-all"
            />
          </div>
        </div>
      </div>


      {isLoading || isLoadingPMSTasks ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      ) : (
        <>
          {/* Always show available PMS tasks if any exist */}
          {filteredAvailableTasksDropdown.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Zap className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Available Tasks</h2>
                    <p className="text-xs text-blue-200/50">Pick a task to start tracking your time</p>
                  </div>
                </div>
                <span className="text-xs font-mono bg-blue-500/10 text-blue-300 px-2 py-1 rounded border border-blue-500/20">
                  {filteredAvailableTasksDropdown.length} TOTAL
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {filteredAvailableTasksDropdown.map((task, index) => {
                  const isAdded = pendingTasks.some(pt => (
                    (pt.title === task.task_name || pt.title === task.task_name.trim()) && pt.project === task.projectName
                  ));

                  const formatDateLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  const todayKey = formatDateLocal(new Date());
                  const taskDeadline = task.taskDeadline ? new Date(task.taskDeadline) : null;
                  const projectDeadline = task.projectDeadline ? new Date(task.projectDeadline) : null;
                  const taskKey = taskDeadline ? formatDateLocal(taskDeadline) : null;
                  const projectKey = projectDeadline ? formatDateLocal(projectDeadline) : null;
                  const computedTaskOverdue = taskKey ? (taskKey < todayKey) : false;
                  const computedProjectOverdue = projectKey ? (projectKey < todayKey) : false;
                  const taskOverdue = typeof task.isTaskOverdue === 'boolean' ? task.isTaskOverdue : computedTaskOverdue;
                  const projectOverdue = typeof task.isProjectOverdue === 'boolean' ? task.isProjectOverdue : computedProjectOverdue;
                  const deadline = taskDeadline || projectDeadline;
                  const deadlineText = deadline ? deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

                  return (
                    <div
                      key={index}
                      className={`glass-card group hover-glow border-none p-4 rounded-xl flex items-center justify-between gap-4 transition-all duration-300 ${isAdded ? 'opacity-50 grayscale-[0.5]' : ''
                        }`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg ${taskOverdue ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {taskOverdue ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <Clock className="w-5 h-5 flex-shrink-0" />}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-200/70 rounded border border-blue-500/10 whitespace-nowrap">
                              {task.projectName}
                            </span>
                            {isAdded && (
                              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase bg-green-500/10 text-green-400 rounded border border-green-500/10">
                                <CheckCircle className="w-3 h-3" />
                                Added
                              </span>
                            )}
                            {deadline && (
                              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${taskOverdue
                                ? 'bg-red-500/10 text-red-400 border-red-500/10'
                                : 'bg-yellow-500/10 text-yellow-200/70 border-yellow-500/10'
                                }`}>
                                {taskOverdue ? 'Was Due: ' : 'Due: '} {deadlineText}
                              </span>
                            )}
                          </div>
                          <h3 className={`text-sm font-semibold truncate ${taskOverdue ? 'text-red-300' : 'text-white'}`}>
                            {task.task_name}
                          </h3>
                        </div>
                      </div>

                      <Button
                        onClick={() => !isAdded && handleQuickAddTask(task)}
                        disabled={isAdded}
                        size="sm"
                        className={`${isAdded
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : taskOverdue
                            ? 'bg-red-600/20 text-red-100 hover:bg-red-600 border border-red-500/30'
                            : 'bg-blue-600/20 text-blue-100 hover:bg-blue-600 border border-blue-500/30'
                          } h-9 px-4 rounded-lg font-bold transition-all duration-300 whitespace-nowrap`}
                      >
                        {isAdded ? 'Added' : <><Plus className="w-4 h-4 mr-2" /> Add Task</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No assigned tasks message */}
          {availableTasks.length === 0 && !isLoadingPMSTasks && !pmsError && (
            <div className="glass-card p-8 rounded-2xl border-dashed border-2 border-white/5 flex flex-col items-center justify-center text-center space-y-3">
              <Zap className="w-12 h-12 text-blue-500/20" />
              <div>
                <h3 className="text-lg font-bold text-white/50">No Assigned Tasks Found</h3>
                <p className="text-sm text-blue-200/30 max-w-xs mx-auto">
                  Only tasks assigned directly to you in the PMS are shown here. Please contact your manager if you don't see your current work.
                </p>
              </div>
            </div>
          )}

          {/* Show the user's task table when there are tasks (server or pending) */}
          {filteredAllTasksDropdown.length > 0 && (
            <TaskTable
              tasks={filteredAllTasksDropdown}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              onComplete={handleCompleteTask}
              onResubmit={handleResubmitTask}
            />
          )}

          {/* No results message */}
          {((projectFilter && projectFilter !== 'all') || (taskFilter && taskFilter !== 'all') || startDateFilter || endDateFilter) && filteredAvailableTasksDropdown.length === 0 && filteredAllTasksDropdown.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-blue-200/40 bg-white/5 rounded-2xl border border-dashed border-blue-500/10">
              <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-semibold text-white/80">No tasks found</p>
              <p className="text-sm mt-1 px-4 text-center">Make sure you have tasks assigned to you in the selected project.</p>
              <Button
                variant="ghost"
                onClick={() => {
                  setProjectFilter('all');
                  setTaskFilter('all');
                  setStartDateFilter('');
                  setEndDateFilter('');
                }}
                className="text-blue-400 hover:text-blue-300 hover:bg-transparent mt-4 p-0 h-auto font-normal"
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </>
      )}

      <div className="border-t border-blue-500/20 pt-6">
        <Button
          variant="ghost"
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="text-blue-300 hover:text-white mb-4"
          data-testid="button-toggle-analytics"
        >
          {showAnalytics ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Hide Analytics
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              Show Analytics
            </>
          )}
        </Button>

        {showAnalytics && <AnalyticsPanel {...analyticsData} />}
      </div>

      {/* Export Section */}
      <div className="border-t border-white/5 pt-8">
        <div className="glass-card rounded-2xl p-8 border-none overflow-hidden relative group hover-glow transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-700">
            <FileSpreadsheet className="w-32 h-32" />
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 shadow-inner">
                <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white leading-tight">Export Time Entries</h3>
                <p className="text-sm text-blue-200/40">
                  Generate a professional Excel report of your tracked work
                </p>
              </div>
            </div>

            <Button
              onClick={handleExportToExcel}
              className="bg-gradient-to-r from-emerald-600 to-green-500 text-white h-12 px-8 rounded-xl font-bold shadow-lg shadow-emerald-900/40 hover:shadow-emerald-900/60 hover:-translate-y-0.5 transition-all duration-300"
              disabled={serverEntries.length === 0}
              data-testid="button-export-excel"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Report
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-blue-200/30">Total</span>
              <span className="text-xs font-mono text-blue-100">{serverEntries.length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-emerald-500/30">Approved</span>
              <span className="text-xs font-mono text-emerald-100">{serverEntries.filter(e => e.status === 'approved').length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-amber-500/30">Pending</span>
              <span className="text-xs font-mono text-amber-100">{serverEntries.filter(e => e.status === 'pending').length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-rose-500/30">Rejected</span>
              <span className="text-xs font-mono text-rose-100">{serverEntries.filter(e => e.status === 'rejected').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submission Confirmation Dialog */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="bg-slate-900 border-blue-500/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Pending Tasks Require Action</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-blue-200/70">
              You have tasks due today that are not completed. Please review each task below.
              You can choosing to <strong>Extend the Timeline</strong> or <strong>Keep the Due Date</strong> (acknowledge).
              You must resolve all pending tasks before submitting.
            </p>

            <div className="space-y-4">
              {pendingDeadlineTasks.map((t) => {
                const formState = postponeForm[t.id] || { selected: false, reason: '', newDate: '', action: 'extend' };
                return (
                  <div key={t.id} className={`bg-slate-800/40 p-4 rounded border ${formState.selected ? 'border-blue-500/50' : 'border-slate-700'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!formState.selected}
                        onChange={(e) => setPostponeForm(prev => ({ ...prev, [t.id]: { ...formState, selected: e.target.checked } }))}
                      />
                      <div className="flex-1 space-y-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{t.task_name}</span>
                            <span className="text-xs text-blue-200/70">({t.projectName})</span>
                            {!t.isAssignedToEmployee && (
                              <span className="ml-2 inline-block text-xs text-amber-200 bg-amber-700/10 px-2 py-0.5 rounded">Unassigned</span>
                            )}
                          </div>
                          <div className="text-xs text-yellow-200/70">Due: {t.end_date ? new Date(t.end_date).toLocaleDateString() : 'N/A'}</div>
                        </div>

                        {formState.selected && (
                          <div className="bg-slate-900/50 p-3 rounded space-y-3">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="radio"
                                  name={`action-${t.id}`}
                                  checked={formState.action === 'extend'}
                                  onChange={() => setPostponeForm(prev => ({ ...prev, [t.id]: { ...formState, action: 'extend' } }))}
                                />
                                <span className={formState.action === 'extend' ? 'text-white' : 'text-slate-400'}>Extend Timeline</span>
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="radio"
                                  name={`action-${t.id}`}
                                  checked={formState.action === 'keep'}
                                  onChange={() => setPostponeForm(prev => ({ ...prev, [t.id]: { ...formState, action: 'keep', newDate: '', reason: '' } }))}
                                />
                                <span className={formState.action === 'keep' ? 'text-white' : 'text-slate-400'}>Keep Due Date (Acknowledge)</span>
                              </label>
                            </div>

                            {formState.action === 'extend' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div className="space-y-1">
                                  <label className="text-xs text-blue-200/70">New Due Date</label>
                                  <input
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white"
                                    value={formState.newDate}
                                    onChange={(e) => setPostponeForm(prev => ({ ...prev, [t.id]: { ...formState, newDate: e.target.value } }))}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs text-blue-200/70">Reason</label>
                                  <input
                                    type="text"
                                    placeholder="Why is it delayed?"
                                    className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-sm text-white"
                                    value={formState.reason}
                                    onChange={(e) => setPostponeForm(prev => ({ ...prev, [t.id]: { ...formState, reason: e.target.value } }))}
                                  />
                                </div>
                              </div>
                            )}

                            {formState.action === 'keep' && (
                              <div className="text-xs text-slate-400 italic">
                                Action will be logged. You can submit your timesheet but the task remains overdue.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
              <Button onClick={handlePostponeSubmit} className="bg-yellow-600 hover:bg-yellow-500">
                Confirm & Submit
              </Button>
              <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setShowPendingDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showSubmissionConfirm} onOpenChange={setShowSubmissionConfirm}>
        <DialogContent className="bg-slate-900 border-blue-500/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-full bg-green-500/20">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              Timesheet Submitted Successfully
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm text-blue-200/80 bg-blue-500/10 p-3 rounded-md">
              <Mail className="w-4 h-4 text-blue-400" />
              <span>Notification sent to managers for approval</span>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Submitted Tasks ({submittedTasks.length})
              </h4>

              <div className="bg-slate-800/50 rounded-md border border-blue-500/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800">
                    <tr className="text-left text-blue-200/60">
                      <th className="px-3 py-2">Task</th>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submittedTasks.map((task, index) => (
                      <tr key={index} className="border-t border-slate-700/50">
                        <td className="px-3 py-2 text-white">{task.title}</td>
                        <td className="px-3 py-2 text-blue-200/80">{task.project}</td>
                        <td className="px-3 py-2 text-blue-200/60">{task.startTime} - {task.endTime}</td>
                        <td className="px-3 py-2 text-cyan-400">{formatDuration(task.durationMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800">
                    <tr className="border-t border-slate-700">
                      <td colSpan={3} className="px-3 py-2 text-right text-xs text-blue-200/60">Task Total:</td>
                      <td className="px-3 py-2 text-xs text-blue-100">
                        {formatDuration(submittedTasks.reduce((acc, t) => acc + t.durationMinutes, 0))}
                      </td>
                    </tr>
                    {lmsMinutes > 0 && (
                      <tr className="border-t border-slate-700/30">
                        <td colSpan={3} className="px-3 py-2 text-right text-xs text-blue-200/60">LMS Approved:</td>
                        <td className="px-3 py-2 text-xs text-blue-100">
                          {formatDuration(lmsMinutes)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-700">
                      <td colSpan={3} className="px-3 py-2 text-right font-semibold text-white">Final Total:</td>
                      <td className="px-3 py-2 font-semibold text-cyan-400">
                        {formatDuration(submittedTasks.reduce((acc, t) => acc + t.durationMinutes, 0) + lmsMinutes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-yellow-200/80 bg-yellow-500/10 p-3 rounded-md">
              <Send className="w-4 h-4 text-yellow-400" />
              <span>Status: <strong>Pending Approval</strong> - Awaiting manager review</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={clearPendingTasksAndReload}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 w-full"
              data-testid="button-close-confirmation"
            >
              Back to Tracker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="bg-slate-900 border-blue-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Timesheet Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-800/40 p-4 rounded border border-slate-700">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-white mb-1">Unassigned Project Tasks</label>
                  <p className="text-xs text-blue-200/60">Block submission if tasks are due today but not assigned to you</p>
                </div>
                <input
                  type="checkbox"
                  checked={blockUnassignedTasks}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setBlockUnassignedTasks(newValue);
                    updateSettingsMutation.mutate(newValue);
                  }}
                  className="w-5 h-5 cursor-pointer"
                  disabled={updateSettingsMutation.isPending}
                />
              </div>
              <div className="mt-3 text-xs text-blue-200/50">
                Status: <span className={blockUnassignedTasks ? 'text-amber-400 font-semibold' : 'text-green-400 font-semibold'}>
                  {blockUnassignedTasks ? 'BLOCKING' : 'NOT BLOCKING'}
                </span>
              </div>
            </div>

            <div className="bg-slate-800/20 p-3 rounded border border-slate-700/50 text-xs text-blue-200/70">
              <p><strong>Current Policy:</strong></p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Assigned tasks due today always block submission</li>
                <li>Unassigned project tasks: <span className={blockUnassignedTasks ? 'text-amber-400' : 'text-green-400'}>{blockUnassignedTasks ? 'WILL BLOCK' : 'will NOT block'}</span></li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowSettingsDialog(false)}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showPlanAlert} onOpenChange={setShowPlanAlert}>
        <DialogContent className="bg-slate-900/90 backdrop-blur-xl border-blue-500/30 text-white max-w-md p-8 rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30 animate-pulse">
              <AlertCircle className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase">Access Restricted</h2>
              <p className="text-blue-100/70 text-sm leading-relaxed">
                You have not filled your Plan for the Day, so you cannot fill the timesheet.
              </p>
              <div className="py-2 px-4 bg-white/5 rounded-xl border border-white/10 mt-4">
                <p className="text-[11px] font-bold text-blue-300 uppercase tracking-widest leading-loose">
                  Please fill your plan of the day
                </p>
              </div>
            </div>
            <Button 
              onClick={() => setShowPlanAlert(false)}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-900/40 transition-all hover:scale-[1.02] active:scale-95"
            >
              GOT IT
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

