import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, X, Check } from "lucide-react";
import { fmtDate } from "../../utils/fmt";

const API = import.meta.env.VITE_API_URL || "/api";
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  width?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  endpoint: string;       // e.g. "zones"
  fields: FieldDef[];
  primaryLabel?: string;  // which field to show as the main label
}

export function ConfigTable({ title, subtitle, endpoint, fields, primaryLabel = "name" }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const emptyForm = () => Object.fromEntries(fields.map(f => [f.key, ""]));
  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const load = () => {
    fetch(`${API}/config/${endpoint}`, { headers: authH() })
      .then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : []))
      .catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, [endpoint]);

  const handleCreate = async () => {
    setErr("");
    const required = fields.filter(f => f.required);
    for (const f of required) { if (!form[f.key]?.trim()) { setErr(`${f.label} is required`); return; } }
    const res = await fetch(`${API}/config/${endpoint}`, { method: "POST", headers: authH(), body: JSON.stringify(form) });
    if (!res.ok) { const d = await res.json(); setErr(d.error || "Failed"); return; }
    setForm(emptyForm()); setShowForm(false); showMsg("Created successfully"); load();
  };

  const handleUpdate = async (id: string) => {
    const res = await fetch(`${API}/config/${endpoint}/${id}`, { method: "PUT", headers: authH(), body: JSON.stringify(editForm) });
    if (!res.ok) return;
    setEditingId(null); showMsg("Updated"); load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`${API}/config/${endpoint}/${id}`, { method: "DELETE", headers: authH() });
    showMsg("Deleted"); load();
  };

  const startEdit = (row: Record<string, string>) => {
    setEditingId(row.id);
    setEditForm(Object.fromEntries(fields.map(f => [f.key, row[f.key] || ""])));
  };

  const inp = (v: string, onChange: (v: string) => void, f: FieldDef) => {
    const base = `w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 ${f.width || ""}`;
    if (f.type === "select" && f.options) return (
      <select value={v} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">—</option>
        {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    return <input type={f.type === "number" ? "number" : "text"} value={v} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} className={base} />;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={() => { setShowForm(p => !p); setForm(emptyForm()); setErr(""); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />{showForm ? "Hide Form" : `Add ${title.replace(/s$/, "")}`}
        </button>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">New Entry</h2>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} className="text-gray-500" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-gray-600 mb-1">{f.label}{f.required ? " *" : ""}</label>
                {f.type === "textarea"
                  ? <textarea value={form[f.key]||""} onChange={e => setForm(p => ({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} rows={2} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
                  : <input type={f.type==="number"?"number":"text"} value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                }
              </div>
            ))}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">Create</button>
            <button onClick={() => { setShowForm(false); setErr(""); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                {fields.map(f => <th key={f.key} className="px-5 py-3 text-left text-xs font-semibold">{f.label}</th>)}
                <th className="px-5 py-3 text-left text-xs font-semibold">Created</th>
                <th className="px-5 py-3 text-left text-xs font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => editingId === row.id ? (
                <tr key={row.id} className="bg-cyan-50">
                  {fields.map(f => (
                    <td key={f.key} className="px-4 py-2">
                      {inp(editForm[f.key]||"", v => setEditForm(p=>({...p,[f.key]:v})), f)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-gray-400 text-xs">{fmtDate(row.created_at)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => handleUpdate(row.id)} className="p-1 hover:bg-green-100 rounded"><Check size={14} className="text-green-600" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={14} className="text-gray-500" /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {fields.map(f => (
                    <td key={f.key} className="px-5 py-3 text-gray-700">{row[f.key] || "—"}</td>
                  ))}
                  <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(row.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(row)} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit size={14} className="text-gray-600" /></button>
                      <button onClick={() => handleDelete(row.id, row[primaryLabel] || row.id)} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 size={14} className="text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-gray-400">Loading…</div>}
        {!loading && rows.length === 0 && <div className="text-center py-12 text-gray-400">No entries yet. Add one above.</div>}
      </div>
      <p className="text-xs text-gray-400">{rows.length} entries</p>
    </div>
  );
}
