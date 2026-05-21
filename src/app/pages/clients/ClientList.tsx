import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus, Search, Filter, Edit, Power, PowerOff, Trash2, Wifi, WifiOff } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EditClient } from "./EditClient";

interface Client {
  id: string;
  username: string;
  full_name: string | null;
  mobile: string | null;
  zone_name: string | null;
  sub_zone_name: string | null;
  connection_type_name: string | null;
  client_type_name: string | null;
  package_name: string | null;
  monthly_bill: number | null;
  billing_price: number | null;
  mac_address: string | null;
  server_name: string | null;
  billing_status: string;
  mikrotik_status: string;
  status: string;
  expiry_date: string | null;
}

const statusColor: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700",
  disabled:   "bg-gray-100 text-gray-600",
  expired:    "bg-orange-100 text-orange-700",
  suspended:  "bg-yellow-100 text-yellow-700",
  terminated: "bg-red-100 text-red-700",
  waiver:     "bg-blue-100 text-blue-700",
};

const API = import.meta.env.VITE_API_URL || "/api";
const headers = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

export function ClientList({ leftOnly = false }: { leftOnly?: boolean }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [msg, setMsg] = useState("");

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const fetchClients = async () => {
    const params = new URLSearchParams();
    if (leftOnly) params.set("is_left", "1");
    const res = await fetch(`${API}/clients?${params}`, { headers: headers() });
    const data = await res.json();
    setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, [leftOnly]);

  const toggleStatus = async (c: Client) => {
    const newStatus = c.status === "active" ? "disabled" : "active";
    const newBilling = newStatus === "disabled" ? "suspended" : "active";
    await fetch(`${API}/clients/${c.id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ status: newStatus, billing_status: newBilling }) });
    setClients(p => p.map(x => x.id === c.id ? { ...x, status: newStatus, billing_status: newBilling } : x));
    showMsg(`${c.username} ${newStatus === "active" ? "enabled" : "disabled"}`);
  };

  const deleteClient = async () => {
    if (!deleteTarget) return;
    await fetch(`${API}/clients/${deleteTarget.id}`, { method: "DELETE", headers: headers() });
    setClients(p => p.filter(x => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    showMsg(`${deleteTarget.username} deleted`);
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search || c.username.toLowerCase().includes(q) ||
      (c.full_name||"").toLowerCase().includes(q) || (c.mobile||"").includes(q);
    const matchStatus = !statusFilter || c.billing_status === statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{leftOnly ? "Left Clients" : "Client List"}</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} total clients</p>
        </div>
        {!leftOnly && (
          <Link to="/clients/new"
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Add New Client
          </Link>
        )}
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username, name, mobile…"
            className="flex-1 text-sm border-none outline-none bg-transparent" />
          {search && <button onClick={() => setSearch("")}><X size={14} className="text-gray-400" /></button>}
        </div>
        <button onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${showFilters ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          <Filter size={14} /> Filters
        </button>
        {showFilters && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="terminated">Terminated</option>
            <option value="disabled">Disabled</option>
            <option value="waiver">Waiver</option>
          </select>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} of {clients.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                {["Username / IP","Full Name","Mobile","Zone","Conn.Type","Package","M.Bill","MAC","Server","B.Status","Status","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.username}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.full_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.mobile || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.zone_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.connection_type_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{c.package_name || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">৳{Number(c.monthly_bill||c.billing_price||0).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.mac_address || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.server_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.billing_status] || "bg-gray-100 text-gray-600"}`}>
                      {c.billing_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {c.mikrotik_status === "online" ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-gray-400" />}
                      <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor[c.status] || "bg-gray-100 text-gray-600"}`}>{c.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingId(c.id)} className="p-1 hover:bg-cyan-100 rounded" title="Edit">
                        <Edit size={14} className="text-cyan-600" />
                      </button>
                      {c.status === "active"
                        ? <button onClick={() => toggleStatus(c)} className="p-1 hover:bg-red-100 rounded" title="Disable"><PowerOff size={14} className="text-red-500" /></button>
                        : <button onClick={() => toggleStatus(c)} className="p-1 hover:bg-green-100 rounded" title="Enable"><Power size={14} className="text-green-600" /></button>
                      }
                      <button onClick={() => setDeleteTarget(c)} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 size={14} className="text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-16 text-gray-400">Loading clients…</div>}
        {!loading && filtered.length === 0 && <div className="text-center py-16 text-gray-400">No clients found</div>}
      </div>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteClient}
        title="Delete Client" message={`Permanently delete ${deleteTarget?.username}?`} confirmText="Delete" cancelText="Cancel" variant="danger" />

      {editingId && (
        <EditClient
          clientId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); fetchClients(); showMsg("Client updated"); }}
        />
      )}
    </div>
  );
}
