import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insertSiteReportSchema, type InsertSiteReport } from '@shared/schema';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { offlineDb, type OfflineSiteReport } from '@/lib/offlineDb';
import { 
  MapPin, 
  Calendar, 
  Clock, 
  Briefcase, 
  FileText, 
  AlertTriangle, 
  Package, 
  Users, 
  Upload, 
  Save, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileIcon,
  ImageIcon,
  Paperclip
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const WORK_CATEGORIES = [
  "Excavation",
  "Concrete",
  "Inspection",
  "BOQ",
  "Electrical",
  "Plumbing",
  "Finishing",
  "Others"
];

export default function SiteEngineerTimesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [location, setLocation] = useState<{ lat: string; lng: string } | null>(null);
  const [files, setFiles] = useState<{ name: string; type: string; base64Data: string }[]>([]);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<InsertSiteReport>({
    resolver: zodResolver(insertSiteReportSchema),
    defaultValues: {
      employeeId: user?.id || '',
      employeeName: user?.name || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      laborCount: 0,
      workCategory: 'Excavation',
    }
  });

  const startTime = watch('startTime');
  const endTime = watch('endTime');

  // Calculate duration
  useEffect(() => {
    if (startTime && endTime) {
      try {
        const start = new Date(`2000-01-01T${startTime}`);
        const end = new Date(`2000-01-01T${endTime}`);
        if (end > start) {
          const diffMs = end.getTime() - start.getTime();
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          setValue('duration', `${diffHrs}h ${diffMins}m`);
        }
      } catch (e) {
        console.error("Duration calc error", e);
      }
    }
  }, [startTime, endTime, setValue]);

  // Capture GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude.toString(), lng: pos.coords.longitude.toString() };
          setLocation(loc);
          setValue('locationLat', loc.lat);
          setValue('locationLng', loc.lng);
        },
        (err) => console.warn("Geolocation error", err),
        { enableHighAccuracy: true }
      );
    }
  }, [setValue]);

  // Online/Offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkPending = async () => {
      const reports = await offlineDb.getAllReports();
      setPendingCount(reports.filter(r => r.status === 'pending').length);
    };
    checkPending();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync Logic
  const syncReports = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);

    try {
      const reports = await offlineDb.getAllReports();
      const toSync = reports.filter(r => r.status === 'pending');

      for (const report of toSync) {
        try {
          // 1. Create the report
          const savedReport = await apiRequest('POST', '/api/site-reports', report.data);
          const reportJson = await savedReport.json();

          // 2. Upload attachments
          for (const file of report.attachments) {
            await apiRequest('POST', '/api/site-reports/upload', {
              reportId: reportJson.id,
              fileName: file.name,
              fileType: file.type,
              base64Data: file.base64Data
            });
          }

          // 3. Mark as synced or delete
          await offlineDb.deleteReport(report.localId);
        } catch (e: any) {
          console.error("Failed to sync report", report.localId, e);
          await offlineDb.updateReportStatus(report.localId, 'error');
          toast({
            title: "Sync Failed",
            description: `Report for ${report.data.projectName} failed to sync: ${e.message}`,
            variant: "destructive",
          });
        }
      }

      const updatedReports = await offlineDb.getAllReports();
      setPendingCount(updatedReports.filter(r => r.status === 'pending').length);
      
      if (toSync.length > 0) {
        toast({
          title: "Sync Complete",
          description: `Successfully synced ${toSync.length} reports.`,
          variant: "default",
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, toast]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncReports();
    }
  }, [isOnline, pendingCount, syncReports]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          base64Data: base64String
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const onSubmit = async (data: InsertSiteReport) => {
    const localId = crypto.randomUUID();
    const offlineReport: OfflineSiteReport = {
      localId,
      data,
      attachments: files,
      status: 'pending',
      timestamp: Date.now()
    };

    try {
      await offlineDb.saveReport(offlineReport);
      setPendingCount(prev => prev + 1);

      toast({
        title: isOnline ? "Report Submitted" : "Saved Locally",
        description: isOnline ? "Sending to server..." : "No internet. Report saved for later sync.",
        variant: "default",
      });

      reset();
      setFiles([]);
      
      if (isOnline) {
        syncReports();
      }
    } catch (e) {
      toast({
        title: "Error Saving",
        description: "Failed to save the report.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 backdrop-blur-xl p-6 rounded-3xl border border-white/5 shadow-2xl">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Site Engineer Timesheet</h1>
            <p className="text-slate-400 mt-1">Fill your daily progress and site activities</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant={isOnline ? "default" : "destructive"} className="px-3 py-1 gap-2 text-xs font-semibold uppercase tracking-wider">
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? 'Online' : 'Offline Mode'}
            </Badge>
            
            {pendingCount > 0 && (
              <Badge variant="outline" className="px-3 py-1 gap-2 text-xs font-semibold border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                {pendingCount} Pending Sync
              </Badge>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <Card className="bg-slate-900/50 backdrop-blur-xl border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-500/20 rounded-xl">
                  <Briefcase className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-white">Project Details</CardTitle>
                  <CardDescription className="text-slate-400 text-xs text-secondary-foreground">Basic information about the site and date</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="projectName" className="text-slate-300">Project / Site Name</Label>
                <Input 
                  id="projectName"
                  {...register('projectName')}
                  placeholder="Enter project name"
                  className="bg-slate-800/50 border-white/10 text-white focus:ring-cyan-500/50"
                />
                {errors.projectName && <p className="text-red-400 text-xs">{errors.projectName.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date" className="text-slate-300">Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    id="date"
                    type="date"
                    {...register('date')}
                    readOnly
                    className="bg-slate-800/30 border-white/5 text-slate-400 pl-10 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workCategory" className="text-slate-300">Work Category</Label>
                <Select onValueChange={(val) => setValue('workCategory', val)} defaultValue="Excavation">
                  <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    {WORK_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat} className="text-slate-300 focus:bg-cyan-500/20 focus:text-cyan-400">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="laborCount" className="text-slate-300">Labor Count</Label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    id="laborCount"
                    type="number"
                    {...register('laborCount', { valueAsNumber: true })}
                    className="bg-slate-800/50 border-white/10 text-white pl-10"
                    placeholder="Total workers"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 backdrop-blur-xl border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-white">Time Tracking</CardTitle>
                  <CardDescription className="text-slate-400 text-xs">Work duration and automatic calculation</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="startTime" className="text-slate-300">Start Time</Label>
                <Input 
                  id="startTime"
                  type="time"
                  {...register('startTime')}
                  className="bg-slate-800/50 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime" className="text-slate-300">End Time</Label>
                <Input 
                  id="endTime"
                  type="time"
                  {...register('endTime')}
                  className="bg-slate-800/50 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Duration</Label>
                <div className="h-10 flex items-center px-4 bg-slate-800/30 border border-white/5 rounded-md text-cyan-400 font-mono font-bold">
                  {watch('duration') || '0h 0m'}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 backdrop-blur-xl border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/20 rounded-xl">
                  <FileText className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-white">Structured Inputs</CardTitle>
                  <CardDescription className="text-slate-400 text-xs">Detailed work logs and site challenges</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="workDone" className="text-slate-300">Work Done</Label>
                <Textarea 
                  id="workDone"
                  {...register('workDone')}
                  placeholder="Describe activities completed today..."
                  className="bg-slate-800/50 border-white/10 text-white min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="issuesFaced" className="text-slate-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Issues Faced
                  </Label>
                  <Textarea 
                    id="issuesFaced"
                    {...register('issuesFaced')}
                    placeholder="Any bottlenecks or problems?"
                    className="bg-slate-800/50 border-white/10 text-white h-24"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="materialsUsed" className="text-slate-300 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    Materials Used
                  </Label>
                  <Textarea 
                    id="materialsUsed"
                    {...register('materialsUsed')}
                    placeholder="List consumption (e.g., 50 bags cement)"
                    className="bg-slate-800/50 border-white/10 text-white h-24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 backdrop-blur-xl border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-violet-500/20 rounded-xl">
                    <Upload className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">Attachments</CardTitle>
                    <CardDescription className="text-slate-400 text-xs">Photos, PDFs, and measurement sheets</CardDescription>
                  </div>
                </div>
                <Label className="cursor-pointer bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg active:scale-95 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Add Files
                  <input type="file" multiple className="hidden" onChange={handleFileChange} />
                </Label>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/5 rounded-2xl bg-slate-800/10">
                  <Upload className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-slate-500 text-sm italic">No files attached yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {files.map((file, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        key={idx} 
                        className="group relative bg-slate-800/50 p-3 rounded-2xl border border-white/10 flex items-center gap-3"
                      >
                        <div className="p-2 bg-slate-700 rounded-lg">
                          {file.type.startsWith('image/') ? <ImageIcon className="w-5 h-5 text-pink-400" /> : <FileIcon className="w-5 h-5 text-blue-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate font-medium">{file.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{file.type.split('/')[1]}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setFiles(cur => cur.filter((_, i) => i !== idx))}
                          className="absolute -top-2 -right-2 p-1 bg-red-500/20 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-cyan-500/50" />
              {location ? (
                <span>GPS Locked: {location.lat.substring(0, 10)}, {location.lng.substring(0, 10)}</span>
              ) : (
                <span>Awaiting Location...</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>Timestamp: {format(new Date(), 'HH:mm:ss')}</span>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-16 rounded-3xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-lg font-bold shadow-2xl shadow-cyan-500/20 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {isOnline ? 'Submit Site Report' : 'Save Locally (Offline)'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
