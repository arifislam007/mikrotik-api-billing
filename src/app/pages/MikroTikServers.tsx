import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  Server, Plus, Edit, Trash2, Link2, Check, X, RefreshCw, Star, StarOff,
  Power, PowerOff, Clock, AlertCircle, CheckCircle, Download, Upload,
  Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { mikrotikService } from "../services/api";

interface MikroTikServer {
  id: string; name: string; host: string; port: number; username: string;
  use_tls: boolean; allow_insecure: boolean; is_default: boolean; enabled: boolean;
  last_sync_at?: string | null; created_at?: string;
}

interface RemoteUser {
  username: string; profile: string; password: string;
  disabled: boolean; exists_locally: boolean; same_server: boolean;
}

const emptyForm = {
  name: "", host: "", port: 8728, username: "", password: "",
  use_tls: false, allow_insecure: false, is_default: false, enabled: true,
};

type TestStatus = "idle" | "testing" | "ok" | "error";
type PanelMode = "import" | "push" | null;

export function MikroTikServers() {
  const [servers, setServers] = useState<MikroTikServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof emptyForm & { id?: string }>({ ...emptyForm });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [serverToDelete, setServerToDelete] = useState<MikroTikServer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState("");

  // Sync panel state
  const [panelServerId, setPanelServerId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());
  const [showPasswords, setShowPasswords] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelResult, setPanelResult] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "new" | "existing">("all");

  useEffect(() => { fetchServers(); }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const data = await mikrotikService.getServers();
      setServers(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const flash = (msg: string) => { setActionMessage(msg); setTimeout(() => setActionMessage(""), 3500); };

  const openPanel = async (server: MikroTikServer, mode: PanelMode) => {
    if (panelServerId === server.id && panelMode === mode) {
      setPanelServerId(null); setPanelMode(null); return;
    }
    setPanelServerId(server.id); setPanelMode(mode);
    setPanelResult(null); setPanelError(null);
    setRemoteUsers([]); setSelectedUsernames(new Set()); setFilterMode("all");
    if (mode === "import") {
      setPanelLoading(true);
      try {
        const data = await mikrotikService.previewImport(server.id);
        setRemoteUsers(data.users || []);
        setSelectedUsernames(new Set((data.users || []).filter((u: RemoteUser) => !u.exists_locally).map((u: RemoteUser) => u.username)));
      } catch (e) {
        setPanelError(e instanceof Error ? e.message : "Failed to fetch remote users");
      } finally { setPanelLoading(false); }
    }
  };

  const closePanel = () => { setPanelServerId(null); setPanelMode(null); };

  const toggleSelect = (username: string) => {
    setSelectedUsernames(prev => {
      const next = new Set(prev);
      next.has(username) ? next.delete(username) : next.add(username);
      return next;
    });
  };

  const selectAll = (users: RemoteUser[]) =>
    setSelectedUsernames(new Set(users.map(u => u.username)));

  const selectNone = () => setSelectedUsernames(new Set());

  const handleImport = async (serverId: string) => {
    if (selectedUsernames.size === 0) return;
    setPanelLoading(true); setPanelResult(null); setPanelError(null);
    try {
      const res = await mikrotikService.importUsers(serverId, Array.from(selectedUsernames));
      setPanelResult(`Imported ${res.created} new, updated ${res.updated} existing users.`);
      setRemoteUsers(prev => prev.map(u =>
        selectedUsernames.has(u.username) ? { ...u, exists_locally: true, same_server: true } : u
      ));
      setSelectedUsernames(new Set());
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, last_sync_at: new Date().toISOString() } : s));
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Import failed");
    } finally { setPanelLoading(false); }
  };

  const handlePush = async (serverId: string) => {
    setPanelLoading(true); setPanelResult(null); setPanelError(null);
    try {
      const res = await mikrotikService.pushUsers(serverId);
      const p = res.push || res;
      setPanelResult(`Push complete — created ${p.created}, updated ${p.updated}, skipped ${p.skipped} of ${p.totalLocalUsers} users.`);
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, last_sync_at: new Date().toISOString() } : s));
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Push failed");
    } finally { setPanelLoading(false); }
  };

  // ── Form handlers ──────────────────────────────────────────────
  const handleAdd = async () => {
    setAddError("");
    if (!addForm.name.trim() || !addForm.host.trim() || !addForm.username.trim() || !addForm.password.trim()) {
      setAddError("Name, host, username and password are all required"); return;
    }
    try {
      setAddLoading(true);
      const result = await mikrotikService.createServer({ ...addForm, port: Number(addForm.port) || 8728 });
      if (addForm.is_default) setServers(prev => prev.map(s => ({ ...s, is_default: false })));
      setServers(prev => [result, ...prev]);
      setAddForm(emptyForm); setShowAddForm(false); flash("Server added");
    } catch (err) { setAddError(err instanceof Error ? err.message : "Failed"); }
    finally { setAddLoading(false); }
  };

  const startEdit = (server: MikroTikServer) => {
    setEditingId(server.id);
    setEditForm({ name: server.name, host: server.host, port: server.port, username: server.username,
      password: "", use_tls: server.use_tls, allow_insecure: server.allow_insecure,
      is_default: server.is_default, enabled: server.enabled });
    setEditError("");
  };

  const handleUpdate = async (id: string) => {
    setEditError("");
    if (!editForm.name.trim() || !editForm.host.trim() || !editForm.username.trim()) {
      setEditError("Name, host and username are required"); return;
    }
    try {
      setEditLoading(true);
      const result = await mikrotikService.updateServer(id, { ...editForm, port: Number(editForm.port) || 8728, password: editForm.password.trim() || undefined });
      if (editForm.is_default) setServers(prev => prev.map(s => ({ ...s, is_default: s.id === id })));
      setServers(prev => prev.map(s => s.id === id ? { ...s, ...result } : s));
      setEditingId(null); flash("Server updated");
    } catch (err) { setEditError(err instanceof Error ? err.message : "Failed"); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async () => {
    if (!serverToDelete) return;
    try {
      setDeleteLoading(true);
      await mikrotikService.deleteServer(serverToDelete.id);
      setServers(prev => prev.filter(s => s.id !== serverToDelete.id));
      flash("Server deleted");
    } catch { } finally { setDeleteLoading(false); setServerToDelete(null); }
  };

  const handleTest = async (server: MikroTikServer) => {
    setTestStatus(p => ({ ...p, [server.id]: "testing" }));
    setTestMessage(p => ({ ...p, [server.id]: "" }));
    try {
      const result = await mikrotikService.testServer(server.id);
      const identity = result?.identity?.name ? ` — ${result.identity.name}` : "";
      setTestStatus(p => ({ ...p, [server.id]: "ok" }));
      setTestMessage(p => ({ ...p, [server.id]: `Connected${identity}` }));
    } catch (err) {
      setTestStatus(p => ({ ...p, [server.id]: "error" }));
      setTestMessage(p => ({ ...p, [server.id]: err instanceof Error ? err.message : "Failed" }));
    }
  };

  const handleToggleEnabled = async (server: MikroTikServer) => {
    const result = await mikrotikService.updateServer(server.id, { enabled: !server.enabled });
    setServers(prev => prev.map(s => s.id === server.id ? { ...s, ...result } : s));
  };

  const handleSetDefault = async (server: MikroTikServer) => {
    if (server.is_default) return;
    const result = await mikrotikService.updateServer(server.id, { is_default: true });
    setServers(prev => prev.map(s => s.id === server.id ? { ...s, ...result } : { ...s, is_default: false }));
    flash(`"${server.name}" set as default`);
  };

  const renderTestBadge = (id: string) => {
    const status = testStatus[id]; const msg = testMessage[id];
    if (!status || status === "idle") return null;
    if (status === "testing") return <span className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Testing…</span>;
    if (status === "ok") return <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {msg}</span>;
    return <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {msg}</span>;
  };

  const FormFields = ({ form, onChange, isEdit = false }: { form: typeof emptyForm; onChange: (p: Partial<typeof emptyForm>) => void; isEdit?: boolean }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Server Name *", key: "name", placeholder: "e.g. Main Router" },
          { label: "Host / IP *", key: "host", placeholder: "192.168.88.1" },
          { label: "Username *", key: "username", placeholder: "admin" },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
            <input value={(form as Record<string, string>)[f.key]} placeholder={f.placeholder}
              onChange={e => onChange({ [f.key]: e.target.value } as Partial<typeof emptyForm>)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
          <input type="number" value={form.port} placeholder="8728"
            onChange={e => onChange({ port: Number(e.target.value) || 8728 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Password {isEdit ? <span className="text-gray-400">(blank = keep current)</span> : <span className="text-red-500">*</span>}
          </label>
          <input type="password" value={form.password} placeholder={isEdit ? "••••••••" : "password"}
            onChange={e => onChange({ password: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        {([["use_tls","Use TLS / HTTPS"],["allow_insecure","Allow insecure TLS"],["is_default","Set as default"],["enabled","Enabled"]] as [keyof typeof emptyForm, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form[key] as boolean}
              onChange={e => onChange({ [key]: e.target.checked } as Partial<typeof emptyForm>)} className="rounded" />
            {label}
          </label>
        ))}
      </div>
    </div>
  );

  // ── Import panel ───────────────────────────────────────────────
  const renderImportPanel = (server: MikroTikServer) => {
    const filtered = remoteUsers.filter(u =>
      filterMode === "all" ? true : filterMode === "new" ? !u.exists_locally : u.exists_locally
    );

    return (
      <div className="border-t border-cyan-200 bg-cyan-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-cyan-800">
            Import from MikroTik — {remoteUsers.length} PPPoE secrets found
          </p>
          <button onClick={closePanel} className="p-1 hover:bg-cyan-100 rounded"><X size={14} /></button>
        </div>

        {panelLoading && <p className="text-sm text-gray-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading remote users…</p>}
        {panelError && <p className="text-sm text-red-600">{panelError}</p>}
        {panelResult && <p className="text-sm text-emerald-700 font-medium">{panelResult}</p>}

        {!panelLoading && remoteUsers.length > 0 && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex border border-gray-300 rounded-lg overflow-hidden text-xs">
                {(["all","new","existing"] as const).map(m => (
                  <button key={m} onClick={() => setFilterMode(m)}
                    className={`px-3 py-1.5 capitalize ${filterMode === m ? "bg-cyan-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {m === "new" ? "New only" : m === "existing" ? "Existing" : "All"}
                    {m === "new" && ` (${remoteUsers.filter(u=>!u.exists_locally).length})`}
                    {m === "existing" && ` (${remoteUsers.filter(u=>u.exists_locally).length})`}
                    {m === "all" && ` (${remoteUsers.length})`}
                  </button>
                ))}
              </div>
              <button onClick={() => selectAll(filtered)} className="text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Select all</button>
              <button onClick={selectNone} className="text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">None</button>
              <button onClick={() => setShowPasswords(p => !p)} className="text-xs px-2 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                {showPasswords ? <EyeOff size={12} /> : <Eye size={12} />} {showPasswords ? "Hide" : "Show"} passwords
              </button>
              <span className="text-xs text-gray-500 ml-auto">{selectedUsernames.size} selected</span>
            </div>

            {/* Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-800 text-white sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(u => selectedUsernames.has(u.username))}
                        onChange={e => e.target.checked ? selectAll(filtered) : selectNone()}
                        className="rounded" />
                    </th>
                    <th className="px-3 py-2 text-left">Username</th>
                    <th className="px-3 py-2 text-left">Profile</th>
                    {showPasswords && <th className="px-3 py-2 text-left">Password</th>}
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">In App</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(u => (
                    <tr key={u.username} className={`hover:bg-gray-50 ${selectedUsernames.has(u.username) ? "bg-cyan-50" : ""}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selectedUsernames.has(u.username)}
                          onChange={() => toggleSelect(u.username)} className="rounded" />
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-gray-900">{u.username}</td>
                      <td className="px-3 py-2 text-gray-600">{u.profile}</td>
                      {showPasswords && <td className="px-3 py-2 font-mono text-gray-500">{u.password || "—"}</td>}
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${u.disabled ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {u.disabled ? "disabled" : "active"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {u.exists_locally
                          ? <span className={`px-1.5 py-0.5 rounded text-xs ${u.same_server ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                              {u.same_server ? "this server" : "other server"}
                            </span>
                          : <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">new</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button onClick={() => handleImport(server.id)} disabled={panelLoading || selectedUsernames.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-lg text-sm font-medium">
                <Download size={14} />
                {panelLoading ? "Importing…" : `Import ${selectedUsernames.size} users`}
              </button>
              <button onClick={closePanel} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Push panel ─────────────────────────────────────────────────
  const renderPushPanel = (server: MikroTikServer) => (
    <div className="border-t border-orange-200 bg-orange-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-orange-800">Push app users to MikroTik</p>
        <button onClick={closePanel} className="p-1 hover:bg-orange-100 rounded"><X size={14} /></button>
      </div>
      <p className="text-xs text-gray-600">
        Creates or updates PPPoE secrets on the router for all clients assigned to this server.
        Pushes username, bandwidth profile, and enable/disable status. Passwords are pushed only for new secrets.
      </p>
      {panelLoading && <p className="text-sm text-gray-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Pushing users to MikroTik…</p>}
      {panelError && <p className="text-sm text-red-600">{panelError}</p>}
      {panelResult && <p className="text-sm text-emerald-700 font-medium">{panelResult}</p>}
      {!panelResult && (
        <div className="flex gap-2">
          <button onClick={() => handlePush(server.id)} disabled={panelLoading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white rounded-lg text-sm font-medium">
            <Upload size={14} />
            {panelLoading ? "Pushing…" : "Push to MikroTik"}
          </button>
          <button onClick={closePanel} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MikroTik Servers</h1>
          <p className="text-gray-600 mt-1">Manage RouterOS API connections and synchronise PPPoE users</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchServers}>Refresh</Button>
          <Button icon={Plus} onClick={() => { setShowAddForm(p => !p); setAddError(""); }}>
            {showAddForm ? "Hide Form" : "Add Server"}
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{actionMessage}</p>
        </div>
      )}

      {/* Add Server Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Plus className="w-4 h-4 text-blue-600" /></div>
              <h2 className="text-base font-semibold text-gray-900">New MikroTik Server</h2>
            </div>
            <button onClick={() => { setShowAddForm(false); setAddError(""); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          <FormFields form={addForm} onChange={patch => setAddForm(p => ({ ...p, ...patch }))} />
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleAdd} disabled={addLoading}>{addLoading ? "Adding…" : "Add Server"}</Button>
            <Button variant="secondary" onClick={() => { setShowAddForm(false); setAddError(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Server List */}
      {loading ? (
        <div className="text-center py-16"><p className="text-gray-500">Loading servers…</p></div>
      ) : servers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Server className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No MikroTik servers configured</p>
          <p className="text-gray-400 text-sm mt-1">Click "Add Server" to connect your first RouterOS device</p>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map(server =>
            editingId === server.id ? (
              <div key={server.id} className="bg-white rounded-lg border-2 border-blue-400 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-gray-900">Editing: {server.name}</span>
                  </div>
                  <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                </div>
                <FormFields form={editForm} onChange={patch => setEditForm(p => ({ ...p, ...patch }))} isEdit />
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <Button onClick={() => handleUpdate(server.id)} disabled={editLoading}>{editLoading ? "Saving…" : "Save Changes"}</Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div key={server.id} className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-all ${server.is_default ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"} ${!server.enabled ? "opacity-60" : ""}`}>
                {/* Card body */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${server.enabled ? "bg-blue-100" : "bg-gray-100"}`}>
                        <Server className={`w-5 h-5 ${server.enabled ? "text-blue-600" : "text-gray-400"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{server.name}</h3>
                          {server.is_default && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Default</span>}
                          {!server.enabled && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Disabled</span>}
                        </div>
                        <p className="text-sm text-gray-500 font-mono mt-0.5">{server.use_tls ? "https" : "http"}://{server.host}:{server.port}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleSetDefault(server)} title={server.is_default ? "Already default" : "Set as default"}
                        className={`p-1.5 rounded hover:bg-yellow-50 ${server.is_default ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"}`}>
                        {server.is_default ? <Star className="w-4 h-4 fill-yellow-400" /> : <StarOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleToggleEnabled(server)} title={server.enabled ? "Disable" : "Enable"}
                        className="p-1.5 rounded hover:bg-gray-100">
                        {server.enabled ? <Power className="w-4 h-4 text-green-600" /> : <PowerOff className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button onClick={() => startEdit(server)} className="p-1.5 rounded hover:bg-gray-100"><Edit className="w-4 h-4 text-gray-600" /></button>
                      <button onClick={() => setServerToDelete(server)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="text-gray-500">Username</div><div className="text-gray-800 font-mono">{server.username}</div>
                    <div className="text-gray-500">TLS</div><div className="text-gray-800">{server.use_tls ? "Yes" : "No"}{server.allow_insecure ? " (insecure)" : ""}</div>
                    <div className="text-gray-500">Last sync</div>
                    <div className="text-gray-800 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400" />
                      {server.last_sync_at ? new Date(server.last_sync_at).toLocaleString() : "Never"}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
                    {/* Test */}
                    <Button variant="secondary" icon={Link2} onClick={() => handleTest(server)}
                      disabled={testStatus[server.id] === "testing"}>
                      {testStatus[server.id] === "testing" ? "Testing…" : "Test"}
                    </Button>
                    {renderTestBadge(server.id)}

                    <div className="h-4 w-px bg-gray-200 mx-1" />

                    {/* Import */}
                    <button onClick={() => openPanel(server, "import")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${panelServerId === server.id && panelMode === "import" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white border-gray-300 text-gray-700 hover:bg-cyan-50 hover:border-cyan-400 hover:text-cyan-700"}`}>
                      <Download size={14} />
                      Import from Router
                      {panelServerId === server.id && panelMode === "import" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    {/* Push */}
                    <button onClick={() => openPanel(server, "push")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${panelServerId === server.id && panelMode === "push" ? "bg-orange-600 text-white border-orange-600" : "bg-white border-gray-300 text-gray-700 hover:bg-orange-50 hover:border-orange-400 hover:text-orange-700"}`}>
                      <Upload size={14} />
                      Push to Router
                      {panelServerId === server.id && panelMode === "push" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>

                {/* Expandable sync panels */}
                {panelServerId === server.id && panelMode === "import" && renderImportPanel(server)}
                {panelServerId === server.id && panelMode === "push" && renderPushPanel(server)}
              </div>
            )
          )}
        </div>
      )}

      <div className="text-sm text-gray-500">
        {servers.length} server{servers.length !== 1 ? "s" : ""} configured
        {servers.filter(s => s.enabled).length !== servers.length && ` · ${servers.filter(s => s.enabled).length} enabled`}
      </div>

      <ConfirmDialog isOpen={!!serverToDelete} onClose={() => setServerToDelete(null)} onConfirm={handleDelete}
        title="Delete MikroTik Server"
        message={`Delete "${serverToDelete?.name}" (${serverToDelete?.host})? Users synced from this server will remain in the database.`}
        confirmText={deleteLoading ? "Deleting…" : "Delete"} cancelText="Cancel" variant="danger" />
    </div>
  );
}
