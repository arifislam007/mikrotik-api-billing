import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { LayoutDashboard, Users, FileText, Package, Menu, X, LogOut, ChevronDown, Router } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const navigation = [
  { name: "Dashboard", href: "/reseller", icon: LayoutDashboard, exact: true },
  { name: "My Users", href: "/reseller/users", icon: Users },
  { name: "Billing", href: "/reseller/billing", icon: FileText },
  { name: "Packages", href: "/reseller/packages", icon: Package },
];

export function ResellerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
                <Router className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">MikroTik Billing</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-md hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700 bg-green-50 px-2 py-1 rounded">
              Reseller Portal
            </span>
          </div>

          {user?.reseller_name && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">Account</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{user.reseller_name}</p>
            </div>
          )}

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? "bg-green-50 text-green-700" : "text-gray-700 hover:bg-gray-100"}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-gray-200">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-green-700 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white font-semibold text-sm">{user?.username?.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-gray-900 truncate text-sm">{user?.username}</p>
                  <p className="text-xs text-gray-500">Reseller</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md hover:bg-gray-100 mr-2">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="hidden sm:block">Reseller:</span>
            <span className="font-medium text-gray-900">{user?.username}</span>
          </div>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
