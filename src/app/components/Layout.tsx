import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard, Users, FileText, Settings, Router,
  Menu, X, LogOut, ChevronDown, ChevronRight,
  Package, MapPin, Layers, Cable, Tag, BarChart3,
  UserCog, CreditCard, Wifi,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface NavItem {
  name: string;
  href?: string;
  icon: React.ElementType;
  exact?: boolean;
  children?: { name: string; href: string }[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
  {
    name: "Clients", icon: Users,
    children: [
      { name: "Client List",   href: "/clients" },
      { name: "Add New Client",href: "/clients/new" },
      { name: "Left Clients",  href: "/clients/left" },
    ],
  },
  {
    name: "Billing", icon: FileText,
    children: [
      { name: "Billing List",        href: "/billing" },
      { name: "Daily Collections",   href: "/billing/collections" },
    ],
  },
  {
    name: "MikroTik", icon: Router,
    children: [
      { name: "Servers",  href: "/mikrotik" },
    ],
  },
  {
    name: "Configuration", icon: Settings,
    children: [
      { name: "Zones",              href: "/config/zones" },
      { name: "Sub Zones",          href: "/config/sub-zones" },
      { name: "Boxes",              href: "/config/boxes" },
      { name: "Connection Types",   href: "/config/connection-types" },
      { name: "Client Types",       href: "/config/client-types" },
      { name: "Packages",           href: "/config/packages" },
    ],
  },
  { name: "Resellers",  href: "/resellers",  icon: UserCog },
  { name: "Reports",    href: "/reports",    icon: BarChart3 },
];

function NavGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const isChildActive = item.children?.some(c => location.pathname.startsWith(c.href)) ?? false;
  const [open, setOpen] = useState(isChildActive);
  const Icon = item.icon;

  if (!item.children) {
    const isActive = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href!);
    return (
      <Link to={item.href!}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium
          ${isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
        <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium
          ${isChildActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.name}</span>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {item.children!.map(child => {
            const active = location.pathname === child.href || location.pathname.startsWith(child.href + '/');
            return (
              <Link key={child.href} to={child.href}
                className={`block px-2 py-1.5 rounded text-xs transition-colors
                  ${active ? "text-white font-semibold" : "text-slate-400 hover:text-white"}`}>
                {child.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full bg-slate-900 flex flex-col
        transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:relative lg:z-auto
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        ${collapsed ? "w-16" : "w-64"}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center shrink-0">
                <Wifi size={16} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">ISP Billing</p>
                <p className="text-slate-400 text-xs">Management</p>
              </div>
            </div>
          )}
          {collapsed && <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center mx-auto"><Wifi size={16} className="text-white" /></div>}
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setCollapsed(c => !c)} className="hidden lg:block p-1 text-slate-400 hover:text-white rounded">
              <Menu size={16} />
            </button>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-white rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navigation.map(item => (
            <NavGroup key={item.name} item={item} collapsed={collapsed} />
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/10 shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cyan-600 rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">{user?.username?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{user?.username}</p>
                <p className="text-slate-400 text-xs">Administrator</p>
              </div>
              <button onClick={handleLogout} title="Sign out" className="p-1 text-slate-400 hover:text-red-400 rounded transition-colors">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center p-1 text-slate-400 hover:text-red-400">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded hover:bg-gray-100">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm">
            <div className="w-7 h-7 bg-cyan-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{user?.username?.charAt(0).toUpperCase()}</span>
            </div>
            <span className="text-gray-700 font-medium hidden sm:block">{user?.username}</span>
            <button onClick={handleLogout} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
