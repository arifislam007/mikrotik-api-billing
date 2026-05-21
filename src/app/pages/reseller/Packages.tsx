import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, X, Check, Package } from "lucide-react";
import { packageService, mikrotikService } from "../../services/api";

interface BillingPackage {
  id: string;
  name: string;
  mikrotik_profile: string;
  price: number;
  duration_days: number;
  reseller_id: string | null;
}

interface Server { id: string; name: string; host: string; }
interface Profile { name: string; rate_limit: string; }

export function ResellerPackages() {
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedServer, setSelectedServer] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const emptyForm = { name: "", mikrotik_profile: "", price: "", duration_days: "30" };
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);

  useEffect(() => {
    packageService.getAll().then(setPackages).catch(console.error).finally(() => setLoading(false));
    mikrotikService.getServers().then(setServers).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedServer) { setProfiles([]); return; }
    mikrotikService.getProfiles(selectedServer).then(setProfiles).catch(() => setProfiles([]));
  }, [selectedServer]);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const handleCreate = async () => {
    setError("");
    if (!form.name || !form.mikrotik_profile) { setError("Name and MikroTik profile are required"); return; }
    try {
      const pkg = await packageService.create({ name: form.name, mikrotik_profile: form.mikrotik_profile, price: Number(form.price) || 0, duration_days: Number(form.duration_days) || 30 });
      setPackages((p) => [...p, pkg]);
      setForm(emptyForm);
      setShowForm(false);
      showMsg("Package created");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const startEdit = (pkg: BillingPackage) => {
    setEditingId(pkg.id);
    setEditForm({ name: pkg.name, mikrotik_profile: pkg.mikrotik_profile, price: String(pkg.price), duration_days: String(pkg.duration_days) });
  };

  const handleUpdate = async (id: string) => {
    try {
      const updated = await packageService.update(id, { name: editForm.name, mikrotik_profile: editForm.mikrotik_profile, price: Number(editForm.price), duration_days: Number(editForm.duration_days) });
      setPackages((p) => p.map((pkg) => pkg.id === id ? updated : pkg));
      setEditingId(null);
      showMsg("Package updated");
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    try {
      await packageService.delete(id);
      setPackages((p) => p.filter((pkg) => pkg.id !== id));
      showMsg("Package deleted");
    } catch (e) { console.error(e); }
  };

  const inputCls = "px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing Packages</h1>
          <p className="text-gray-500 mt-1 text-sm">Define packages linked to MikroTik PPPoE profiles</p>
        </div>
        <button onClick={() => setShowForm((p) => !p)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />{showForm ? "Hide Form" : "New Package"}
        </button>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Package</h2>
            <button onClick={() => { setShowForm(false); setError(""); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">Load bandwidth profiles from MikroTik</p>
            <div className="flex gap-2">
              <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} className={`flex-1 ${inputCls}`}>
                <option value="">Select server to load profiles…</option>
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {profiles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {profiles.map((p) => (
                  <button key={p.name} onClick={() => setForm((f) => ({ ...f, mikrotik_profile: p.name }))}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${form.mikrotik_profile === p.name ? "bg-green-100 border-green-400 text-green-800" : "bg-white border-gray-300 hover:border-green-400"}`}>
                    {p.name}{p.rate_limit ? ` (${p.rate_limit})` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input placeholder="Package Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="MikroTik Profile *" value={form.mikrotik_profile} onChange={(e) => setForm((f) => ({ ...f, mikrotik_profile: e.target.value }))} className={inputCls} />
            <input type="number" placeholder="Price ($)" min="0" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={inputCls} />
            <input type="number" placeholder="Duration (days)" min="1" value={form.duration_days} onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))} className={inputCls} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Create Package</button>
            <button onClick={() => { setShowForm(false); setError(""); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Package Name", "MikroTik Profile", "Price", "Duration", "Scope", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map((pkg) =>
                editingId === pkg.id ? (
                  <tr key={pkg.id} className="bg-green-50">
                    <td className="px-4 py-2"><input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2"><input value={editForm.mikrotik_profile} onChange={(e) => setEditForm((f) => ({ ...f, mikrotik_profile: e.target.value }))} className={inputCls} /></td>
                    <td className="px-4 py-2"><input type="number" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} className={`w-24 ${inputCls}`} /></td>
                    <td className="px-4 py-2"><input type="number" value={editForm.duration_days} onChange={(e) => setEditForm((f) => ({ ...f, duration_days: e.target.value }))} className={`w-20 ${inputCls}`} /></td>
                    <td className="px-4 py-2 text-gray-400">—</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => handleUpdate(pkg.id)} className="p-1 hover:bg-green-100 rounded" title="Save"><Check className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded" title="Cancel"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={pkg.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2"><Package className="w-4 h-4 text-green-600" />{pkg.name}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-700 font-mono text-xs">{pkg.mikrotik_profile}</td>
                    <td className="px-5 py-3 text-gray-900 font-semibold">${Number(pkg.price).toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-700">{pkg.duration_days} days</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pkg.reseller_id ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {pkg.reseller_id ? "My Package" : "Global"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {pkg.reseller_id && (
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(pkg)} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4 text-gray-600" /></button>
                          <button onClick={() => handleDelete(pkg.id)} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-600" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading packages…</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No packages yet. Create one above.</div>
        ) : null}
      </div>
    </div>
  );
}
