import { useState, useEffect } from "react";
import { Users, DollarSign, AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { resellerPortalService, mikrotikService } from "../../services/api";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalRevenue: number;
  pendingCount: number;
  pendingAmount: number;
}

interface Server {
  id: string;
  name: string;
  host: string;
}

export function ResellerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    resellerPortalService.getStats().then(setStats).catch(console.error);
    mikrotikService.getServers().then(setServers).catch(console.error);
  }, []);

  const handleSync = async () => {
    if (!selectedServer) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await resellerPortalService.syncMikroTik({ server_id: selectedServer, direction: "both" });
      setSyncMsg({ type: "success", text: `Sync done — pulled ${res.pull?.created ?? 0} new, pushed ${res.push?.created ?? 0} new users. MACs updated.` });
      resellerPortalService.getStats().then(setStats).catch(console.error);
    } catch (err) {
      setSyncMsg({ type: "error", text: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "bg-blue-500" },
    { label: "Active Users", value: stats?.activeUsers ?? "—", icon: CheckCircle, color: "bg-green-500" },
    { label: "Total Revenue", value: stats ? `$${stats.totalRevenue.toFixed(2)}` : "—", icon: DollarSign, color: "bg-purple-500" },
    { label: "Pending Invoices", value: stats ? `${stats.pendingCount} ($${stats.pendingAmount.toFixed(2)})` : "—", icon: AlertCircle, color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reseller Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Overview of your account</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
              <div className={`${card.color} w-11 h-11 rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Sync with MikroTik Router</h2>
        <p className="text-sm text-gray-500 mb-4">
          Push your users to MikroTik, pull new PPPoE secrets, and update MAC addresses from active sessions.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select MikroTik server…</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
            ))}
          </select>
          <button
            onClick={handleSync}
            disabled={!selectedServer || syncing}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
        {syncMsg && (
          <div className={`mt-3 px-4 py-3 rounded-lg text-sm ${syncMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {syncMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
