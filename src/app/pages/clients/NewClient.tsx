import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};
const get = (path: string) => fetch(`${API}${path}`, { headers: authH() }).then(r => r.json());

interface Option { id: string; name: string; }
interface IspPackage extends Option { monthly_bill: number; speed_down?: string; speed_up?: string; }
interface Server extends Option { host: string; }
interface MtProfile { name: string; rate_limit?: string; }

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

export function NewClient() {
  const navigate = useNavigate();
  const [zones,       setZones]       = useState<Option[]>([]);
  const [subZones,    setSubZones]    = useState<Option[]>([]);
  const [connTypes,   setConnTypes]   = useState<Option[]>([]);
  const [clientTypes, setClientTypes] = useState<Option[]>([]);
  const [packages,    setPackages]    = useState<IspPackage[]>([]);
  const [servers,     setServers]     = useState<Server[]>([]);
  const [profiles,    setProfiles]    = useState<MtProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const [form, setForm] = useState({
    username: "", pppoe_password: "", full_name: "", mobile: "", address: "",
    zone_id: "", sub_zone_id: "", connection_type_id: "", client_type_id: "",
    package_id: "", profile: "", monthly_bill: "", billing_date: "1",
    billing_status: "active", status: "active", expiry_date: "",
    server_id: "", mac_address: "", notes: "",
  });

  useEffect(() => {
    Promise.all([
      get("/config/zones"),
      get("/config/connection_types"),
      get("/config/client_types"),
      get("/config/isp_packages"),
      get("/mikrotik/servers"),
    ]).then(([z, ct, clt, pkg, srv]) => {
      setZones(z); setConnTypes(ct); setClientTypes(clt); setPackages(pkg); setServers(srv);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.zone_id) { setSubZones([]); return; }
    get(`/config/zones/${form.zone_id}/sub-zones`).then(setSubZones).catch(console.error);
  }, [form.zone_id]);

  useEffect(() => {
    if (!form.server_id) { setProfiles([]); return; }
    get(`/mikrotik/servers/${form.server_id}/profiles`).then(setProfiles).catch(() => setProfiles([]));
  }, [form.server_id]);

  useEffect(() => {
    if (!form.package_id) return;
    const pkg = packages.find(p => p.id === form.package_id);
    if (pkg) setForm(f => ({
      ...f,
      monthly_bill: String(pkg.monthly_bill),
      profile: pkg.name, // will be overridden by direct profile select if needed
    }));
  }, [form.package_id]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.username.trim()) { setError("Username is required"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.monthly_bill) body.monthly_bill = null;
      if (!body.expiry_date) body.expiry_date = null;
      const res = await fetch(`${API}/clients`, { method: "POST", headers: authH(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      navigate("/clients");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create client"); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><ChevronLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Client</h1>
          <p className="text-sm text-gray-500 mt-0.5">Register a new ISP client / PPPoE user</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider border-b pb-2">Personal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Customer full name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Mobile Number</label>
              <input value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="+8801XXXXXXXXX" className={inputCls} />
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={labelCls}>Address</label>
              <input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Street / House / Area" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider border-b pb-2">Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Zone *</label>
              <select value={form.zone_id} onChange={e => { set("zone_id", e.target.value); set("sub_zone_id", ""); }} className={inputCls}>
                <option value="">Select Zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sub Zone</label>
              <select value={form.sub_zone_id} onChange={e => set("sub_zone_id", e.target.value)} className={inputCls} disabled={!form.zone_id}>
                <option value="">Select Sub Zone</option>
                {subZones.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Connection Type</label>
              <select value={form.connection_type_id} onChange={e => set("connection_type_id", e.target.value)} className={inputCls}>
                <option value="">Select Type</option>
                {connTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Connection Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider border-b pb-2">Connection Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>PPPoE Username *</label>
              <input required value={form.username} onChange={e => set("username", e.target.value)} placeholder="pppoe-username" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>PPPoE Password</label>
              <input type="password" value={form.pppoe_password} onChange={e => set("pppoe_password", e.target.value)} placeholder="PPPoE password" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Client Type</label>
              <select value={form.client_type_id} onChange={e => set("client_type_id", e.target.value)} className={inputCls}>
                <option value="">Select Client Type</option>
                {clientTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>MikroTik Server</label>
              <select value={form.server_id} onChange={e => set("server_id", e.target.value)} className={inputCls}>
                <option value="">Select Server</option>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bandwidth Profile</label>
              <select value={form.profile} onChange={e => set("profile", e.target.value)} className={inputCls}>
                <option value="">Select Profile</option>
                {profiles.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate_limit ? ` (${p.rate_limit})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>MAC Address</label>
              <input value={form.mac_address} onChange={e => set("mac_address", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Billing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wider border-b pb-2">Billing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>ISP Package</label>
              <select value={form.package_id} onChange={e => set("package_id", e.target.value)} className={inputCls}>
                <option value="">Select Package</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name} — ৳{p.monthly_bill}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Monthly Bill (৳)</label>
              <input type="number" min="0" value={form.monthly_bill} onChange={e => set("monthly_bill", e.target.value)} placeholder="Monthly bill amount" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Billing Date (day of month)</label>
              <input type="number" min="1" max="28" value={form.billing_date} onChange={e => set("billing_date", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} className={inputCls} />
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
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className={labelCls}>Notes / Remarks</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} placeholder="Any special notes…" className={inputCls + " resize-none"} />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white font-semibold rounded-lg text-sm transition-colors">
            {saving ? "Creating…" : "Create Client"}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
