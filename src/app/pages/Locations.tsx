import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { SearchInput } from "../components/SearchInput";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Plus, MapPin, ChevronRight, ChevronDown, Users, Activity, Trash2, X } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { locationService } from "../services/api";

interface Location {
  id: string;
  name: string;
  address?: string;
  type: "region" | "area";
  parent_id?: string | null;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

export function Locations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [newLocationType, setNewLocationType] = useState<"region" | "area">("region");
  const [selectedParent, setSelectedParent] = useState<string>("");
  const [formError, setFormError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const data = await locationService.getAll();
      setLocations(data);
      const regions = data.filter((l: Location) => l.type === "region").map((l: Location) => l.id);
      setExpandedRegions(new Set(regions.slice(0, 2)));
    } catch (err) {
      console.error("Failed to fetch locations:", err);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(""), 3000);
  };

  const handleAddLocation = async () => {
    setFormError("");
    if (!newLocationName.trim()) { setFormError("Location name is required"); return; }
    if (newLocationType === "area" && !selectedParent) { setFormError("Select a parent region for area type"); return; }
    try {
      const result = await locationService.create({
        name: newLocationName.trim(),
        address: newLocationAddress.trim() || null,
        type: newLocationType,
        parent_id: newLocationType === "area" ? selectedParent : null,
      });
      setLocations((prev) => [...prev, result]);
      setNewLocationName("");
      setNewLocationAddress("");
      setNewLocationType("region");
      setSelectedParent("");
      setShowAddDialog(false);
      showMessage("Location added");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add location");
    }
  };

  const handleDeleteLocation = async () => {
    if (!locationToDelete) return;
    try {
      await locationService.delete(locationToDelete.id);
      setLocations((prev) => prev.filter((loc) => loc.id !== locationToDelete.id && loc.parent_id !== locationToDelete.id));
      showMessage("Location deleted");
    } catch (err) {
      console.error("Failed to delete location:", err);
    }
    setLocationToDelete(null);
  };

  const toggleRegion = (regionId: string) => {
    const next = new Set(expandedRegions);
    next.has(regionId) ? next.delete(regionId) : next.add(regionId);
    setExpandedRegions(next);
  };

  const regions = locations.filter((loc) => loc.type === "region");
  const filteredLocations = locations.filter((loc) =>
    loc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const chartData = regions
    .filter((r) => filteredLocations.some((f) => f.id === r.id))
    .map((region) => {
      const areaCount = locations.filter((l) => l.parent_id === region.id).length;
      return { name: region.name, value: areaCount + 1 };
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Location Management</h1>
          <p className="text-gray-600 mt-1">Manage regions and areas</p>
        </div>
        <Button icon={Plus} onClick={() => setShowAddDialog(true)}>Add Location</Button>
      </div>

      {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Regions</p>
              <p className="text-3xl font-semibold text-gray-900">{regions.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <MapPin className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Areas</p>
              <p className="text-3xl font-semibold text-gray-900">{locations.filter((l) => l.type === "area").length}</p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Locations</p>
              <p className="text-3xl font-semibold text-gray-900">{locations.length}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Location Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="max-w-md">
          <SearchInput placeholder="Search locations..." value={searchTerm} onChange={setSearchTerm} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-5">Location</div>
            <div className="col-span-3">Address</div>
            <div className="col-span-3">Type</div>
            <div className="col-span-1">Actions</div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="text-center py-12"><p className="text-gray-500">Loading locations...</p></div>
          ) : filteredLocations.filter((loc) => loc.type === "region").length === 0 ? (
            <div className="text-center py-12"><p className="text-gray-500">No locations found</p></div>
          ) : (
            filteredLocations
              .filter((loc) => loc.type === "region")
              .map((region) => {
                const isExpanded = expandedRegions.has(region.id);
                const areas = filteredLocations.filter((loc) => loc.parent_id === region.id);

                return (
                  <div key={region.id}>
                    <div className="px-6 py-4 hover:bg-gray-50">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-5">
                          <button
                            onClick={() => toggleRegion(region.id)}
                            className="flex items-center gap-2 text-left w-full group"
                          >
                            {areas.length > 0 && (
                              <span className="text-gray-400 group-hover:text-gray-600">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </span>
                            )}
                            <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <span className="font-medium text-gray-900">{region.name}</span>
                            {areas.length > 0 && <span className="text-xs text-gray-400">({areas.length} areas)</span>}
                          </button>
                        </div>
                        <div className="col-span-3 text-gray-600 text-sm">{region.address || "—"}</div>
                        <div className="col-span-3">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Region</span>
                        </div>
                        <div className="col-span-1">
                          <button onClick={() => setLocationToDelete(region)} className="p-1 hover:bg-red-100 rounded" title="Delete">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && areas.map((area) => (
                      <div key={area.id} className="px-6 py-4 bg-gray-50 hover:bg-gray-100">
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-5">
                            <div className="flex items-center gap-2 pl-6">
                              <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <span className="text-gray-900">{area.name}</span>
                            </div>
                          </div>
                          <div className="col-span-3 text-gray-600 text-sm">{area.address || "—"}</div>
                          <div className="col-span-3">
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Area</span>
                          </div>
                          <div className="col-span-1">
                            <button onClick={() => setLocationToDelete(area)} className="p-1 hover:bg-red-100 rounded" title="Delete">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
          )}
        </div>
      </div>

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-gray-900/50" onClick={() => { setShowAddDialog(false); setFormError(""); }} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add New Location</h3>
              <button onClick={() => { setShowAddDialog(false); setFormError(""); }} className="p-1 hover:bg-gray-100 rounded-md">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="e.g., Dhaka North, Chittagong"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={newLocationAddress}
                  onChange={(e) => setNewLocationAddress(e.target.value)}
                  placeholder="Optional address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
                <select
                  value={newLocationType}
                  onChange={(e) => { setNewLocationType(e.target.value as "region" | "area"); setSelectedParent(""); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="region">Region</option>
                  <option value="area">Area</option>
                </select>
              </div>
              {newLocationType === "area" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Region *</label>
                  <select
                    value={selectedParent}
                    onChange={(e) => setSelectedParent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a region</option>
                    {regions.map((region) => (
                      <option key={region.id} value={region.id}>{region.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setShowAddDialog(false); setFormError(""); }}>Cancel</Button>
                <Button className="flex-1" onClick={handleAddLocation}>Add Location</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!locationToDelete}
        onClose={() => setLocationToDelete(null)}
        onConfirm={handleDeleteLocation}
        title="Delete Location"
        message={`Delete "${locationToDelete?.name}"?${locationToDelete?.type === "region" ? " All child areas will also be deleted." : ""} This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
