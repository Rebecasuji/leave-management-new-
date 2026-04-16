import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  CheckSquare,
  Users,
  Building2,
  BarChart3,
  UserPlus,
  Shield,
  FileText,
  CalendarClock,
  AlertCircle,
  MessageSquare,
  HardHat,
  Target,
  ClipboardCheck,
} from 'lucide-react';
import { UserRole } from '@/context/AuthContext';
import logoImage from '@assets/WhatsApp_Image_2025-11-11_at_11.06.02_AM_1765464690595.jpeg';

interface AppSidebarProps {
  userRole: UserRole;
  pendingApprovals?: number;
  pendingRejections?: number;
  pendingOnHold?: number;
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function AppSidebar({ userRole, pendingApprovals = 0, pendingRejections = 0, pendingOnHold = 0, collapsed = false, onToggle }: AppSidebarProps) {
  const [location] = useLocation();

  const allMenuItems = [
    { title: 'Achievements', url: '/achievements', icon: BarChart3, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[] },
    { title: 'Plan for Today', url: '/plan-for-day', icon: Target, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[] },
    { title: 'Tracker', url: '/tracker', icon: Clock, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[] },
    { title: 'Approvals', url: '/approvals', icon: CheckSquare, roles: ['manager', 'hr', 'admin'] as UserRole[], badge: pendingApprovals },
    { title: 'Reports', url: '/reports', icon: FileText, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[] },
    { title: 'EOD Reports', url: '/eod-reports', icon: ClipboardCheck, roles: ['manager', 'hr', 'admin'] as UserRole[] },
    { title: 'Site Timesheet', url: '/site-timesheet', icon: HardHat, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[] },
    { title: 'Rejections', url: '/rejections', icon: AlertCircle, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[], badge: pendingRejections },
    { title: 'Discussions', url: '/discussion', icon: MessageSquare, roles: ['employee', 'manager', 'hr', 'admin'] as UserRole[], badge: pendingOnHold },
    { title: 'Analytics', url: '/analytics', icon: BarChart3, roles: ['admin'] as UserRole[] },
    { title: 'Organisation', url: '/organisation', icon: Building2, roles: ['admin'] as UserRole[] },
    { title: 'Users', url: '/users', icon: UserPlus, roles: ['admin'] as UserRole[] },
    { title: 'Administration', url: '/admin', icon: Shield, roles: ['admin'] as UserRole[] },
    { title: 'Postponements', url: '/admin/postponements', icon: CalendarClock, roles: ['admin'] as UserRole[] },
  ];

  const visibleItems = allMenuItems.filter(item => item.roles.includes(userRole));

  return (
    <Sidebar
      className="border-r border-slate-700 bg-slate-900"
      collapsible="icon"
    >
      <SidebarHeader className={`p-4 border-b border-slate-700 ${collapsed ? 'px-2' : ''}`}>
        <div className="flex items-center gap-3">
          <img
            src={logoImage}
            alt="Time Strap"
            className={`object-contain ${collapsed ? 'h-8 w-8' : 'h-9'}`}
            data-testid="sidebar-logo"
          />
          {!collapsed && (
            <span className="font-semibold text-white text-lg" style={{ fontFamily: 'Space Grotesk' }}>
              Time Strap
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`mx-2 rounded-md transition-colors ${isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        } ${collapsed ? 'justify-center px-2' : 'px-3 py-2'}`}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 ml-2 text-sm font-medium">{item.title}</span>
                            {item.badge && item.badge > 0 && (
                              <Badge className="bg-red-500 text-white text-xs h-5 min-w-5 flex items-center justify-center border-0">
                                {item.badge}
                              </Badge>
                            )}
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={`border-t border-slate-700 ${collapsed ? 'p-2' : 'p-3'}`}>
        {!collapsed && (
          <p className="text-xs text-slate-500 text-center">
            Time Strap
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
