import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import PipelinePage from "./pages/PipelinePage";
import SchedulerPage from "./pages/SchedulerPage";
import SheetsPage from "./pages/SheetsPage";
import LeadsPage from "./pages/LeadsPage";
import SettingsPage from "./pages/SettingsPage";
import IcpPage from "./pages/IcpPage";
import CrawlerPage from "./pages/CrawlerPage";
import PlacesPage from "./pages/PlacesPage";
import WebsitesPage from "./pages/WebsitesPage";
import AutonomousAgentsPage from "./pages/AutonomousAgentsPage";
import AutonomousAgentDetailPage from "./pages/AutonomousAgentDetailPage";
import LandingPage from "./pages/LandingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/app" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="pipeline"  element={<PipelinePage />} />
        <Route path="icp"       element={<IcpPage />} />
        <Route path="scheduler" element={<SchedulerPage />} />
        <Route path="sheets"    element={<SheetsPage />} />
        <Route path="leads"     element={<LeadsPage />} />
        <Route path="settings"  element={<SettingsPage />} />
        {/* Crawler2 features */}
        <Route path="crawler"   element={<CrawlerPage />} />
        <Route path="places"    element={<PlacesPage />} />
        <Route path="websites"  element={<WebsitesPage />} />
        {/* Autonomous SDR Bot */}
        <Route path="autonomousagents" element={<AutonomousAgentsPage />} />
        <Route path="autonomousagents/:id" element={<AutonomousAgentDetailPage />} />
      </Route>
    </Routes>
  );
}
