import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { SearchInput } from "../components/SearchInput";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Plus, Edit, Power, PowerOff, Filter, Server, RefreshCw, Download, Link2, Trash2, X, Check, ExternalLink } from "lucide-react";
import { mikrotikService, userService } from "../services/api";

interface User {
  id: string;
  username: string;
  profile: string;
  billing_package?: string | null;
  billing_price?: number | string | null;
  status: "active" | "disabled" | "expired";
  expiry_date: string;
  location: string;
  reseller: string;
}

interface MikroTikProfile {
  name: string;
  rate_limit?: string;
  comment?: string;
}

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
  last_sync_at?: string;
}

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [userToToggle, setUserToToggle] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<MikroTikServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [profiles, setProfiles] = useState<MikroTikProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<"import" | "sync" | "test" | null>(null);
  const [serverError, setServerError] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [userError, setUserError] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    profile: "",
    billing_package: "",
    billing_price: "",
    status: "active",
    expiry_date: "",
    location: "",
    reseller: "",
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<Partial<User & { billing_price: string }>>({});
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    bootstrapData();
  }, []);

  useEffect(() => {
    if (!selectedServerId) {
      setProfiles([]);
      return;
    }

    fetchProfiles(selectedServerId);
  }, [selectedServerId]);

  const bootstrapData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchServers()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const data = await userService.getAll();
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const fetchServers = async () => {
    try {
      const data = await mikrotikService.getServers();
      setServers(data);

      if (!selectedServerId && data.length > 0) {
        const defaultServer = data.find((server: MikroTikServer) => server.is_default) || data[0];
        setSelectedServerId(defaultServer.id);
      }
    } catch (err) {
      console.error("Failed to fetch MikroTik servers:", err);
      setServerError(err instanceof Error ? err.message : "Failed to fetch MikroTik servers");
    }
  };

  const fetchProfiles = async (serverId: string) => {
    try {
      setProfilesLoading(true);
      setUserError("");

      const data = await mikrotikService.getProfiles(serverId);
      setProfiles(data);

      if (data.length > 0) {
        setNewUser((prev) => {
          const selectedProfileExists = data.some((profile) => profile.name === prev.profile);
          if (selectedProfileExists) {
            return prev;
          }

          const nextProfile = data[0].name;
          return {
            ...prev,
            profile: nextProfile,
            billing_package: prev.billing_package || nextProfile,
          };
        });
      } else {
        setNewUser((prev) => ({ ...prev, profile: "", billing_package: "" }));
      }
    } catch (err) {
      console.error("Failed to fetch MikroTik profiles:", err);
      setProfiles([]);
      setUserError(err instanceof Error ? err.message : "Failed to fetch MikroTik profiles");
    } finally {
      setProfilesLoading(false);
    }
  };


  const handleCreateUser = async () => {
    try {
      setServerError("");
      setServerMessage("");
      setUserError("");
      setUserMessage("");

      if (!newUser.username.trim()) {
        setUserError("Username is required");
        return;
      }

      if (!newUser.profile) {
        setUserError("Select a MikroTik profile first");
        return;
      }

      const result = await userService.create({
        username: newUser.username.trim(),
        profile: newUser.profile,
        billing_package: newUser.billing_package.trim() || newUser.profile,
        billing_price: newUser.billing_price === "" ? null : Number(newUser.billing_price),
        status: newUser.status,
        expiry_date: newUser.expiry_date || null,
        location: newUser.location.trim(),
        reseller: newUser.reseller.trim(),
      });

      setUsers((prev) => [result, ...prev]);
      setUserMessage(`User ${result.username} created successfully`);
      setShowAddUserForm(false);
      setNewUser({
        username: "",
        profile: profiles[0]?.name || "",
        billing_package: profiles[0]?.name || "",
        billing_price: "",
        status: "active",
        expiry_date: "",
        location: "",
        reseller: "",
      });
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to create user");
    }
  };


  const requireSelectedServer = () => {
    if (!selectedServerId) {
      setServerError("Select a MikroTik server first");
      return false;
    }
    return true;
  };

  const handleTestConnection = async () => {
    if (!requireSelectedServer()) return;

    try {
      setActionLoading("test");
      setServerError("");
      const result = await mikrotikService.testServer(selectedServerId);
      const identityName = result?.identity?.name ? ` (${result.identity.name})` : "";
      setServerMessage(`Connection successful${identityName}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "MikroTik connection failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleImportUsers = async () => {
    if (!requireSelectedServer()) return;

    try {
      setActionLoading("import");
      setServerError("");
      const result = await mikrotikService.importUsers(selectedServerId);
      setServerMessage(`Imported users: ${result.created} created, ${result.updated} updated`);
      await fetchUsers();
      await fetchServers();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to import users from MikroTik");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncUsers = async () => {
    if (!requireSelectedServer()) return;

    try {
      setActionLoading("sync");
      setServerError("");
      const result = await mikrotikService.syncUsers(selectedServerId, "both");

      const pull = result.pull
        ? `pull: ${result.pull.created} created, ${result.pull.updated} updated`
        : "pull: skipped";
      const push = result.push
        ? `push: ${result.push.created} created, ${result.push.updated} updated`
        : "push: skipped";

      setServerMessage(`Sync completed (${pull}; ${push})`);
      await fetchUsers();
      await fetchServers();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to sync users");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleUser = async (user: User) => {
    if (user.status === "active") {
      setUserToToggle(user);
      setShowConfirmDialog(true);
    } else {
      try {
        await userService.update(user.id, { ...user, status: "active" });
        setUsers(users.map((u) =>
          u.id === user.id ? { ...u, status: "active" as const } : u
        ));
      } catch (err) {
        console.error("Failed to update user:", err);
      }
    }
  };

  const confirmDisableUser = async () => {
    if (userToToggle) {
      try {
        await userService.update(userToToggle.id, { ...userToToggle, status: "disabled" });
        setUsers(users.map((u) =>
          u.id === userToToggle.id ? { ...u, status: "disabled" as const } : u
        ));
      } catch (err) {
        console.error("Failed to disable user:", err);
      }
      setShowConfirmDialog(false);
      setUserToToggle(null);
    }
  };

  const startEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditUser({
      username: user.username,
      profile: user.profile,
      billing_package: user.billing_package || "",
      billing_price: user.billing_price !== null && user.billing_price !== undefined ? String(user.billing_price) : "",
      status: user.status,
      expiry_date: user.expiry_date || "",
      location: user.location || "",
      reseller: user.reseller || "",
    });
  };

  const handleUpdateUser = async () => {
    if (!editingUserId) return;
    try {
      const result = await userService.update(editingUserId, {
        username: editUser.username,
        profile: editUser.profile,
        billing_package: editUser.billing_package || editUser.profile,
        billing_price: editUser.billing_price === "" ? null : Number(editUser.billing_price),
        status: editUser.status,
        expiry_date: editUser.expiry_date || null,
        location: editUser.location,
        reseller: editUser.reseller,
      });
      setUsers((prev) => prev.map((u) => (u.id === editingUserId ? result : u)));
      setEditingUserId(null);
      setUserMessage("User updated successfully");
      setTimeout(() => setUserMessage(""), 3000);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await userService.delete(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setUserMessage(`User ${userToDelete.username} deleted`);
      setTimeout(() => setUserMessage(""), 3000);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to delete user");
    }
    setUserToDelete(null);
    setShowDeleteDialog(false);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    const matchesLocation = locationFilter === "all" || user.location === locationFilter;
    return matchesSearch && matchesStatus && matchesLocation;
  });

  const locations = Array.from(new Set(users.map((u) => u.location)));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600" />
            MikroTik Server
          </h2>
          <Link to="/mikrotik" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Manage servers
          </Link>
        </div>

        {servers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No servers configured.{" "}
            <Link to="/mikrotik" className="text-blue-600 hover:underline">
              Add one on the MikroTik Servers page.
            </Link>
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select server</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} — {server.host}:{server.port}{server.is_default ? " [default]" : ""}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Link2} onClick={handleTestConnection} disabled={actionLoading !== null || !selectedServerId}>
                {actionLoading === "test" ? "Testing..." : "Test"}
              </Button>
              <Button variant="secondary" icon={Download} onClick={handleImportUsers} disabled={actionLoading !== null || !selectedServerId}>
                {actionLoading === "import" ? "Importing..." : "Import"}
              </Button>
              <Button icon={RefreshCw} onClick={handleSyncUsers} disabled={actionLoading !== null || !selectedServerId}>
                {actionLoading === "sync" ? "Syncing..." : "Sync"}
              </Button>
            </div>
          </div>
        )}

        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        {serverMessage ? <p className="text-sm text-green-600">{serverMessage}</p> : null}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PPPoE User Management</h1>
          <p className="text-gray-600 mt-1">Manage your PPPoE users and accounts</p>
        </div>
        <Button icon={Plus} onClick={() => setShowAddUserForm((prev) => !prev)}>
          {showAddUserForm ? "Hide Form" : "Add User"}
        </Button>
      </div>

      {showAddUserForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add PPPoE User</h2>
            <p className="text-sm text-gray-600 mt-1">
              Bandwidth profiles are loaded from the active MikroTik server. Billing package is stored separately for accounting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              placeholder="Username"
              value={newUser.username}
              onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newUser.profile}
              onChange={(e) =>
                setNewUser((prev) => ({
                  ...prev,
                  profile: e.target.value,
                  billing_package: prev.billing_package || e.target.value,
                }))
              }
              disabled={profilesLoading || profiles.length === 0}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            >
              <option value="">{profilesLoading ? "Loading MikroTik profiles..." : "Select bandwidth profile"}</option>
              {profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name}{profile.rate_limit ? ` - ${profile.rate_limit}` : ""}
                </option>
              ))}
            </select>
            <input
              placeholder="Billing package"
              value={newUser.billing_package}
              onChange={(e) => setNewUser((prev) => ({ ...prev, billing_package: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Monthly price"
              type="number"
              min="0"
              step="0.01"
              value={newUser.billing_price}
              onChange={(e) => setNewUser((prev) => ({ ...prev, billing_price: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Expiry date"
              type="date"
              value={newUser.expiry_date}
              onChange={(e) => setNewUser((prev) => ({ ...prev, expiry_date: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Location"
              value={newUser.location}
              onChange={(e) => setNewUser((prev) => ({ ...prev, location: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Reseller"
              value={newUser.reseller}
              onChange={(e) => setNewUser((prev) => ({ ...prev, reseller: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newUser.status}
              onChange={(e) => setNewUser((prev) => ({ ...prev, status: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCreateUser}
              disabled={profilesLoading || !newUser.username.trim() || !newUser.profile}
            >
              Add PPPoE User
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddUserForm(false);
                setUserError("");
                setUserMessage("");
              }}
            >
              Cancel
            </Button>
          </div>

          {selectedServerId ? (
            <p className="text-xs text-gray-500">
              Profiles loaded from {servers.find((server) => server.id === selectedServerId)?.name || "selected server"}.
            </p>
          ) : (
            <p className="text-xs text-gray-500">Select an active MikroTik server to load bandwidth profiles.</p>
          )}

          {userError ? <p className="text-sm text-red-600">{userError}</p> : null}
          {userMessage ? <p className="text-sm text-green-600">{userMessage}</p> : null}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-md">
            <SearchInput
              placeholder="Search by username..."
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </div>
          <Button variant="ghost" icon={Filter} onClick={() => setShowFilters(!showFilters)}>
            Filters
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bandwidth Profile
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Billing Package
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiry Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reseller
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) =>
                editingUserId === user.id ? (
                  <tr key={user.id} className="bg-blue-50">
                    <td className="px-3 py-2">
                      <input value={editUser.username || ""} onChange={(e) => setEditUser((p) => ({ ...p, username: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={editUser.profile || ""} onChange={(e) => setEditUser((p) => ({ ...p, profile: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">{editUser.profile || "—"}</option>
                        {profiles.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input value={editUser.billing_package || ""} onChange={(e) => setEditUser((p) => ({ ...p, billing_package: e.target.value }))} placeholder="Package" className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1" />
                      <input type="number" value={editUser.billing_price || ""} onChange={(e) => setEditUser((p) => ({ ...p, billing_price: e.target.value }))} placeholder="Price" className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={editUser.status || "active"} onChange={(e) => setEditUser((p) => ({ ...p, status: e.target.value as User["status"] }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                        <option value="expired">Expired</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" value={editUser.expiry_date || ""} onChange={(e) => setEditUser((p) => ({ ...p, expiry_date: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editUser.location || ""} onChange={(e) => setEditUser((p) => ({ ...p, location: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={editUser.reseller || ""} onChange={(e) => setEditUser((p) => ({ ...p, reseller: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={handleUpdateUser} className="p-1 hover:bg-green-100 rounded" title="Save"><Check className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setEditingUserId(null)} className="p-1 hover:bg-gray-100 rounded" title="Cancel"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{user.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-700">{user.profile || "—"}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      <div>{user.billing_package || "—"}</div>
                      <div className="text-xs text-gray-500">
                        {user.billing_price !== null && user.billing_price !== undefined && user.billing_price !== ""
                          ? `Price: ${user.billing_price}`
                          : "No billing price set"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{user.expiry_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{user.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{user.reseller}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button className="p-1 hover:bg-gray-100 rounded" title="Edit" onClick={() => startEditUser(user)}>
                          <Edit className="w-4 h-4 text-gray-600" />
                        </button>
                        {user.status === "active" ? (
                          <button className="p-1 hover:bg-gray-100 rounded" title="Disable" onClick={() => handleToggleUser(user)}>
                            <PowerOff className="w-4 h-4 text-red-600" />
                          </button>
                        ) : (
                          <button className="p-1 hover:bg-gray-100 rounded" title="Enable" onClick={() => handleToggleUser(user)}>
                            <Power className="w-4 h-4 text-green-600" />
                          </button>
                        )}
                        <button className="p-1 hover:bg-red-100 rounded" title="Delete" onClick={() => { setUserToDelete(user); setShowDeleteDialog(true); }}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found matching your criteria</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <p>
          Showing {filteredUsers.length} of {users.length} users
        </p>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false);
          setUserToToggle(null);
        }}
        onConfirm={confirmDisableUser}
        title="Disable User Account"
        message={`Are you sure you want to disable ${userToToggle?.username}? The user will lose access to their PPPoE connection immediately.`}
        confirmText="Disable User"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setUserToDelete(null);
        }}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Permanently delete ${userToDelete?.username}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}