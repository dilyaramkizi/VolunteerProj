import { createBrowserRouter, Navigate } from "react-router";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardLayout from "./layouts/DashboardLayout";
import DashboardHomeWrapper from "./pages/DashboardHomeWrapper";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";

// Volunteer pages
import OpportunitiesPage from "./pages/volunteer/OpportunitiesPage";
import SchedulePage from "./pages/volunteer/SchedulePage";

// Coordinator pages
import CreateEventPage from "./pages/coordinator/CreateEventPage";
import CoordinatorEventsPage from "./pages/coordinator/EventsPage";
import ManageGroupsPage from "./pages/coordinator/ManageGroupsPage";

export const router = createBrowserRouter([
  // Public routes
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/register",
    Component: RegisterPage,
  },
  
  // Protected dashboard routes
  {
    path: "/dashboard",
    Component: DashboardLayout,
    children: [
      { index: true, Component: DashboardHomeWrapper },
      { path: "profile", Component: ProfilePage },
      { path: "settings", Component: SettingsPage },
      { path: "opportunities", Component: OpportunitiesPage },
      { path: "schedule", Component: SchedulePage },
      { path: "create-event", Component: CreateEventPage },
      { path: "events", Component: CoordinatorEventsPage },
      { path: "groups", Component: ManageGroupsPage },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
  
  // Catch-all for unknown routes
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);