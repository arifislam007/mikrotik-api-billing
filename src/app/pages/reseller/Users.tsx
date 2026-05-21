import { useState, useEffect } from "react";
import { Plus, X, Package, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { fmtDate } from "../../utils/fmt";
import { resellerPortalService, packageService } from "../../services/api";

interface User {
  id: string;
  username: string;
  profile: string;
  billing_package: string;
  billing_price: number;
  status: string;
  expiry_date: string;
  mac_address: string | null;
}

interface BillingPackage { id: string; name: string; mikrotik_profile: string; price: number; duration_days: number; }

export function ResellerUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [changingPkgFor, setChangingPkgFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const emptyForm = { username: "", billing_package_id: "", expiry_date: "" };
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([
      resellerPortalService.getUsers().then(setUsers),
      packageService.getAll().then(setPackages),
    ]).catch(console.error).finally(() => setLoading(false));
  }, []);

  const showMsg = (type: "ok" | "err", text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const handleCreate = async () => {
    setFormError("");
    if (!form.username.trim()) { setFormError("Username is required"); return; }
    if (!form.billing_package_id) { setFormError("Package is required"); return; }
    try {
      const user = await resellerPortalService.createUser({ username: form.username.trim(), billing_package_id: form.billing_package_id, expiry_date: form.expiry_date || undefined });
      setUsers((p) => [...p, user]);
      setForm(emptyForm);
      setShowForm(false);
      showMsg("ok", `User "${user.username}" created`);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Failed"); }
  };

  const handleChangePackage = async (userId: string, pkgId: string) => {
    try {
      const updated = await resellerPortalService.changeUserPackage(userId, { billing_package_id: pkgId });
      setUsers((p) => p.map((u) => u.id === userId ? updated : u));
      setChangingPkgFor(null);
      showMsg("ok", "Package changed");
    } catch (e) { showMsg("err", e instanceof Error ? e.message : "Failed"); }
  };

  const filtered = users.filter((u) => u.username.toLowerCase().includes(search.toLowerCase()));

  const inputCls = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Users</h1>
          <p className="text-gray-500 mt-1 text-sm">{users.length} PPPoE users under your account</p>
        </div>
        <button onClick={() => setShowForm((p) => !p)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />{showForm ? "Hide Form" : "Add User"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New PPPoE User</h2>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder="PPPoE Username *" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className={inputCls} />
            <select value={form.billing_package_id} onChange={(e) => setForm((f) => ({ ...f, billing_package_id: e.target.value }))} className={inputCls}>
              <option value="">Select Package *</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — ${Number(p.price).toFixed(2)} / {p.duration_days}d (profile: {p.mikrotik_profile})</option>)}
            </select>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expiry Date (optional — auto from package)</label>
              <input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} className={inputCls + " w-full"} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Create User</button>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <input placeholder="Search username…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Username", "Package", "Price", "Status", "Expiry", "MAC Address", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{user.username}</td>
                  <td className="px-5 py-3">
                    {changingPkgFor === user.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue=""
                          onChange={(e) => e.target.value && handleChangePackage(user.id, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value="">Pick package…</option>
                          {packages.map((p) => <option key={p.id} value={p.id}>{p.name} (${Number(p.price).toFixed(2)})</option>)}
                        </select>
                        <button onClick={() => setChangingPkgFor(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-3.5 h-3.5 text-gray-500" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{user.billing_package || user.profile}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-900 font-semibold">${Number(user.billing_price || 0).toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${user.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {user.status === "active" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{fmtDate(user.expiry_date)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{user.mac_address || "—"}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setChangingPkgFor(changingPkgFor === user.id ? null : user.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Change Pkg
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading users…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{search ? "No users match your search" : "No users yet. Add one above."}</div>
        ) : null}
      </div>
      <p className="text-xs text-gray-400">Showing {filtered.length} of {users.length} users</p>
    </div>
  );
}
