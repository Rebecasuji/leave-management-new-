import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Target, TrendingUp, Send, CheckCircle } from 'lucide-react';

interface ShiftSelectorProps {
  shiftHours: 4 | 8 | 12;
  onShiftChange: (hours: 4 | 8 | 12) => void;
  totalWorkedMinutes: number;
  onFinalSubmit: () => void;
  canSubmit: boolean;
  isLocked?: boolean;
}

export default function ShiftSelector({ 
  shiftHours, 
  onShiftChange, 
  totalWorkedMinutes,
  onFinalSubmit,
  canSubmit,
  isLocked
}: ShiftSelectorProps) {
  const shiftMinutes = shiftHours * 60;
  const remainingMinutes = Math.max(0, shiftMinutes - totalWorkedMinutes);
  const progressPercentage = Math.min(100, (totalWorkedMinutes / shiftMinutes) * 100);

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="bg-slate-800/50 border-blue-500/20 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Target className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-200/60 mb-1">Shift Target</p>
            <Select 
              value={shiftHours.toString()} 
              onValueChange={(v) => onShiftChange(parseInt(v) as 4 | 8 | 12)}
            >
              <SelectTrigger 
                className="bg-slate-700/50 border-blue-500/20 text-white h-8"
                data-testid="select-shift-hours"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 Hours</SelectItem>
                <SelectItem value="8">8 Hours</SelectItem>
                <SelectItem value="12">12 Hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="bg-slate-800/50 border-blue-500/20 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/20">
            <Clock className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-xs text-blue-200/60">Total Worked</p>
            <p className="text-xl font-bold text-white" data-testid="text-total-worked">
              {formatTime(totalWorkedMinutes)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="bg-slate-800/50 border-blue-500/20 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <TrendingUp className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-200/60 mb-1">Remaining</p>
            <p className="text-xl font-bold text-white" data-testid="text-remaining">
              {remainingMinutes > 0 ? formatTime(remainingMinutes) : 'Complete!'}
            </p>
            <Progress 
              value={progressPercentage} 
              className="h-1.5 mt-2 bg-slate-700"
            />
          </div>
        </div>
      </Card>

    <Card className="bg-slate-800/50 border-blue-500/20 p-4 flex items-center justify-center">
        <Button
          onClick={onFinalSubmit}
          disabled={!canSubmit || isLocked}
          className={`w-full ${
            isLocked 
              ? 'bg-blue-600/20 text-blue-300 opacity-50 cursor-not-allowed'
              : canSubmit 
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-500/10' 
                : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
          }`}
          data-testid="button-final-submit"
        >
          {isLocked ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Finalized for Today
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Final Submit
            </>
          )}
        </Button>
      </Card>
    </div>
  );
}
