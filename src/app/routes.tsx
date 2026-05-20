import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { UserManagement } from "./pages/UserManagement";
import { Billing } from "./pages/Billing";
import { Resellers } from "./pages/Resellers";
import { Locations } from "./pages/Locations";
import { Reports } from "./pages/Reports";
import { MikroTikServers } from "./pages/MikroTikServers";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "users", Component: UserManagement },
      { path: "mikrotik", Component: MikroTikServers },
      { path: "billing", Component: Billing },
      { path: "resellers", Component: Resellers },
      { path: "locations", Component: Locations },
      { path: "reports", Component: Reports },
    ],
  },
]);
