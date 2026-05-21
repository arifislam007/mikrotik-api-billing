import { ConfigTable } from "./ConfigTable";

export function Zones() {
  return <ConfigTable title="Zones" subtitle="Geographic billing zones" endpoint="zones"
    fields={[
      { key: "name", label: "Zone Name", required: true, placeholder: "e.g. Mirpur" },
      { key: "description", label: "Description", placeholder: "Short description", type: "textarea" },
    ]} />;
}

export function SubZones() {
  return <ConfigTable title="Sub Zones" subtitle="Sub-areas within zones" endpoint="sub_zones"
    fields={[
      { key: "name", label: "Sub Zone Name", required: true, placeholder: "e.g. Mirpur-10" },
      { key: "zone_id", label: "Zone ID", placeholder: "Parent zone ID" },
    ]} />;
}

export function Boxes() {
  return <ConfigTable title="Boxes" subtitle="Physical distribution boxes" endpoint="boxes"
    fields={[
      { key: "name", label: "Box Name", required: true, placeholder: "e.g. Box-A1" },
      { key: "location", label: "Location / Notes", placeholder: "Physical location" },
    ]} />;
}

export function ConnectionTypes() {
  return <ConfigTable title="Connection Types" subtitle="e.g. Optical Fiber, Cable, Wireless" endpoint="connection_types"
    fields={[
      { key: "name", label: "Name", required: true, placeholder: "e.g. Optical Fiber" },
      { key: "description", label: "Description", placeholder: "Short description" },
    ]} />;
}

export function ClientTypes() {
  return <ConfigTable title="Client Types" subtitle="e.g. Home, Corporate, Waiver" endpoint="client_types"
    fields={[
      { key: "name", label: "Name", required: true, placeholder: "e.g. Home" },
      { key: "description", label: "Description", placeholder: "Short description" },
    ]} />;
}

export function IspPackages() {
  return <ConfigTable title="ISP Packages" subtitle="Bandwidth packages with speed and pricing" endpoint="isp_packages"
    fields={[
      { key: "name",              label: "Package Name",       required: true, placeholder: "e.g. 20 Mbps Home" },
      { key: "mikrotik_profile",  label: "MikroTik Profile",   required: true, placeholder: "e.g. 20M" },
      { key: "speed_down",        label: "Speed Down",         placeholder: "e.g. 20M" },
      { key: "speed_up",          label: "Speed Up",           placeholder: "e.g. 5M" },
      { key: "monthly_bill",      label: "Monthly Bill (৳)",   type: "number", placeholder: "0" },
      { key: "description",       label: "Description",        placeholder: "Optional notes" },
    ]} />;
}
