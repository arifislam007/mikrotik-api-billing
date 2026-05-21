import { useEffect, useState } from "react";
import { statsService } from "../services/api";

interface Stats {
  totalClients: number;    runningClients: number;   inactiveClients: number; waiverClients: number;
  newClients: number;      onlineClients: number;    blockedClients: number;  leftClients: number;
  paidClients: number;     unpaidClients: number;    partialPaid: number;     billDateExpire: number;
  billingClients: number;  totalRevenue: number;     pendingCount: number;    pendingAmount: number;
}

interface Tile {
  label: string; key: keyof Stats; desc: string;
  color: string; textColor: string; iconBg: string; emoji: string;
}

const tiles: Tile[] = [
  // Row 1 — Teal (active/positive)
  { label: "Total Client",       key: "totalClients",    desc: "All registered clients",       color: "bg-cyan-500",    textColor: "text-cyan-700",   iconBg: "bg-cyan-600",   emoji: "👥" },
  { label: "Running Clients",    key: "runningClients",  desc: "Active & not left",            color: "bg-teal-500",    textColor: "text-teal-700",   iconBg: "bg-teal-600",   emoji: "✅" },
  { label: "Online Clients",     key: "onlineClients",   desc: "Currently connected",          color: "bg-emerald-500", textColor: "text-emerald-700",iconBg: "bg-emerald-600",emoji: "🟢" },
  { label: "New Client",         key: "newClients",      desc: "Added this month",             color: "bg-cyan-400",    textColor: "text-cyan-700",   iconBg: "bg-cyan-500",   emoji: "🆕" },
  // Row 2 — Purple (neutral counts)
  { label: "Billing Clients",    key: "billingClients",  desc: "Bills generated this month",   color: "bg-violet-500",  textColor: "text-violet-700", iconBg: "bg-violet-600", emoji: "📋" },
  { label: "Paid Clients",       key: "paidClients",     desc: "Fully paid this month",        color: "bg-purple-500",  textColor: "text-purple-700", iconBg: "bg-purple-600", emoji: "💳" },
  { label: "Partially Paid",     key: "partialPaid",     desc: "Partial payment received",     color: "bg-indigo-500",  textColor: "text-indigo-700", iconBg: "bg-indigo-600", emoji: "🔆" },
  { label: "Inactive Clients",   key: "inactiveClients", desc: "Suspended accounts",           color: "bg-slate-500",   textColor: "text-slate-700",  iconBg: "bg-slate-600",  emoji: "⏸️" },
  // Row 3 — Warning/Gray (issues)
  { label: "Unpaid Clients",     key: "unpaidClients",   desc: "No payment received",          color: "bg-orange-500",  textColor: "text-orange-700", iconBg: "bg-orange-600", emoji: "⚠️" },
  { label: "Blocked Clients",    key: "blockedClients",  desc: "Disabled on router",           color: "bg-red-500",     textColor: "text-red-700",    iconBg: "bg-red-600",    emoji: "🚫" },
  { label: "Bill Date Expire",   key: "billDateExpire",  desc: "Billing date passed",          color: "bg-amber-500",   textColor: "text-amber-700",  iconBg: "bg-amber-600",  emoji: "📅" },
  { label: "Waiver Clients",     key: "waiverClients",   desc: "Free / staff accounts",        color: "bg-gray-500",    textColor: "text-gray-700",   iconBg: "bg-gray-600",   emoji: "🎁" },
  // Row 4 — Dark (critical)
  { label: "Left Clients",       key: "leftClients",     desc: "No longer in system",          color: "bg-gray-700",    textColor: "text-gray-800",   iconBg: "bg-gray-800",   emoji: "👋" },
  { label: "Pending Invoices",   key: "pendingCount",    desc: "Awaiting payment",             color: "bg-rose-600",    textColor: "text-rose-700",   iconBg: "bg-rose-700",   emoji: "📄" },
  { label: "Due Amount (৳)",     key: "pendingAmount",   desc: "Total outstanding dues",       color: "bg-red-600",     textColor: "text-red-700",    iconBg: "bg-red-700",    emoji: "💰" },
  { label: "Total Revenue (৳)",  key: "totalRevenue",    desc: "All-time collected revenue",   color: "bg-green-600",   textColor: "text-green-700",  iconBg: "bg-green-700",  emoji: "💵" },
];

const fmt = (v: number, isMoney?: boolean) => {
  if (isMoney) return v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0);
  return v.toLocaleString();
};

const moneyKeys: (keyof Stats)[] = ["totalRevenue", "pendingAmount"];

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsService.getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const get = (k: keyof Stats) => {
    if (!stats) return "—";
    const v = Number(stats[k]);
    return fmt(v, moneyKeys.includes(k));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">ISP management overview — real-time client and billing metrics</p>
        </div>
        <button onClick={() => { setLoading(true); statsService.getStats().then(setStats).catch(console.error).finally(()=>setLoading(false)); }}
          className="px-3 py-1.5 text-sm text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors">
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
          {Array.from({length: 16}).map((_,i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiles.map(tile => (
            <div key={tile.key} className={`${tile.color} rounded-xl p-4 text-white shadow-sm`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-xs font-medium truncate">{tile.label}</p>
                  <p className="text-2xl font-bold mt-1 leading-none">{get(tile.key)}</p>
                  <p className="text-white/70 text-xs mt-1 truncate">{tile.desc}</p>
                </div>
                <span className="text-2xl ml-2 shrink-0">{tile.emoji}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick stats bar */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Client Status</p>
            <div className="space-y-2">
              {[
                { label: "Active", value: stats.runningClients ?? 0, color: "bg-emerald-500" },
                { label: "Inactive / Suspended", value: stats.inactiveClients ?? 0, color: "bg-orange-400" },
                { label: "Blocked", value: stats.blockedClients ?? 0, color: "bg-red-500" },
                { label: "Left", value: stats.leftClients ?? 0, color: "bg-gray-400" },
              ].map(item => {
                const total = stats.totalClients || 1;
                const pct = Math.round((item.value / total) * 100);
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                      <span>{item.label}</span>
                      <span className="font-semibold">{item.value.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Billing This Month</p>
            <div className="space-y-3">
              {[
                { label: "Paid",           value: stats.paidClients    ?? 0, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Partially Paid", value: stats.partialPaid    ?? 0, color: "text-blue-600",    bg: "bg-blue-50" },
                { label: "Unpaid",         value: stats.unpaidClients  ?? 0, color: "text-red-600",     bg: "bg-red-50" },
                { label: "Bill Expired",   value: stats.billDateExpire ?? 0, color: "text-orange-600",  bg: "bg-orange-50" },
              ].map(item => (
                <div key={item.label} className={`flex justify-between items-center px-3 py-2 ${item.bg} rounded-lg`}>
                  <span className="text-xs text-gray-600">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Revenue Summary</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500">Total Revenue Collected</p>
                <p className="text-2xl font-bold text-emerald-600">৳{(stats.totalRevenue ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending Dues</p>
                <p className="text-xl font-bold text-red-500">৳{(stats.pendingAmount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">{stats.pendingCount ?? 0} invoices pending</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Online Now</p>
                <p className="text-lg font-bold text-cyan-600">{stats.onlineClients ?? 0} clients</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
