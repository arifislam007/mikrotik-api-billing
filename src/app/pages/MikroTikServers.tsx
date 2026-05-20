import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  Server,
  Plus,
  Edit,
  Trash2,
  Link2,
  Check,
  X,
  RefreshCw,
  Star,
  StarOff,
  Power,
  PowerOff,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { mikrotikService } from "../services/api";

interface MikroTikServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  use_tls: boolean;
  allow_insecure: boolean;
  is_default: boolean;
  enabled: boolean;
  last_sync_at?: string | null;
  created_at?: string;
}

const emptyForm = {
  name: "",
  host: "",
  port: 8728,
  username: "",
  password: "",
  use_tls: false,
  allow_insecure: false,
  is_default: false,
  enabled: true,
};

type TestStatus = "idle" | "testing" | "ok" | "error";

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

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const data = await mikrotikService.getServers();
      setServers(data);
    } catch (err) {
      console.error("Failed to fetch servers:", err);
    } finally {
      setLoading(false);
    }
  };

  const flash = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(""), 3500);
  };

  const handleAdd = async () => {
    setAddError("");
    if (!addForm.name.trim() || !addForm.host.trim() || !addForm.username.trim() || !addForm.password.trim()) {
      setAddError("Name, host, username and password are all required");
      return;
    }
    try {
      setAddLoading(true);
      const result = await mikrotikService.createServer({
        ...addForm,
        port: Number(addForm.port) || 8728,
      });
      if (addForm.is_default) {
        setServers((prev) => prev.map((s) => ({ ...s, is_default: false })));
      }
      setServers((prev) => [result, ...prev]);
      setAddForm(emptyForm);
      setShowAddForm(false);
      flash("Server added successfully");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setAddLoading(false);
    }
  };

  const startEdit = (server: MikroTikServer) => {
    setEditingId(server.id);
    setEditForm({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      password: "",
      use_tls: server.use_tls,
      allow_insecure: server.allow_insecure,
      is_default: server.is_default,
      enabled: server.enabled,
    });
    setEditError("");
  };

  const handleUpdate = async (id: string) => {
    setEditError("");
    if (!editForm.name.trim() || !editForm.host.trim() || !editForm.username.trim()) {
      setEditError("Name, host and username are required");
      return;
    }
    try {
      setEditLoading(true);
      const result = await mikrotikService.updateServer(id, {
        ...editForm,
        port: Number(editForm.port) || 8728,
        password: editForm.password.trim() || undefined,
      });
      if (editForm.is_default) {
        setServers((prev) => prev.map((s) => ({ ...s, is_default: s.id === id ? true : false })));
      }
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...result } : s)));
      setEditingId(null);
      flash("Server updated");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update server");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!serverToDelete) return;
    try {
      setDeleteLoading(true);
      await mikrotikService.deleteServer(serverToDelete.id);
      setServers((prev) => prev.filter((s) => s.id !== serverToDelete.id));
      flash("Server deleted");
    } catch (err) {
      console.error("Failed to delete server:", err);
    } finally {
      setDeleteLoading(false);
      setServerToDelete(null);
    }
  };

  const handleTest = async (server: MikroTikServer) => {
    setTestStatus((p) => ({ ...p, [server.id]: "testing" }));
    setTestMessage((p) => ({ ...p, [server.id]: "" }));
    try {
      const result = await mikrotikService.testServer(server.id);
      const identity = result?.identity?.name ? ` — ${result.identity.name}` : "";
      setTestStatus((p) => ({ ...p, [server.id]: "ok" }));
      setTestMessage((p) => ({ ...p, [server.id]: `Connected${identity}` }));
    } catch (err) {
      setTestStatus((p) => ({ ...p, [server.id]: "error" }));
      setTestMessage((p) => ({ ...p, [server.id]: err instanceof Error ? err.message : "Connection failed" }));
    }
  };

  const handleToggleEnabled = async (server: MikroTikServer) => {
    try {
      const result = await mikrotikService.updateServer(server.id, { enabled: !server.enabled });
      setServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, ...result } : s)));
    } catch (err) {
      console.error("Failed to toggle server:", err);
    }
  };

  const handleSetDefault = async (server: MikroTikServer) => {
    if (server.is_default) return;
    try {
      const result = await mikrotikService.updateServer(server.id, { is_default: true });
      setServers((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, ...result } : { ...s, is_default: false }))
      );
      flash(`"${server.name}" set as default`);
    } catch (err) {
      console.error("Failed to set default:", err);
    }
  };

  const renderTestBadge = (id: string) => {
    const status = testStatus[id];
    const msg = testMessage[id];
    if (!status || status === "idle") return null;
    if (status === "testing") return <span className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Testing...</span>;
    if (status === "ok") return <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {msg}</span>;
    return <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {msg}</span>;
  };

  const FormFields = ({
    form,
    onChange,
    isEdit = false,
  }: {
    form: typeof emptyForm;
    onChange: (patch: Partial<typeof emptyForm>) => void;
    isEdit?: boolean;
  }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Server Name *</label>
          <input
            placeholder="e.g. Main Router"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Host / IP *</label>
          <input
            placeholder="192.168.88.1"
            value={form.host}
            onChange={(e) => onChange({ host: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
          <input
            type="number"
            placeholder="8728"
            value={form.port}
            onChange={(e) => onChange({ port: Number(e.target.value) || 8728 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
          <input
            placeholder="admin"
            value={form.username}
            onChange={(e) => onChange({ username: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Password {isEdit && <span className="text-gray-400">(leave blank to keep current)</span>}
            {!isEdit && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="password"
            placeholder={isEdit ? "••••••••" : "password"}
            value={form.password}
            onChange={(e) => onChange({ password: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.use_tls} onChange={(e) => onChange({ use_tls: e.target.checked })} className="rounded" />
          Use TLS / HTTPS
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.allow_insecure} onChange={(e) => onChange({ allow_insecure: e.target.checked })} className="rounded" />
          Allow insecure TLS
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.is_default} onChange={(e) => onChange({ is_default: e.target.checked })} className="rounded" />
          Set as default server
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} className="rounded" />
          Enabled
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MikroTik Servers</h1>
          <p className="text-gray-600 mt-1">Manage RouterOS API connections — multiple servers supported</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchServers}>Refresh</Button>
          <Button icon={Plus} onClick={() => { setShowAddForm((p) => !p); setAddError(""); }}>
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
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">New MikroTik Server</h2>
            </div>
            <button onClick={() => { setShowAddForm(false); setAddError(""); }} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <FormFields form={addForm} onChange={(patch) => setAddForm((p) => ({ ...p, ...patch }))} />
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleAdd} disabled={addLoading}>
              {addLoading ? "Adding..." : "Add Server"}
            </Button>
            <Button variant="secondary" onClick={() => { setShowAddForm(false); setAddError(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Server List */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-gray-500">Loading servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Server className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No MikroTik servers configured</p>
          <p className="text-gray-400 text-sm mt-1">Click "Add Server" to connect your first RouterOS device</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {servers.map((server) =>
            editingId === server.id ? (
              /* ── Edit card ── */
              <div key={server.id} className="bg-white rounded-lg border-2 border-blue-400 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-gray-900">Editing: {server.name}</span>
                  </div>
                  <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <FormFields
                  form={editForm}
                  onChange={(patch) => setEditForm((p) => ({ ...p, ...patch }))}
                  isEdit
                />
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <Button onClick={() => handleUpdate(server.id)} disabled={editLoading}>
                    {editLoading ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              /* ── View card ── */
              <div
                key={server.id}
                className={`bg-white rounded-lg border shadow-sm p-5 space-y-4 transition-all ${
                  server.is_default ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"
                } ${!server.enabled ? "opacity-60" : ""}`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${server.enabled ? "bg-blue-100" : "bg-gray-100"}`}>
                      <Server className={`w-5 h-5 ${server.enabled ? "text-blue-600" : "text-gray-400"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">{server.name}</h3>
                        {server.is_default && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium flex-shrink-0">
                            Default
                          </span>
                        )}
                        {!server.enabled && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full flex-shrink-0">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 font-mono mt-0.5">
                        {server.use_tls ? "https" : "http"}://{server.host}:{server.port}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleSetDefault(server)}
                      title={server.is_default ? "Already default" : "Set as default"}
                      className={`p-1.5 rounded hover:bg-yellow-50 transition-colors ${server.is_default ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"}`}
                    >
                      {server.is_default ? <Star className="w-4 h-4 fill-yellow-400" /> : <StarOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleToggleEnabled(server)}
                      title={server.enabled ? "Disable server" : "Enable server"}
                      className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    >
                      {server.enabled
                        ? <Power className="w-4 h-4 text-green-600" />
                        : <PowerOff className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button onClick={() => startEdit(server)} title="Edit" className="p-1.5 rounded hover:bg-gray-100 transition-colors">
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => setServerToDelete(server)} title="Delete" className="p-1.5 rounded hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="text-gray-500">Username</div>
                  <div className="text-gray-800 font-mono">{server.username}</div>
                  <div className="text-gray-500">TLS</div>
                  <div className="text-gray-800">{server.use_tls ? "Yes" : "No"}{server.allow_insecure ? " (insecure)" : ""}</div>
                  <div className="text-gray-500">Last sync</div>
                  <div className="text-gray-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {server.last_sync_at ? new Date(server.last_sync_at).toLocaleString() : "Never"}
                  </div>
                </div>

                {/* Test connection row */}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                  <Button
                    variant="secondary"
                    icon={Link2}
                    onClick={() => handleTest(server)}
                    disabled={testStatus[server.id] === "testing"}
                  >
                    {testStatus[server.id] === "testing" ? "Testing..." : "Test Connection"}
                  </Button>
                  {renderTestBadge(server.id)}
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="text-sm text-gray-500">
        {servers.length} server{servers.length !== 1 ? "s" : ""} configured
        {servers.filter((s) => s.enabled).length !== servers.length &&
          ` · ${servers.filter((s) => s.enabled).length} enabled`}
      </div>

      <ConfirmDialog
        isOpen={!!serverToDelete}
        onClose={() => setServerToDelete(null)}
        onConfirm={handleDelete}
        title="Delete MikroTik Server"
        message={`Delete "${serverToDelete?.name}" (${serverToDelete?.host})? This cannot be undone and users synced from this server will remain in the database.`}
        confirmText={deleteLoading ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
