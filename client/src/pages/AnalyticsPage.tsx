import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar, Download, TrendingUp, Clock, Target, Activity, Loader2, CalendarDays, AlertCircle } from 'lucide-react';
import AnalyticsPanel from '@/components/AnalyticsPanel';
import { User } from '@/context/AuthContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, parseISO, startOfDay, endOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import type { TimeEntry } from '@shared/schema';

interface AnalyticsPageProps {
  user: User;
}

export default function AnalyticsPage({ user }: AnalyticsPageProps) {
  const [dateRange, setDateRange] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [showCalendar, setShowCalendar] = useState(false);

  const isAdminOrManager = user.role === 'admin' || user.role === 'manager';
  const isEmployee = user.role === 'employee';

  const { data: timeEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: isEmployee
      ? ['/api/time-entries/employee', user.id]
      : ['/api/time-entries'],
  });

  const uniqueEmployees = useMemo(() => {
    if (isEmployee) return [];

    const emps = new Map<string, string>();
    timeEntries.forEach(entry => {
      if (entry.employeeId && entry.employeeName) {
        emps.set(entry.employeeId, entry.employeeName);
      }
    });
    return Array.from(emps.entries()).map(([id, name]) => ({ id, name }));
  }, [timeEntries, isEmployee]);

  const filteredEntries = useMemo(() => {
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    const baseDate = selectedDate;

    if (dateRange !== 'all') {
      switch (dateRange) {
        case 'today':
          startDate = startOfDay(baseDate);
          endDate = endOfDay(baseDate);
          break;
        case 'week':
          startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
          endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
          break;
        case 'month':
          startDate = startOfMonth(baseDate);
          endDate = endOfMonth(baseDate);
          break;
        case 'quarter':
          startDate = startOfQuarter(baseDate);
          endDate = endOfQuarter(baseDate);
          break;
      }
    }

    return timeEntries.filter(entry => {
      try {
        // Filter by employee if selected
        if (selectedEmployeeId !== 'all' && entry.employeeId !== selectedEmployeeId) {
          return false;
        }

        // Date filter
        if (startDate && endDate) {
          const entryDate = parseISO(entry.date);
          const dayStart = startOfDay(startDate);
          const dayEnd = endOfDay(endDate);
          if (entryDate < dayStart || entryDate > dayEnd) return false;
        }

        return true;
      } catch {
        return false;
      }
    });
  }, [timeEntries, dateRange, selectedDate, selectedEmployeeId]);

  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+)h\s*(\d+)m?/);
    if (match) {
      return parseInt(match[1]) * 60 + parseInt(match[2] || '0');
    }
    return 0;
  };

  const analyticsData = useMemo(() => {
    const totalMinutes = filteredEntries.reduce((acc, entry) => acc + parseDuration(entry.totalHours), 0);

    const taskMap = new Map<string, number>();
    filteredEntries.forEach(entry => {
      const taskName = entry.projectName || 'Other';
      const minutes = parseDuration(entry.totalHours);
      taskMap.set(taskName, (taskMap.get(taskName) || 0) + minutes);
    });
    const taskHours = Array.from(taskMap.entries())
      .map(([task, minutes]) => ({ task, hours: Math.round(minutes / 60 * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);

    const hourlyMap = new Map<string, number>();
    filteredEntries.forEach(entry => {
      if (entry.startTime && entry.endTime) {
        const startHour = parseInt(entry.startTime.split(':')[0]);
        const endHour = parseInt(entry.endTime.split(':')[0]);
        const startMin = parseInt(entry.startTime.split(':')[1] || '0');
        const endMin = parseInt(entry.endTime.split(':')[1] || '0');

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

    const hours = ['7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM', '9PM'];
    const hourlyProductivity = hours.map(hour => ({
      hour,
      minutes: Math.round(hourlyMap.get(hour) || 0)
    }));

    const toolsMap = new Map<string, number>();
    filteredEntries.forEach(entry => {
      if (entry.toolsUsed && Array.isArray(entry.toolsUsed)) {
        entry.toolsUsed.forEach(tool => {
          const minutes = parseDuration(entry.totalHours);
          toolsMap.set(tool, (toolsMap.get(tool) || 0) + minutes);
        });
      }
    });
    const toolsUsage = Array.from(toolsMap.entries())
      .map(([tool, minutes]) => ({ tool, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    return {
      productiveMinutes: totalMinutes,
      idleMinutes: 0,
      neutralMinutes: 0,
      nonProductiveMinutes: 0,
      taskHours,
      toolsUsage,
      hourlyProductivity,
    };
  }, [filteredEntries]);

  const stats = useMemo(() => {
    const totalMinutes = analyticsData.productiveMinutes;
    const taskCount = filteredEntries.filter(e => e.status === 'approved').length;
    const totalEntries = filteredEntries.length;

    const uniqueDays = new Set(filteredEntries.map(e => e.date)).size;
    const uniqueEmployeesInFilter = new Set(filteredEntries.map(e => e.employeeId)).size;

    // If viewing all, calculate average per employee per day
    const employeeDivisor = selectedEmployeeId === 'all' ? (uniqueEmployeesInFilter || 1) : 1;
    const avgDailyHours = uniqueDays > 0
      ? Math.round((totalMinutes / 60 / uniqueDays / employeeDivisor) * 10) / 10
      : 0;

    const productivityScore = totalEntries > 0
      ? Math.round((filteredEntries.filter(e => e.status === 'approved').length / totalEntries) * 100)
      : 0;

    return {
      productivityScore,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      tasksCompleted: taskCount,
      avgDailyHours,
      totalEntries,
      isTeamView: selectedEmployeeId === 'all',
    };
  }, [analyticsData, filteredEntries, selectedEmployeeId]);

  const weeklyData = useMemo(() => {
    // Auto-detect the most recent week with data in filteredEntries
    // Fall back to selectedDate if no entries exist
    let weeklyBaseDate = selectedDate;
    if (filteredEntries.length > 0) {
      const sortedDates = filteredEntries
        .map(e => e.date)
        .sort((a, b) => b.localeCompare(a)); // most recent first
      weeklyBaseDate = parseISO(sortedDates[0]);
    }

    const weekStart = startOfWeek(weeklyBaseDate, { weekStartsOn: 1 });
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return {
      weekStart,
      days: days.map((day, index) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + index);
        const dateStr = format(dayDate, 'yyyy-MM-dd');

        const dayEntries = filteredEntries.filter(e => e.date === dateStr);
        const totalMinutes = dayEntries.reduce((acc, e) => acc + parseDuration(e.totalHours), 0);
        const approved = dayEntries.filter(e => e.status === 'approved').length;
        const total = dayEntries.length;
        const productivity = total > 0 ? Math.round((approved / total) * 100) : 0;

        return {
          day,
          dateStr,
          hours: Math.round(totalMinutes / 60 * 10) / 10,
          productivity,
          total,
        };
      }),
    };
  }, [filteredEntries, selectedDate]);

  const entriesByDate = useMemo(() => {
    const grouped: Record<string, TimeEntry[]> = {};
    timeEntries.forEach(entry => {
      if (!grouped[entry.date]) {
        grouped[entry.date] = [];
      }
      grouped[entry.date].push(entry);
    });
    return grouped;
  }, [timeEntries]);

  const datesWithEntries = useMemo(() => {
    return Object.keys(entriesByDate).map(dateStr => startOfDay(parseISO(dateStr)));
  }, [entriesByDate]);

  const handleExport = () => {
    const exportData = filteredEntries.map(entry => ({
      'Date': entry.date,
      'Employee': entry.employeeName,
      'Employee Code': entry.employeeCode,
      'Project': entry.projectName,
      'Task Description': entry.taskDescription,
      'Start Time': entry.startTime,
      'End Time': entry.endTime,
      'Duration': entry.totalHours,
      'Completion %': entry.percentageComplete,
      'Status': entry.status,
      'Quantify': entry.quantify || '',
      'Achievements': entry.achievements || '',
    }));

    if (exportData.length === 0) {
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 },
      { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Analytics');
    XLSX.writeFile(wb, `Analytics_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const activityLog = useMemo(() => {
    return filteredEntries
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(entry => ({
        id: entry.id,
        date: entry.date,
        employeeName: entry.employeeName,
        projectName: entry.projectName,
        totalHours: entry.totalHours,
        toolsUsed: entry.toolsUsed || [],
        achievements: entry.achievements || 'No specific achievements noted',
        quantify: entry.quantify,
        percentageComplete: entry.percentageComplete,
        problems: entry.problemAndIssues || 'None',
        improvements: entry.scopeOfImprovements || 'Continuing current path',
      }));
  }, [filteredEntries]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" data-testid="analytics-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk' }}>
            Analytics Dashboard
          </h1>
          <p className="text-blue-200/60 text-sm">
            {isEmployee ? 'Track your productivity and work patterns' : 'Team and organization-wide productivity analytics'}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          {isAdminOrManager && (
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger
                className="w-56 bg-slate-800 border-blue-500/20 text-white"
                data-testid="select-employee"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <SelectValue placeholder="All Employees" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-blue-500/20">
                <SelectItem value="all">All Employees</SelectItem>
                {uniqueEmployees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger
              className="w-40 bg-slate-800 border-blue-500/20 text-white"
              data-testid="select-date-range"
            >
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>

          <Popover open={showCalendar} onOpenChange={setShowCalendar}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-slate-800 border-blue-500/20 text-white">
                <CalendarDays className="w-4 h-4 mr-2" />
                Calendar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-800 border-blue-500/20" align="end">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setShowCalendar(false);
                  }
                }}
                modifiers={{
                  hasEntries: datesWithEntries,
                }}
                modifiersStyles={{
                  hasEntries: {
                    backgroundColor: 'rgba(59, 130, 246, 0.3)',
                    borderRadius: '4px',
                  },
                }}
              />
              <div className="p-3 border-t border-blue-500/20">
                <div className="flex items-center gap-2 text-sm text-blue-200/60">
                  <div className="w-3 h-3 rounded bg-blue-500/30" />
                  <span>Dates with entries</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            className="bg-slate-800 border-blue-500/20 text-white"
            onClick={handleExport}
            disabled={filteredEntries.length === 0}
            data-testid="button-export"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-blue-200/60">Approval Rate</p>
                <p className="text-3xl font-bold text-white" data-testid="text-productivity-score">{stats.productivityScore}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/20">
                <Clock className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-blue-200/60">Total Hours</p>
                <p className="text-3xl font-bold text-white" data-testid="text-total-hours">
                  {stats.totalHours}h
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/20">
                <Target className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-blue-200/60">Tasks Approved</p>
                <p className="text-3xl font-bold text-white" data-testid="text-tasks-completed">{stats.tasksCompleted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-500/20">
                <Activity className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-blue-200/60">{stats.isTeamView ? 'Avg. Hours/Day (Per Person)' : 'Avg. Daily Hours'}</p>
                <p className="text-3xl font-bold text-white" data-testid="text-avg-hours">{stats.avgDailyHours}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedEmployeeId !== 'all' && (
        <Card className="bg-gradient-to-r from-blue-900/20 to-slate-900/40 border-blue-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Growth & Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-slate-800/40 rounded-lg border border-blue-500/10">
                <p className="text-xs font-semibold text-blue-400 uppercase mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" /> Core Productivity
                </p>
                <p className="text-2xl font-bold text-white mb-1">
                  {Math.round(activityLog.reduce((acc, l) => acc + (l.percentageComplete || 0), 0) / (activityLog.length || 1))}%
                </p>
                <p className="text-xs text-blue-200/60">Overall task completion efficiency</p>
              </div>
              <div className="p-4 bg-slate-800/40 rounded-lg border border-amber-500/10">
                <p className="text-xs font-semibold text-amber-400 uppercase mb-3 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" /> Common Blockers
                </p>
                <p className="text-sm text-white font-medium italic">
                  {activityLog.filter(l => l.problems !== 'None').slice(0, 1)[0]?.problems || 'No recurring technical hurdles identified.'}
                </p>
              </div>
              <div className="p-4 bg-slate-800/40 rounded-lg border border-green-500/10">
                <p className="text-xs font-semibold text-green-400 uppercase mb-3 flex items-center gap-2">
                  <Target className="w-3 h-3" /> Growth Areas
                </p>
                <p className="text-sm text-white font-medium italic">
                  {activityLog.filter(l => l.improvements !== 'Continuing current path').slice(0, 1)[0]?.improvements || 'Ready for higher responsibility.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AnalyticsPanel {...analyticsData} />

      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg text-white">Weekly Summary</CardTitle>
          <span className="text-sm text-blue-200/60">
            {format(weeklyData.weekStart, 'MMM d')} – {format(endOfWeek(weeklyData.weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {weeklyData.days.map(({ day, dateStr, hours, productivity, total }) => (
              <div
                key={day}
                className={`p-4 rounded-lg border text-center transition-colors ${total > 0
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-slate-700/20 border-blue-500/10'
                  }`}
              >
                <p className="text-xs text-blue-200/60 mb-0.5">{day}</p>
                <p className="text-xs text-slate-500 mb-2">{format(parseISO(dateStr), 'MMM d')}</p>
                <p className={`text-2xl font-bold ${total > 0 ? 'text-white' : 'text-slate-600'}`}>{hours}h</p>
                <p className={`text-xs mt-1 ${productivity > 0 ? 'text-green-400' : total > 0 ? 'text-yellow-400/60' : 'text-slate-600'}`}>
                  {total > 0
                    ? productivity > 0
                      ? `${productivity}% approved`
                      : `${total} submitted`
                    : 'No data'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-blue-500/10">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Employee Activity & Achievements
            </CardTitle>
            <p className="text-xs text-blue-200/60 mt-1">Detailed log of work, tools, and results</p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-blue-200/60 text-left">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  {!isEmployee && selectedEmployeeId === 'all' && <th className="px-6 py-3 font-medium">Employee</th>}
                  <th className="px-6 py-3 font-medium">Project</th>
                  <th className="px-6 py-3 font-medium text-center">Prod. %</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Tools</th>
                  <th className="px-6 py-3 font-medium">Blockers / Need Develop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/10">
                {activityLog.length > 0 ? activityLog.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="px-6 py-4 text-white whitespace-nowrap">
                      {format(parseISO(log.date), 'MMM d, yyyy')}
                    </td>
                    {!isEmployee && selectedEmployeeId === 'all' && (
                      <td className="px-6 py-4 text-blue-200/80">{log.employeeName}</td>
                    )}
                    <td className="px-6 py-4 text-blue-200/80 font-medium">{log.projectName}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`text-[10px] font-bold ${(log.percentageComplete ?? 0) >= 80 ? 'text-green-400' : (log.percentageComplete ?? 0) >= 50 ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {log.percentageComplete ?? 0}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-cyan-400">{log.totalHours}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-[120px]">
                        {log.toolsUsed.length > 0 ? log.toolsUsed.map((tool, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[9px] border border-blue-500/10">
                            {tool}
                          </span>
                        )) : <span className="text-slate-600 text-[10px]">-</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1 max-w-sm">
                        <p className={`text-[10px] ${log.problems !== 'None' ? 'text-amber-300' : 'text-slate-500'}`}>
                          <span className="font-semibold opacity-60">ISSUE:</span> {log.problems}
                        </p>
                        <p className={`text-[10px] ${log.improvements !== 'Continuing current path' ? 'text-green-300' : 'text-slate-500'}`}>
                          <span className="font-semibold opacity-60">DEVELOP:</span> {log.improvements}
                        </p>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No activity found for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
