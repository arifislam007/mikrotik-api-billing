import { useState, useEffect } from "react";
import { X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};
const get = (path: string) => fetch(`${API}${path}`, { headers: authH() }).then(r => r.json());

interface Option { id: string; name: string; }
interface IspPackage extends Option { monthly_bill: number; }
interface Server extends Option { host: string; }
interface MtProfile { name: string; rate_limit?: string; }

interface ClientFull {
  id: string; username: string; full_name: string | null; mobile: string | null;
  address: string | null; zone_id: string | null; sub_zone_id: string | null;
  connection_type_id: string | null; client_type_id: string | null;
  package_id: string | null; profile: string | null; monthly_bill: number | null;
  billing_date: number | null; billing_status: string; status: string;
  expiry_date: string | null; server_id: string | null; mac_address: string | null;
  pppoe_password: string | null; notes: string | null;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

interface Props {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditClient({ clientId, onClose, onSaved }: Props) {
  const [zones,       setZones]       = useState<Option[]>([]);
  const [subZones,    setSubZones]    = useState<Option[]>([]);
  const [connTypes,   setConnTypes]   = useState<Option[]>([]);
  const [clientTypes, setClientTypes] = useState<Option[]>([]);
  const [packages,    setPackages]    = useState<IspPackage[]>([]);
  const [servers,     setServers]     = useState<Server[]>([]);
  const [profiles,    setProfiles]    = useState<MtProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState("");

  const [form, setForm] = useState<ClientFull | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/clients/${clientId}`, { headers: authH() }).then(r => r.json()),
      get("/config/zones"),
      get("/config/connection_types"),
      get("/config/client_types"),
      get("/config/isp_packages"),
      get("/mikrotik/servers"),
    ]).then(([client, z, ct, clt, pkg, srv]) => {
      setForm(client);
      setZones(z); setConnTypes(ct); setClientTypes(clt); setPackages(pkg); setServers(srv);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    if (!form?.zone_id) { setSubZones([]); return; }
    get(`/config/zones/${form.zone_id}/sub-zones`).then(setSubZones).catch(() => setSubZones([]));
  }, [form?.zone_id]);

  useEffect(() => {
    if (!form?.server_id) { setProfiles([]); return; }
    get(`/mikrotik/servers/${form.server_id}/profiles`).then(setProfiles).catch(() => setProfiles([]));
  }, [form?.server_id]);

  const set = (k: keyof ClientFull, v: string | number | null) =>
    setForm(f => f ? { ...f, [k]: v } : f);

  const handlePackageChange = (pkgId: string) => {
    set("package_id", pkgId);
    const pkg = packages.find(p => p.id === pkgId);
    if (pkg) { set("monthly_bill", pkg.monthly_bill); set("profile", pkg.name); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${API}/clients/${clientId}`, {
        method: "PUT", headers: authH(), body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  if (loading || !form) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit Client</h2>
            <p className="text-sm text-gray-500 mt-0.5">{form.username}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Personal Info */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Full Name</label>
                <input value={form.full_name || ""} onChange={e => set("full_name", e.target.value)} placeholder="Customer full name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Mobile Number</label>
                <input value={form.mobile || ""} onChange={e => set("mobile", e.target.value)} placeholder="+8801XXXXXXXXX" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input value={form.address || ""} onChange={e => set("address", e.target.value)} placeholder="Street / House / Area" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Location</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Zone</label>
                <select value={form.zone_id || ""} onChange={e => { set("zone_id", e.target.value); set("sub_zone_id", ""); }} className={inputCls}>
                  <option value="">Select Zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Sub Zone</label>
                <select value={form.sub_zone_id || ""} onChange={e => set("sub_zone_id", e.target.value)} className={inputCls} disabled={!form.zone_id}>
                  <option value="">Select Sub Zone</option>
                  {subZones.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Connection Type</label>
                <select value={form.connection_type_id || ""} onChange={e => set("connection_type_id", e.target.value)} className={inputCls}>
                  <option value="">Select Type</option>
                  {connTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Connection Details */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Connection Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>PPPoE Username</label>
                <input value={form.username} onChange={e => set("username", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>PPPoE Password</label>
                <input type="password" value={form.pppoe_password || ""} onChange={e => set("pppoe_password", e.target.value)} placeholder="Leave blank to keep current" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Client Type</label>
                <select value={form.client_type_id || ""} onChange={e => set("client_type_id", e.target.value)} className={inputCls}>
                  <option value="">Select Client Type</option>
                  {clientTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>MikroTik Server</label>
                <select value={form.server_id || ""} onChange={e => set("server_id", e.target.value)} className={inputCls}>
                  <option value="">Select Server</option>
                  {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Bandwidth Profile</label>
                <select value={form.profile || ""} onChange={e => set("profile", e.target.value)} className={inputCls}>
                  <option value="">Select Profile</option>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate_limit ? ` (${p.rate_limit})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>MAC Address</label>
                <input value={form.mac_address || ""} onChange={e => set("mac_address", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Billing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>ISP Package</label>
                <select value={form.package_id || ""} onChange={e => handlePackageChange(e.target.value)} className={inputCls}>
                  <option value="">Select Package</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} — ৳{p.monthly_bill}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Monthly Bill (৳)</label>
                <input type="number" min="0" value={form.monthly_bill ?? ""} onChange={e => set("monthly_bill", Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Billing Date (day of month)</label>
                <input type="number" min="1" max="28" value={form.billing_date ?? 1} onChange={e => set("billing_date", Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expiry Date</label>
                <input type="date" value={form.expiry_date || ""} onChange={e => set("expiry_date", e.target.value || null)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Billing Status</label>
                <select value={form.billing_status} onChange={e => set("billing_status", e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="waiver">Waiver</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Account Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
            <label className={labelCls}>Notes / Remarks</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Any special notes…" className={inputCls + " resize-none"} />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white font-semibold rounded-lg text-sm transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
