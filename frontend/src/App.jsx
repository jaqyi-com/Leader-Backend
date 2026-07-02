import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

// Auth pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// App pages
import DashboardPage from "./pages/DashboardPage";
import PipelinePage from "./pages/PipelinePage";
import SchedulerPage from "./pages/SchedulerPage";
import SheetsPage from "./pages/SheetsPage";
import LeadsPage from "./pages/LeadsPage";
import IcpPage from "./pages/IcpPage";
import CrawlerPage from "./pages/CrawlerPage";
import PlacesPage from "./pages/PlacesPage";
import WebsitesPage from "./pages/WebsitesPage";
import AutoScraperPage from "./pages/AutoScraperPage";
import AutonomousAgentsPage from "./pages/AutonomousAgentsPage";
import AutonomousAgentDetailPage from "./pages/AutonomousAgentDetailPage";
import LandingPage from "./pages/LandingPage";
import SettingsPage from "./pages/SettingsPage";
import SocialMediaPage from "./pages/SocialMediaPage";
import SmartOutreachPage from "./pages/SmartOutreachPage";
import ChatbotPage from "./pages/ChatbotPage";
import ChatbotDataPage from "./pages/ChatbotDataPage";
import DocumentationPage from "./pages/DocumentationPage";
// Lead Generator
import LeadDatabasePage   from "./pages/lg/LeadDatabasePage";
import LinkedInFinderPage from "./pages/lg/LinkedInFinderPage";
import EmailFinderPage    from "./pages/lg/EmailFinderPage";
import CompanyIntelPage   from "./pages/lg/CompanyIntelPage";
import AIResearchAgentPage from "./pages/lg/AIResearchAgentPage";
import AutoLeadGenPage    from "./pages/lg/AutoLeadGenPage";
import InBuildDatabasePage      from "./pages/InBuildDatabasePage";
import DatabaseIntelligencePage from "./pages/DatabaseIntelligencePage";
import PublicDataPage           from "./pages/PublicDataPage";
import PublicData2Page          from "./pages/PublicData2Page";
import IndiaDataPage            from "./pages/IndiaDataPage";
import PeoplePage               from "./pages/PeoplePage";
import PeopleEmailPage          from "./pages/PeopleEmailPage";
import PeopleNumberPage         from "./pages/PeopleNumberPage";
import CompaniesPage            from "./pages/CompaniesPage";
import CategoryExplorerPage     from "./pages/CategoryExplorerPage";
// CRM
import CrmPipelinePage    from "./pages/crm/CrmPipelinePage";
import CrmDashboardPage   from "./pages/crm/CrmDashboardPage";
import DealDetailPage     from "./pages/crm/DealDetailPage";
import CrmActivitiesPage  from "./pages/crm/CrmActivitiesPage";
import CrmQuotationsPage  from "./pages/crm/CrmQuotationsPage";
import CrmInvoicesPage    from "./pages/crm/CrmInvoicesPage";
// ERP
import AccountingPage     from "./pages/accounting/AccountingPage";
import InventoryPage      from "./pages/inventory/InventoryPage";
import PayrollPage        from "./pages/payroll/PayrollPage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import PageTracker        from "./components/PageTracker";
import LocationIQPage     from "./pages/LocationIQPage";
import LocationAnalysisPage from "./pages/LocationAnalysisPage";

import { ThemeProvider } from "./context/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
          <PageTracker />
        <Routes>
          {/* ── Public routes ─────────────────────────────────── */}
          <Route path="/"                element={<LandingPage />} />
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/auth/callback"   element={<AuthCallbackPage />} />
          <Route path="/verify-email"    element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* ── Protected app routes ───────────────────────────── */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/app/chatbot" replace />} />

            <Route path="pipeline"         element={<PipelinePage />} />
            <Route path="icp"              element={<IcpPage />} />
            <Route path="scheduler"        element={<SchedulerPage />} />
            <Route path="sheets"           element={<SheetsPage />} />
            <Route path="leads"            element={<LeadsPage />} />
            <Route path="settings"         element={<SettingsPage />} />
            {/* Crawler */}
            <Route path="crawler"       element={<CrawlerPage />} />
            <Route path="places"        element={<PlacesPage />} />
            <Route path="websites"      element={<WebsitesPage />} />
            <Route path="auto-scraper"  element={<AutoScraperPage />} />
            {/* Autonomous SDR */}
            <Route path="autonomousagents"      element={<AutonomousAgentsPage />} />
            <Route path="autonomousagents/:id"  element={<AutonomousAgentDetailPage />} />
            {/* Social Media */}
            <Route path="social" element={<SocialMediaPage />} />
            {/* Smart Outreach */}
            <Route path="outreach" element={<SmartOutreachPage />} />
            {/* Documentation */}
            <Route path="docs"           element={<DocumentationPage />} />
            {/* AI ChatBot */}
            <Route path="chatbot" element={<ChatbotPage />} />
            <Route path="chatbot/data" element={<ChatbotDataPage />} />
            {/* Lead Generator */}
            <Route path="lg/database"       element={<LeadDatabasePage />} />
            <Route path="inbuild-db"         element={<InBuildDatabasePage />} />
            <Route path="public-data"         element={<PublicDataPage />} />
            <Route path="public-data2"        element={<PublicData2Page />} />
            <Route path="india-data"          element={<IndiaDataPage />} />
            <Route path="db-intelligence"     element={<DatabaseIntelligencePage />} />
            <Route path="people"              element={<PeoplePage />} />
            <Route path="people-email"        element={<PeopleEmailPage />} />
            <Route path="people-number"       element={<PeopleNumberPage />} />
            <Route path="categories"          element={<CategoryExplorerPage />} />
            <Route path="companies"           element={<CompaniesPage />} />
            <Route path="lg/linkedin"       element={<LinkedInFinderPage />} />
            <Route path="lg/email"          element={<EmailFinderPage />} />
            <Route path="lg/companies"      element={<CompanyIntelPage />} />
            <Route path="lg/research"       element={<AIResearchAgentPage />} />
            <Route path="lg/auto-lead-gen"  element={<AutoLeadGenPage />} />
            {/* CRM */}
            <Route path="crm/pipeline"      element={<CrmPipelinePage />} />
            <Route path="crm/dashboard"     element={<CrmDashboardPage />} />
            <Route path="crm/deals/:id"     element={<DealDetailPage />} />
            <Route path="crm/activities"    element={<CrmActivitiesPage />} />
            <Route path="crm/quotations"    element={<CrmQuotationsPage />} />
            <Route path="crm/invoices"      element={<CrmInvoicesPage />} />
            {/* ERP */}
            <Route path="accounting"        element={<AccountingPage />} />
            <Route path="inventory"         element={<InventoryPage />} />
            <Route path="payroll"           element={<PayrollPage />} />
            {/* Admin */}
            <Route path="admin"             element={<AdminAnalyticsPage />} />
            {/* LocationIQ */}
            <Route path="locationiq"        element={<LocationIQPage />} />
            <Route path="location-analysis" element={<LocationAnalysisPage />} />

          </Route>

          {/* ── 404 catch-all → redirect to login ─────────────── */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
