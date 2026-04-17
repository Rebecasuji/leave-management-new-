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
import { Check, X, Search, Filter, RefreshCw, Clock, Loader2, Wrench, Target, Trophy, TrendingUp, AlertCircle, ChevronDown, ChevronUp, FileText, Calendar as CalendarIcon, CheckCircle2, ListFilter, PauseCircle, MessageSquare, Zap, HardHat, MapPin, Package, Users, Eye } from 'lucide-react';
import { User } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TimeEntry, SiteReport } from '@shared/schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

interface ExtendedTimeEntry extends TimeEntry {
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
  const [currentTab, setCurrentTab] = useState('timesheets');
  const [siteReportDetailOpen, setSiteReportDetailOpen] = useState(false);
  const [siteReportDetail, setSiteReportDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const { data: rawTimeEntries = [], isLoading, refetch } = useQuery<ExtendedTimeEntry[]>({
    queryKey: ['/api/time-entries'],
  });

  const { data: rawSiteReports = [], isLoading: isSiteReportsLoading, refetch: refetchSiteReports } = useQuery<SiteReport[]>({
    queryKey: ['/api/site-reports'],
  });

  const siteReportsCount = useMemo(() => rawSiteReports.filter(r => r.status === 'pending').length, [rawSiteReports]);

  const { data: rawDailyPlans = [], isLoading: isPlansLoading, refetch: refetchPlans } = useQuery<any[]>({
    queryKey: ['/api/daily-plans/all'],
  });

  const pendingPlansCount = useMemo(() => 
    rawDailyPlans.filter(p => p.tasks.some((t: any) => t.isDeviation && t.status === 'pending')).length
  , [rawDailyPlans]);

  const approveSiteReportMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PATCH', `/api/site-reports/${id}/status`, { status: 'approved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-reports'] });
      toast({ title: "Site Report Approved" });
    },
  });

  const rejectSiteReportMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PATCH', `/api/site-reports/${id}/status`, { status: 'rejected' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-reports'] });
      toast({ title: "Site Report Rejected", variant: "destructive" });
    },
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

  const siteStats = useMemo(() => {
    return rawSiteReports.reduce((acc, report) => {
      acc.total++;
      if (report.status === 'pending') acc.pending++;
      else if (report.status === 'approved') acc.approved++;
      else if (report.status === 'rejected') acc.rejected++;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0 });
  }, [rawSiteReports]);

  useWebSocket({
    time_entry_created: () => queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] }),
    time_entry_updated: () => queryClient.invalidateQueries({ queryKey: ['/api/time-entries'] }),
    site_report_created: () => queryClient.invalidateQueries({ queryKey: ['/api/site-reports'] }),
    site_report_updated: () => queryClient.invalidateQueries({ queryKey: ['/api/site-reports'] }),
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

  const updatePlanTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: 'approved' | 'rejected' }) => 
      apiRequest('PATCH', `/api/daily-plans/tasks/${taskId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-plans/all'] });
      toast({ title: "Plan Task Updated" });
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

    // Sort by Date (latest first), then Employee (alphabetical), then Time (chronological)
    return filtered.sort((a, b) => {
      // 1. Date (most recent first)
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;

      // 2. Employee Name (A-Z)
      const nameCompare = a.employeeName.localeCompare(b.employeeName);
      if (nameCompare !== 0) return nameCompare;

      // 3. Start Time (chronological: 9:00 AM before 10:00 AM)
      // Note: Assumes HH:mm 24h format for string comparison stability
      return a.startTime.localeCompare(b.startTime);
    });
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
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              refetch();
              refetchSiteReports();
            }} 
            className="bg-slate-800 border-blue-500/20 text-blue-300"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading || isSiteReportsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary Card */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-slate-800/40 border-blue-500/10 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-blue-400 font-bold uppercase mb-1">Total Timesheets</span>
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
          <Card className="bg-orange-500/5 border-orange-500/20 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-orange-400 font-bold uppercase mb-1">On Hold</span>
            <span className="text-xl font-bold text-orange-400">{stats.on_hold}</span>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-cyan-500/5 border-cyan-500/20 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-cyan-400 font-bold uppercase mb-1">Total Site Reports</span>
            <span className="text-xl font-bold text-cyan-400">{siteStats.total}</span>
          </Card>
          <Card className="bg-yellow-500/5 border-yellow-500/20 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-yellow-400 font-bold uppercase mb-1">Site Pending</span>
            <span className="text-xl font-bold text-yellow-400">{siteStats.pending}</span>
          </Card>
          <Card className="bg-green-500/5 border-green-500/20 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-green-400 font-bold uppercase mb-1">Site Approved</span>
            <span className="text-xl font-bold text-green-400">{siteStats.approved}</span>
          </Card>
          <Card className="bg-red-500/5 border-red-500/20 p-3 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-red-400 font-bold uppercase mb-1">Site Rejected</span>
            <span className="text-xl font-bold text-red-400">{siteStats.rejected}</span>
          </Card>
        </div>
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

      <Tabs defaultValue="timesheets" onValueChange={setCurrentTab} className="w-full">
        <TabsList className="bg-slate-900 border border-blue-500/10 p-1 mb-4 h-11 w-full max-w-md">
          <TabsTrigger value="timesheets" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white flex-1 text-xs gap-2">
            <Clock className="w-4 h-4" />
            Timesheets ({filteredSubmissions.length})
          </TabsTrigger>
          <TabsTrigger value="siteReports" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white flex-1 text-xs gap-2">
            <HardHat className="w-4 h-4" />
            Site Reports ({rawSiteReports.filter(r => r.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="dailyPlans" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex-1 text-xs gap-2">
            <Target className="w-4 h-4" />
            Daily Plans ({pendingPlansCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timesheets">
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
                        <div className="flex flex-col gap-1 items-end">
                          <Badge className={`uppercase text-[10px] px-2 py-0.5 ${entry.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            entry.status === 'resubmitted' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse' :
                              entry.status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                entry.status === 'manager_approved' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                  entry.status === 'on_hold' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                                    'bg-red-500/20 text-red-400 border-red-500/30'
                            } border`}>
                            {entry.status ? entry.status.replace('_', ' ') : 'pending'}
                          </Badge>
                          {entry.pmsId ? (
                            <Badge variant="outline" className="text-[9px] bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                              <Target className="w-2.5 h-2.5 mr-1" /> PLANNED
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                              <Zap className="w-2.5 h-2.5 mr-1" /> MANUAL
                            </Badge>
                          )}
                        </div>
                    </div>

                    {/* LMS Hours Summary (if any) */}
                    <LMSHoursDisplay employeeCode={entry.employeeCode} date={entry.date} />

                    {/* Projects & Task Brief */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-3">
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-blue-500/10">
                        <span className="text-cyan-400 font-bold text-[9px] uppercase block mb-1">Project</span>
                        <span className="text-white font-medium">{entry.projectName}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg border border-indigo-500/10">
                        <span className="text-indigo-400 font-bold text-[9px] uppercase block mb-1">Key Step</span>
                        <span className="text-white font-medium">{entry.keyStep || "N/A"}</span>
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
        </TabsContent>

        <TabsContent value="siteReports">
          <div className="space-y-4">
            {rawSiteReports.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/20 rounded-lg border border-dashed border-cyan-500/20">
                <HardHat className="w-8 h-8 text-cyan-500/40 mx-auto mb-2" />
                <p className="text-cyan-200/40">No site reports submitted yet.</p>
              </div>
            ) : (
              rawSiteReports.map((report) => (
                <Card key={report.id} className="bg-slate-900/60 border-cyan-500/10 p-5 overflow-hidden relative group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-cyan-500/10 transition-colors" />
                  
                  <div className="flex flex-col md:flex-row justify-between gap-4 relative z-10">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex flex-col items-center justify-center border border-cyan-500/30">
                        <span className="text-cyan-400 font-bold text-xs">{format(parseISO(report.date || new Date().toISOString()), 'dd')}</span>
                        <span className="text-cyan-400/60 text-[8px] uppercase font-bold">{format(parseISO(report.date || new Date().toISOString()), 'MMM')}</span>
                      </div>
                      <div>
                        <h3 className="text-lg text-white font-bold">{report.projectName}</h3>
                        <div className="flex gap-3 mt-1 items-center">
                          <span className="text-xs text-blue-400 font-medium flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> {report.startTime} - {report.endTime} ({report.duration})
                          </span>
                          <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> {report.laborCount} Workers
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`uppercase text-[9px] px-2 py-0.5 tracking-wider font-bold ${
                        report.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        report.status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                        'bg-red-500/20 text-red-400 border-red-500/30'
                      } border`}>
                        {report.status}
                      </Badge>
                      <p className="text-[10px] text-slate-500">Submitted by: <span className="text-slate-300 font-medium">{report.employeeName}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                      <span className="text-cyan-400 text-[9px] uppercase font-bold block mb-1.5 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Work Category
                      </span>
                      <p className="text-white text-xs font-semibold">{report.workCategory}</p>
                    </div>
                    {report.locationLat && (
                      <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                        <span className="text-emerald-400 text-[9px] uppercase font-bold block mb-1.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Location
                        </span>
                        <p className="text-white text-xs font-semibold truncate">{report.locationLat.substring(0,8)}, {report.locationLng?.substring(0,8)}</p>
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 lg:col-span-2">
                       <span className="text-blue-400 text-[9px] uppercase font-bold block mb-1.5 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Description
                      </span>
                      <p className="text-slate-300 text-xs line-clamp-2">{report.workDone}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 flex flex-col md:flex-row justify-between gap-4">
                    <div className="flex gap-2">
                       <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 text-[10px] text-slate-400 hover:text-white"
                        onClick={async () => {
                          setLoadingDetail(true);
                          setSiteReportDetailOpen(true);
                          try {
                            const res = await apiRequest('GET', `/api/site-reports/${report.id}`);
                            const detail = await res.json();
                            setSiteReportDetail(detail);
                          } catch (e) {
                            toast({ title: "Failed to load report", variant: "destructive" });
                          } finally {
                            setLoadingDetail(false);
                          }
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-2" />
                        View Full Report
                      </Button>
                    </div>
                    
                    {report.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="h-8 text-xs font-bold"
                          onClick={() => rejectSiteReportMutation.mutate(report.id)}
                          disabled={rejectSiteReportMutation.isPending}
                        >
                          {rejectSiteReportMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                          Reject
                        </Button>
                        <Button 
                          size="sm" 
                          className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                          onClick={() => approveSiteReportMutation.mutate(report.id)}
                          disabled={approveSiteReportMutation.isPending}
                        >
                          {approveSiteReportMutation.isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                          Approve Report
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="dailyPlans">
          <div className="space-y-2">
            {rawDailyPlans.length === 0 ? (
              <div className="text-center py-12 bg-slate-800/20 rounded-lg border border-dashed border-amber-500/20">
                <Target className="w-8 h-8 text-amber-500/40 mx-auto mb-2" />
                <p className="text-amber-200/40">No daily plans submitted yet.</p>
              </div>
            ) : (
              rawDailyPlans.map((plan: any) => {
                const isExpanded = expandedPlanId === plan.id;
                const deviations = (plan.tasks || []).filter((t: any) => t.isDeviation && t.status === 'pending');
                const postponed = plan.postponedTasks || [];

                return (
                  <div key={plan.id} className="rounded-2xl border border-amber-500/10 bg-slate-900/60 overflow-hidden">
                    {/* Summary row – click to expand */}
                    <button
                      type="button"
                      onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-amber-600/20 flex items-center justify-center text-sm text-amber-500 font-bold border border-amber-500/20 shrink-0">
                          {(plan.employeeName || 'U').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{plan.employeeName}</p>
                          <p className="text-[10px] text-amber-400/50 uppercase font-bold tracking-wider">{plan.employeeCode} · {plan.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                            {(plan.tasks || []).filter((t: any) => !t.isDeviation).length} Tasks
                          </span>
                          {deviations.length > 0 && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold animate-pulse">
                              {deviations.length} Dev
                            </span>
                          )}
                          {postponed.length > 0 && (
                            <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full font-bold">
                              {postponed.length} Postponed
                            </span>
                          )}
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </button>

                    {/* Expanded area */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                        {/* Planned Tasks */}
                        <div>
                          <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-2">📋 Planned Tasks</p>
                          <div className="space-y-2">
                            {(plan.tasks || []).map((task: any) => (
                              <div key={task.id} className={`flex items-center justify-between p-3 rounded-xl border ${task.isDeviation ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/30 border-slate-700/40'}`}>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{task.taskName}</span>
                                    {task.isDeviation && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[8px] h-4">Deviation</Badge>}
                                  </div>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{task.projectName}</p>
                                  {task.isDeviation && task.deviationReason && (
                                    <p className="text-xs text-amber-200/60 italic mt-0.5">"{task.deviationReason}"</p>
                                  )}
                                </div>
                                {task.isDeviation && task.status === 'pending' ? (
                                  <div className="flex gap-1.5 shrink-0 ml-3">
                                    <Button size="sm" variant="destructive" className="h-7 text-[10px] px-2"
                                      onClick={() => updatePlanTaskMutation.mutate({ taskId: task.id, status: 'rejected' })}>
                                      Reject
                                    </Button>
                                    <Button size="sm" className="h-7 text-[10px] px-2 bg-green-600 hover:bg-green-500"
                                      onClick={() => updatePlanTaskMutation.mutate({ taskId: task.id, status: 'approved' })}>
                                      Approve
                                    </Button>
                                  </div>
                                ) : (
                                  <Badge className={`uppercase text-[8px] shrink-0 ml-3 ${task.status === 'approved' ? 'bg-green-500/20 text-green-400' : task.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {task.status}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Postponed Tasks */}
                        {postponed.length > 0 && (
                          <div>
                            <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-2">⏭️ Postponed Tasks</p>
                            <div className="space-y-2">
                              {postponed.map((pt: any, i: number) => (
                                <div key={i} className="flex items-start justify-between p-3 rounded-xl border bg-orange-500/5 border-orange-500/20">
                                  <div>
                                    <span className="text-sm font-bold text-white">{pt.task_name}</span>
                                    <p className="text-xs text-orange-200/60 italic mt-0.5">"{pt.reason}"</p>
                                  </div>
                                  <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full font-bold shrink-0 ml-3">
                                    Due: {pt.new_due_date}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Site Report Full Detail Dialog */}
      <Dialog open={siteReportDetailOpen} onOpenChange={(open) => { setSiteReportDetailOpen(open); if (!open) setSiteReportDetail(null); }}>
        <DialogContent className="bg-slate-900 border-white/10 sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              Site Report Details
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Full details of the submitted site report
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            </div>
          ) : siteReportDetail ? (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <span className="text-[9px] uppercase font-bold text-cyan-400 block mb-1">Project</span>
                  <p className="text-white text-sm font-semibold">{siteReportDetail.projectName}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <span className="text-[9px] uppercase font-bold text-blue-400 block mb-1">Date</span>
                  <p className="text-white text-sm font-semibold">{siteReportDetail.date}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <span className="text-[9px] uppercase font-bold text-emerald-400 block mb-1">Category</span>
                  <p className="text-white text-sm font-semibold">{siteReportDetail.workCategory}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <span className="text-[9px] uppercase font-bold text-violet-400 block mb-1">Submitted By</span>
                  <p className="text-white text-sm font-semibold">{siteReportDetail.employeeName}</p>
                </div>
              </div>

              {/* Working Hours */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <span className="text-[9px] uppercase font-bold text-blue-400 block mb-1"><Clock className="w-3 h-3 inline mr-1" />Start Time</span>
                  <p className="text-white text-sm font-bold">{siteReportDetail.startTime || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <span className="text-[9px] uppercase font-bold text-indigo-400 block mb-1"><Clock className="w-3 h-3 inline mr-1" />End Time</span>
                  <p className="text-white text-sm font-bold">{siteReportDetail.endTime || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <span className="text-[9px] uppercase font-bold text-cyan-400 block mb-1"><Clock className="w-3 h-3 inline mr-1" />Duration</span>
                  <p className="text-white text-sm font-bold">{siteReportDetail.duration || 'N/A'}</p>
                </div>
              </div>

              {/* Work Done */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" /> Work Done / Notes
                </h4>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{siteReportDetail.workDone || 'No notes provided.'}</p>
              </div>

              {/* Sqft & Materials side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {siteReportDetail.sqftCovered && (
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <h4 className="text-sm font-bold text-orange-400 mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Work Output (Sqft)
                    </h4>
                    <p className="text-white text-sm">{siteReportDetail.sqftCovered}</p>
                  </div>
                )}
                {siteReportDetail.materialsUsed && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" /> Materials Used
                    </h4>
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">{siteReportDetail.materialsUsed}</p>
                  </div>
                )}
              </div>

              {/* Issues */}
              {siteReportDetail.issuesFaced && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <h4 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Issues Faced
                  </h4>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{siteReportDetail.issuesFaced}</p>
                </div>
              )}

              {/* Labour Log */}
              {siteReportDetail.laborData && JSON.parse(typeof siteReportDetail.laborData === 'string' ? siteReportDetail.laborData : JSON.stringify(siteReportDetail.laborData)).length > 0 && (
                <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <h4 className="text-sm font-bold text-violet-400 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Labour Attendance Log
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[10px] px-2">
                      {(JSON.parse(typeof siteReportDetail.laborData === 'string' ? siteReportDetail.laborData : JSON.stringify(siteReportDetail.laborData))).length} workers
                    </Badge>
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-3 py-1 text-[9px] uppercase text-slate-500 font-bold">
                      <span className="w-6">#</span>
                      <span className="flex-[3]">Name</span>
                      <span className="flex-1 text-center">In</span>
                      <span className="flex-1 text-center">Out</span>
                    </div>
                    {(JSON.parse(typeof siteReportDetail.laborData === 'string' ? siteReportDetail.laborData : JSON.stringify(siteReportDetail.laborData))).map((l: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-white/5">
                        <span className="w-6 text-[10px] text-slate-500 font-mono">{i + 1}</span>
                        <span className="flex-[3] text-sm text-white">{l.name || 'Anonymous'}</span>
                        <span className="flex-1 text-center text-xs text-slate-300 font-mono">{l.inTime || '--:--'}</span>
                        <span className="flex-1 text-center text-xs text-slate-300 font-mono">{l.outTime || '--:--'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GPS Location */}
              {siteReportDetail.locationLat && siteReportDetail.locationLng && (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
                  <h4 className="text-sm font-bold text-orange-400 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> GPS Location
                    <span className="text-xs text-slate-400 font-normal">{siteReportDetail.locationLat}, {siteReportDetail.locationLng}</span>
                  </h4>
                  <div className="w-full h-[200px] rounded-xl overflow-hidden border border-white/10">
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(siteReportDetail.locationLng)-0.005}%2C${parseFloat(siteReportDetail.locationLat)-0.005}%2C${parseFloat(siteReportDetail.locationLng)+0.005}%2C${parseFloat(siteReportDetail.locationLat)+0.005}&layer=mapnik&marker=${siteReportDetail.locationLat}%2C${siteReportDetail.locationLng}`}
                      style={{ filter: 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' }}
                    />
                  </div>
                </div>
              )}

              {/* Attachments / Photos */}
              {siteReportDetail.attachments && siteReportDetail.attachments.length > 0 && (
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <h4 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Site Evidence Photos
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px] px-2">
                      {siteReportDetail.attachments.length}
                    </Badge>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {siteReportDetail.attachments.map((att: any, i: number) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-slate-800/40">
                        {(att.fileType?.startsWith('image/') || att.fileUrl?.startsWith('data:image/')) ? (
                          <img src={att.fileUrl} alt={att.fileName} className="w-full h-48 object-cover" />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center bg-slate-800">
                            <FileText className="w-10 h-10 text-slate-500" />
                          </div>
                        )}
                        <div className="p-2">
                          <p className="text-xs text-slate-300 truncate">{att.fileName}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{att.fileType?.split('/')[1] || 'file'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-white/5">
                <span className="text-xs text-slate-400">Report Status</span>
                <Badge className={`uppercase text-[10px] px-3 py-1 font-bold ${
                  siteReportDetail.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  siteReportDetail.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  'bg-red-500/20 text-red-400 border-red-500/30'
                } border`}>
                  {siteReportDetail.status}
                </Badge>
              </div>
            </div>
          ) : null}
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