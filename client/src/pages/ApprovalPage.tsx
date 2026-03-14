import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Check, X, Search, Filter, RefreshCw, Clock, Loader2, Wrench, Target, Trophy, TrendingUp, AlertCircle, ChevronDown, ChevronUp, FileText, Calendar as CalendarIcon, CheckCircle2, ListFilter, PauseCircle, MessageSquare, Zap } from 'lucide-react';
import { User } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TimeEntry } from '@shared/schema';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

interface ExtendedTimeEntry extends TimeEntry {
  problemAndIssues: string | null;
  scopeOfImprovements: string | null;
  toolsUsed: string[] | null;
  projectName: string;
  taskDescription: string;
  startTime: string;
  endTime: string;
  achievements: string | null;
  quantify: string;
  onHoldReason: string | null;
  lmsData?: {
    leaveHours: number;
    permissionHours: number;
    totalLMSHours: number;
  };
}

const parseTaskDescription = (taskDesc: string, entry?: ExtendedTimeEntry) => {
  const parts = taskDesc.split(' | ');
  let task = '';
  let subTask = '';
  let description = '';

  if (parts.length >= 3) {
    task = parts[0];
    subTask = parts[1];
    description = parts.slice(2).join(' | ');
  } else if (parts.length === 2) {
    task = parts[0];
    subTask = parts[1];
    description = '';
  } else if (parts.length === 1) {
    task = parts[0];
    subTask = '';
    description = '';
  } else {
    const colonParts = taskDesc.split(':');
    if (colonParts.length >= 2) {
      task = colonParts[0];
      subTask = '';
      description = colonParts.slice(1).join(':').trim();
    } else {
      task = taskDesc;
      subTask = '';
      description = '';
    }
  }

  return {
    task: task.trim(),
    subTask: subTask.trim(),
    description: description.trim(),
    achievements: entry?.achievements,
    quantify: entry?.quantify || "",
    problemAndIssues: entry?.problemAndIssues,
    scopeOfImprovements: entry?.scopeOfImprovements,
    toolsUsed: entry?.toolsUsed
  };
};

const TaskDetailRow = ({ label, value, icon: Icon, colorClass }: { label: string; value: string | null | undefined; icon: any; colorClass: string }) => (
  <div className={`p-3 rounded-lg border ${colorClass} bg-opacity-5`}>
    <span className={`font-bold uppercase text-[9px] block mb-2 flex items-center gap-1 ${colorClass.split(' ')[0].replace('border-', 'text-')}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
    <p className="text-blue-100/70 text-xs leading-relaxed whitespace-pre-wrap">{value || `No ${label.toLowerCase()} provided.`}</p>
  </div>
);

export default function ApprovalPage({ user }: { user: User }) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ExtendedTimeEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [onHoldReason, setOnHoldReason] = useState('');
  const [onHoldDialogOpen, setOnHoldDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const { data: rawTimeEntries = [], isLoading, refetch } = useQuery<ExtendedTimeEntry[]>({
    queryKey: ['/api/time-entries'],
  });

  const uniqueTimeEntries = useMemo(() => {
    const seen = new Set<string>();
    return rawTimeEntries.filter(e => {
      const key = e.id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawTimeEntries]);

  // Status Summary Counts
  const stats = useMemo(() => {
    return uniqueTimeEntries.reduce((acc, entry) => {
      acc.total++;
      if (entry.status === 'pending' || entry.status === 'resubmitted') acc.pending++;
      else if (entry.status === 'manager_approved') acc.manager_approved++;
      else if (entry.status === 'approved') acc.approved++;
      else if (entry.status === 'rejected') acc.rejected++;
      else if (entry.status === 'on_hold') acc.on_hold++;
      return acc;
    }, { total: 0, pending: 0, manager_approved: 0, approved: 0, rejected: 0, on_hold: 0 });
  }, [uniqueTimeEntries]);

  useWebSocket({
    time_entry_created: () => queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] }),
    time_entry_updated: () => queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PATCH', `/api/time-entries/${id}/approve`, { approvedBy: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: "Approved" });
    },
  });

  const managerApproveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PATCH', `/api/time-entries/${id}/manager-approve`, { approvedBy: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: "Manager Approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiRequest('PATCH', `/api/time-entries/${id}/reject`, { approvedBy: user.id, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: "Rejected", variant: "destructive" });
    },
  });

  const onHoldMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiRequest('PATCH', `/api/time-entries/${id}/on-hold`, { managerId: user.id, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: "Put On Hold", variant: "default" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id =>
        user.role === 'admin'
          ? apiRequest('PATCH', `/api/time-entries/${id}/approve`, { approvedBy: user.id })
          : apiRequest('PATCH', `/api/time-entries/${id}/manager-approve`, { approvedBy: user.id })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: `Approved ${selectedIds.size} entries` });
      setSelectedIds(new Set());
      setSelectAll(false);
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      await Promise.all(ids.map(id =>
        apiRequest('PATCH', `/api/time-entries/${id}/reject`, { approvedBy: user.id, reason })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] });
      toast({ title: `Rejected ${selectedIds.size} entries`, variant: "destructive" });
      setSelectedIds(new Set());
      setSelectAll(false);
      setBulkRejectDialogOpen(false);
      setRejectionReason('');
    },
  });

  const filteredSubmissions = useMemo(() => {
    const filtered = uniqueTimeEntries.filter(s => {
      const matchesSearch = s.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesDate = !selectedDate || s.date === format(selectedDate, 'yyyy-MM-dd');
      return matchesSearch && matchesStatus && matchesDate;
    });

    const toMinutes = (t?: string) => {
      if (!t) return 0;
      const parts = t.split(':').map(p => parseInt(p, 10) || 0);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    // Group entries by employee, sort each employee's entries chronologically,
    // then order employees by their most recent submission (descending)
    const groups: Record<string, ExtendedTimeEntry[]> = {};
    for (const e of filtered) {
      const key = e.employeeId.toString();
      groups[key] = groups[key] || [];
      groups[key].push(e);
    }

    const groupedArray = Object.entries(groups).map(([employeeId, entries]) => {
      // sort individual's entries by date then startTime
      entries.sort((a, b) => {
        const dateA = a.date ? startOfDay(parseISO(a.date.toString())).getTime() : 0;
        const dateB = b.date ? startOfDay(parseISO(b.date.toString())).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return toMinutes(a.startTime) - toMinutes(b.startTime);
      });

      // find most recent submittedAt for this person
      const latest = entries.reduce((max, it) => {
        const t = it.submittedAt ? parseISO(it.submittedAt.toString()).getTime() : 0;
        return Math.max(max, t);
      }, 0);

      return { employeeId, entries, latest };
    });

    // sort groups by latest submission desc so recent submitters appear first
    groupedArray.sort((a, b) => b.latest - a.latest);

    // flatten back to list preserving per-person chronological order
    return groupedArray.flatMap(g => g.entries);
  }, [uniqueTimeEntries, searchQuery, statusFilter, selectedDate]);

  const confirmReject = () => {
    if (selectedEntry && rejectionReason.trim()) {
      rejectMutation.mutate({ id: selectedEntry.id.toString(), reason: rejectionReason });
      setRejectDialogOpen(false);
      setRejectionReason('');
    }
  };

  const confirmOnHold = () => {
    if (selectedEntry && onHoldReason.trim()) {
      onHoldMutation.mutate({ id: selectedEntry.id.toString(), reason: onHoldReason });
      setOnHoldDialogOpen(false);
      setOnHoldReason('');
    }
  };

  const confirmBulkReject = () => {
    if (rejectionReason.trim() && selectedIds.size > 0) {
      bulkRejectMutation.mutate({ ids: Array.from(selectedIds), reason: rejectionReason });
    }
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      const applicableIds = new Set(
        filteredSubmissions
          .filter(e => e.status !== 'approved' && e.status !== 'rejected')
          .map(e => e.id.toString())
      );
      setSelectedIds(applicableIds);
      setSelectAll(true);
    }
  };

  const toggleSelectEntry = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
      setSelectAll(false);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="text-blue-200/60 text-sm">Review and manage timesheet submissions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="bg-slate-800 border-blue-500/20 text-blue-300">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary Card */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-slate-800/40 border-blue-500/10 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-blue-400 font-bold uppercase mb-1">Total</span>
          <span className="text-xl font-bold text-white">{stats.total}</span>
        </Card>
        <Card className="bg-yellow-500/5 border-yellow-500/20 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-yellow-400 font-bold uppercase mb-1">Pending</span>
          <span className="text-xl font-bold text-yellow-400">{stats.pending}</span>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-blue-400 font-bold uppercase mb-1">Mgr Appr</span>
          <span className="text-xl font-bold text-blue-400">{stats.manager_approved}</span>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-green-400 font-bold uppercase mb-1">Approved</span>
          <span className="text-xl font-bold text-green-400">{stats.approved}</span>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-red-400 font-bold uppercase mb-1">Rejected</span>
          <span className="text-xl font-bold text-red-400">{stats.rejected}</span>
        </Card>
        <Card className="bg-orange-500/5 border-orange-500/20 p-3 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] text-orange-400 font-bold uppercase mb-1">On Hold</span>
          <span className="text-xl font-bold text-orange-400">{stats.on_hold}</span>
        </Card>
      </div>

      {/* Filter Section */}
      <Card className="bg-slate-800/60 border-blue-500/20 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/60" />
            <Input
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-900/50 border-blue-500/20 text-white h-9"
            />
          </div>

          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-slate-900/50 border-blue-500/20 text-white h-9">
                <ListFilter className="w-4 h-4 mr-2 text-blue-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-blue-500/20">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resubmitted">Resubmitted</SelectItem>
                <SelectItem value="manager_approved">Manager Approved</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-slate-900/50 border-blue-500/20 text-white h-9">
                  <CalendarIcon className="mr-2 h-4 w-4 text-blue-400" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-900 border-blue-500/20">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectAll}
              onCheckedChange={toggleSelectAll}
              className="border-blue-500/30"
            />
            <span className="text-xs text-blue-400">Select All</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setSelectedDate(undefined);
              setSelectedIds(new Set());
              setSelectAll(false);
            }}
            className="text-blue-400 hover:text-white h-9"
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="bg-blue-500/10 border-blue-500/30 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <span className="text-sm text-blue-200">{selectedIds.size} entries selected</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-500"
              onClick={() => setBulkRejectDialogOpen(true)}
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Reject Selected
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-500"
              onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkApproveMutation.isPending}
            >
              {bulkApproveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Approve Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedIds(new Set());
                setSelectAll(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {filteredSubmissions.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/20 rounded-lg border border-dashed border-blue-500/20">
            <AlertCircle className="w-8 h-8 text-blue-500/40 mx-auto mb-2" />
            <p className="text-blue-200/40">No matching submissions found.</p>
          </div>
        ) : (
          filteredSubmissions.map((entry) => {
            const parsed = parseTaskDescription(entry.taskDescription, entry);
            const isExpanded = expandedId === entry.id.toString();

            return (
              <Card key={entry.id} className={`bg-slate-800/40 border-blue-500/10 p-4 transition-all hover:bg-slate-800/60 ${selectedIds.has(entry.id.toString()) ? 'border-blue-500/50 bg-blue-500/5' : ''}`}>
                {/* Header: Checkbox, Name, Status and TIME + COMPLETION */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-3">
                    {((entry.status || '').toString().toLowerCase() !== 'approved') && ((entry.status || '').toString().toLowerCase() !== 'rejected') && (
                      <Checkbox
                        checked={selectedIds.has(entry.id.toString())}
                        onCheckedChange={() => toggleSelectEntry(entry.id.toString())}
                        className="mt-2 border-blue-500/30"
                      />
                    )}
                    <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-sm text-blue-400 font-bold border border-blue-500/20">
                      {entry.employeeName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base text-white font-semibold leading-none">{entry.employeeName}</h3>
                      <p className="text-[10px] text-blue-400/60 mt-1 uppercase font-bold">{entry.employeeCode}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="flex items-center text-xs text-green-400 font-bold bg-green-500/15 px-2 py-1 rounded-md border border-green-500/20">
                          <CalendarIcon className="w-3 h-3 mr-1.5" /> {format(parseISO(entry.date?.toString() || new Date().toISOString()), 'MMM dd, yyyy')}
                        </span>
                        <span className="flex items-center text-xs text-blue-400 font-bold bg-blue-500/15 px-2 py-1 rounded-md border border-blue-500/20">
                          <Clock className="w-3 h-3 mr-1.5" /> {entry.startTime} - {entry.endTime}
                        </span>
                        <span className="flex items-center text-xs text-purple-400 font-bold bg-purple-500/15 px-2 py-1 rounded-md border border-purple-500/20">
                          <Target className="w-3 h-3 mr-1.5" /> {entry.percentageComplete}% Complete
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge className={`uppercase text-[10px] px-2 py-0.5 ${entry.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                    entry.status === 'resubmitted' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse' :
                      entry.status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                        entry.status === 'manager_approved' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          entry.status === 'on_hold' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                            'bg-red-500/20 text-red-400 border-red-500/30'
                    } border`}>
                    {entry.status ? entry.status.replace('_', ' ') : 'pending'}
                  </Badge>
                </div>

                {/* LMS Hours Summary (if any) */}
                <LMSHoursDisplay employeeCode={entry.employeeCode} date={entry.date} />

                {/* Projects & Task Brief */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-3">
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-blue-500/10">
                    <span className="text-cyan-400 font-bold text-[9px] uppercase block mb-1">Project</span>
                    <span className="text-white font-medium">{entry.projectName}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-purple-500/10">
                    <span className="text-purple-400 font-bold text-[9px] uppercase block mb-1">Task</span>
                    <span className="text-white font-medium">{parsed.task}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded-lg border border-pink-500/10">
                    <span className="text-pink-400 font-bold text-[9px] uppercase block mb-1">Subtask</span>
                    <span className="text-white font-medium">{entry.taskDescription.split(' | ')[1] || "N/A"}</span>
                  </div>
                </div>

                {/* Expanded Section: Achievements, Problems, and Tools */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-blue-500/10 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TaskDetailRow label="Quantify Result" value={entry.quantify} icon={Target} colorClass="border-orange-500/10 bg-orange-500/5" />
                      <TaskDetailRow label="Achievements" value={entry.achievements} icon={Trophy} colorClass="border-green-500/10 bg-green-500/5" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <TaskDetailRow label="Problems & Issues" value={entry.problemAndIssues} icon={AlertCircle} colorClass="border-red-500/10 bg-red-500/5" />
                      <TaskDetailRow label="Scope of Improvements" value={entry.scopeOfImprovements} icon={TrendingUp} colorClass="border-yellow-500/10 bg-yellow-500/5" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-cyan-500/5 p-3 rounded-lg border border-cyan-500/10">
                        <span className="text-cyan-400 font-bold uppercase text-[9px] block mb-2 flex items-center gap-1">
                          <Wrench className="w-3 h-3" /> Tools Used
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {entry.toolsUsed && entry.toolsUsed.length > 0 ? (
                            entry.toolsUsed.map(t => (
                              <Badge key={t} variant="outline" className="text-[10px] bg-blue-500/10 border-blue-500/30 text-blue-300 px-2.5 py-0.5">
                                {t}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-blue-200/20 text-[10px] italic">No tools recorded</span>
                          )}
                        </div>
                      </div>
                      <TaskDetailRow label="Description" value={entry.taskDescription.split(' | ')[2] || parsed.description} icon={FileText} colorClass="border-blue-500/10 bg-blue-500/5" />
                    </div>

                    {entry.status === 'on_hold' && entry.onHoldReason && (
                      <div className="bg-orange-500/5 p-3 rounded-lg border border-orange-500/20 flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5" />
                        <div>
                          <span className="text-orange-400 font-bold uppercase text-[9px] block mb-1">On Hold Reason</span>
                          <p className="text-blue-100/70 text-xs leading-relaxed">{entry.onHoldReason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-blue-500/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id.toString())}
                    className="h-8 text-xs text-blue-400 hover:bg-blue-500/5"
                  >
                    {isExpanded ? (
                      <><ChevronUp className="w-3.5 h-3.5 mr-1.5" /> Hide Details</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5 mr-1.5" /> View Details</>
                    )}
                  </Button>

                  {entry.status !== 'approved' && entry.status !== 'rejected' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs px-4 bg-orange-600/20 text-orange-400 border border-orange-500/20 hover:bg-orange-600/30"
                        onClick={() => { setSelectedEntry(entry); setOnHoldDialogOpen(true); }}
                      >
                        <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                        On Hold
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs px-4"
                        onClick={() => { setSelectedEntry(entry); setRejectDialogOpen(true); }}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs px-4 bg-blue-600 hover:bg-blue-500"
                        onClick={() => user.role === 'admin' ? approveMutation.mutate(entry.id.toString()) : managerApproveMutation.mutate(entry.id.toString())}
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Approve
                      </Button>
                    </div>
                  )}
                  {entry.status === 'on_hold' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs px-4 bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                      onClick={() => {
                        window.location.href = `/discussion?entryId=${entry.id}`;
                      }}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                      Discuss
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-slate-900 border-blue-500/20 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Reject Submission</DialogTitle>
            <DialogDescription className="text-blue-200/60 text-sm">
              Please provide a reason for rejecting this timesheet entry.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-slate-800 border-blue-500/20 text-white min-h-[120px] focus:ring-blue-500/50"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => { setRejectDialogOpen(false); setRejectionReason(''); }}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmReject} disabled={!rejectionReason.trim() || rejectMutation.isPending}>
              {rejectMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkRejectDialogOpen} onOpenChange={setBulkRejectDialogOpen}>
        <DialogContent className="bg-slate-900 border-blue-500/20 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Reject Selected Entries</DialogTitle>
            <DialogDescription className="text-blue-200/60 text-sm">
              Provide a reason for rejecting {selectedIds.size} selected timesheet entries.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-slate-800 border-blue-500/20 text-white min-h-[120px] focus:ring-blue-500/50"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => { setBulkRejectDialogOpen(false); setRejectionReason(''); }}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmBulkReject} disabled={!rejectionReason.trim() || bulkRejectMutation.isPending}>
              {bulkRejectMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
              Confirm Bulk Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={onHoldDialogOpen} onOpenChange={setOnHoldDialogOpen}>
        <DialogContent className="bg-slate-900 border-blue-500/20 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Put Task On Hold</DialogTitle>
            <DialogDescription className="text-blue-200/60 text-sm">
              Please provide a reason why this task is being put on hold.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for holding..."
            value={onHoldReason}
            onChange={(e) => setOnHoldReason(e.target.value)}
            className="bg-slate-800 border-blue-500/20 text-white min-h-[120px] focus:ring-blue-500/50"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => { setOnHoldDialogOpen(false); setOnHoldReason(''); }}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={confirmOnHold} disabled={!onHoldReason.trim() || onHoldMutation.isPending} className="bg-orange-600 hover:bg-orange-500">
              {onHoldMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
              Confirm On Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component to fetch and display LMS hours for a specific employee and date
function LMSHoursDisplay({ employeeCode, date }: { employeeCode: string; date: string }) {
  const { data: lmsHours } = useQuery<{ leaveHours: number; permissionHours: number; totalLMSHours: number }>({
    queryKey: ['/api/lms/hours', employeeCode, date],
    queryFn: async () => {
      const response = await fetch(`/api/lms/hours?employeeCode=${employeeCode}&date=${date}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!employeeCode && !!date,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  if (!lmsHours || lmsHours.totalLMSHours === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 shadow-inner">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
        <Clock className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-blue-300/60">LMS Data</span>
      </div>
      
      {lmsHours.leaveHours > 0 && (
        <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none shadow-md shadow-blue-900/40 text-[10px] py-1 px-3 font-bold">
          <CalendarIcon className="w-3 h-3 mr-1.5" />
          Leave: {lmsHours.leaveHours}h
        </Badge>
      )}
      
      {lmsHours.permissionHours > 0 && (
        <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-none shadow-md shadow-purple-900/40 text-[10px] py-1 px-3 font-bold">
          <Zap className="w-3 h-3 mr-1.5" />
          Permission: {lmsHours.permissionHours}h
        </Badge>
      )}
      
      <div className="ml-auto flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Total</span>
        <span className="text-sm font-black text-white">{lmsHours.totalLMSHours}h</span>
      </div>
    </div>
  );
}