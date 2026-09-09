import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { FeatureFlagProvider } from "./context/FeatureFlagContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import FeatureGate from "./components/FeatureGate";

// Auth pages
import LoginPage from "./pages/LoginPage";
import RegisterGate from "./components/RegisterGate"; // password-protected internal signup
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
import EmailPage                from "./pages/EmailPage";
import NumberPage               from "./pages/NumberPage";
import CompaniesPage            from "./pages/CompaniesPage";
import CategoryExplorerPage     from "./pages/CategoryExplorerPage";
import CityExplorerPage         from "./pages/CityExplorerPage";
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

import { ThemeProvider } from "./context/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FeatureFlagProvider>
          <PageTracker />
          <Routes>
            {/* ── Public routes ─────────────────────────────────── */}
            <Route path="/"                element={<LandingPage />} />
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/register"        element={<RegisterGate />} />
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

              <Route path="pipeline"         element={<FeatureGate featureKey="pipeline"><PipelinePage /></FeatureGate>} />
              <Route path="icp"              element={<FeatureGate featureKey="icp"><IcpPage /></FeatureGate>} />
              <Route path="scheduler"        element={<FeatureGate featureKey="scheduler"><SchedulerPage /></FeatureGate>} />
              <Route path="sheets"           element={<FeatureGate featureKey="sheets"><SheetsPage /></FeatureGate>} />
              <Route path="leads"            element={<FeatureGate featureKey="leads"><LeadsPage /></FeatureGate>} />
              <Route path="settings"         element={<FeatureGate featureKey="settings"><SettingsPage /></FeatureGate>} />
              {/* Crawler */}
              <Route path="crawler"          element={<FeatureGate featureKey="crawler"><CrawlerPage /></FeatureGate>} />
              <Route path="places"           element={<FeatureGate featureKey="places_scraper"><PlacesPage /></FeatureGate>} />
              <Route path="websites"         element={<FeatureGate featureKey="websites_crawler"><WebsitesPage /></FeatureGate>} />
              <Route path="auto-scraper"     element={<FeatureGate featureKey="auto_scraper"><AutoScraperPage /></FeatureGate>} />
              {/* Autonomous SDR */}
              <Route path="autonomousagents"      element={<FeatureGate featureKey="autonomous_agents"><AutonomousAgentsPage /></FeatureGate>} />
              <Route path="autonomousagents/:id"  element={<FeatureGate featureKey="autonomous_agents"><AutonomousAgentDetailPage /></FeatureGate>} />
              {/* Social Media */}
              <Route path="social"           element={<FeatureGate featureKey="social_media"><SocialMediaPage /></FeatureGate>} />
              {/* Smart Outreach */}
              <Route path="outreach"         element={<FeatureGate featureKey="smart_outreach"><SmartOutreachPage /></FeatureGate>} />
              {/* Documentation */}
              <Route path="docs"             element={<FeatureGate featureKey="docs"><DocumentationPage /></FeatureGate>} />
              {/* AI ChatBot */}
              <Route path="chatbot"          element={<FeatureGate featureKey="chatbot"><ChatbotPage /></FeatureGate>} />
              <Route path="chatbot/data"     element={<FeatureGate featureKey="chatbot_data"><ChatbotDataPage /></FeatureGate>} />
              {/* Lead Generator */}
              <Route path="lg/database"      element={<FeatureGate featureKey="inbuild_db"><LeadDatabasePage /></FeatureGate>} />
              <Route path="inbuild-db"        element={<FeatureGate featureKey="inbuild_db"><InBuildDatabasePage /></FeatureGate>} />
              <Route path="public-data"       element={<FeatureGate featureKey="public_data"><PublicDataPage /></FeatureGate>} />
              <Route path="public-data2"      element={<FeatureGate featureKey="public_data"><PublicData2Page /></FeatureGate>} />
              <Route path="india-data"        element={<FeatureGate featureKey="india_data"><IndiaDataPage /></FeatureGate>} />
              <Route path="db-intelligence"   element={<FeatureGate featureKey="db_intelligence"><DatabaseIntelligencePage /></FeatureGate>} />
              <Route path="people"            element={<FeatureGate featureKey="people"><PeoplePage /></FeatureGate>} />
              <Route path="people-email"      element={<FeatureGate featureKey="people"><PeopleEmailPage /></FeatureGate>} />
              <Route path="people-number"     element={<FeatureGate featureKey="people"><PeopleNumberPage /></FeatureGate>} />
              <Route path="email"             element={<FeatureGate featureKey="emails"><EmailPage /></FeatureGate>} />
              <Route path="number"            element={<FeatureGate featureKey="numbers"><NumberPage /></FeatureGate>} />
              <Route path="categories"        element={<FeatureGate featureKey="categories"><CategoryExplorerPage /></FeatureGate>} />
              <Route path="cities"            element={<FeatureGate featureKey="cities"><CityExplorerPage /></FeatureGate>} />
              <Route path="companies"         element={<FeatureGate featureKey="companies"><CompaniesPage /></FeatureGate>} />
              <Route path="lg/linkedin"      element={<FeatureGate featureKey="lg_linkedin"><LinkedInFinderPage /></FeatureGate>} />
              <Route path="lg/email"         element={<FeatureGate featureKey="lg_email"><EmailFinderPage /></FeatureGate>} />
              <Route path="lg/companies"     element={<FeatureGate featureKey="lg_companies"><CompanyIntelPage /></FeatureGate>} />
              <Route path="lg/research"      element={<FeatureGate featureKey="lg_research"><AIResearchAgentPage /></FeatureGate>} />
              <Route path="lg/auto-lead-gen" element={<FeatureGate featureKey="lg_auto_lead_gen"><AutoLeadGenPage /></FeatureGate>} />
              {/* CRM */}
              <Route path="crm/pipeline"     element={<FeatureGate featureKey="crm_pipeline"><CrmPipelinePage /></FeatureGate>} />
              <Route path="crm/dashboard"    element={<FeatureGate featureKey="crm_dashboard"><CrmDashboardPage /></FeatureGate>} />
              <Route path="crm/deals/:id"    element={<FeatureGate featureKey="crm_pipeline"><DealDetailPage /></FeatureGate>} />
              <Route path="crm/activities"   element={<FeatureGate featureKey="crm_activities"><CrmActivitiesPage /></FeatureGate>} />
              <Route path="crm/quotations"   element={<FeatureGate featureKey="crm_quotations"><CrmQuotationsPage /></FeatureGate>} />
              <Route path="crm/invoices"     element={<FeatureGate featureKey="crm_invoices"><CrmInvoicesPage /></FeatureGate>} />
              {/* ERP */}
              <Route path="accounting"       element={<FeatureGate featureKey="accounting"><AccountingPage /></FeatureGate>} />
              <Route path="inventory"        element={<FeatureGate featureKey="inventory"><InventoryPage /></FeatureGate>} />
              <Route path="payroll"          element={<FeatureGate featureKey="payroll"><PayrollPage /></FeatureGate>} />
              {/* Admin */}
              <Route path="admin"            element={<FeatureGate featureKey="admin"><AdminAnalyticsPage /></FeatureGate>} />

            </Route>

            {/* ── 404 catch-all → redirect to login ─────────────── */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </FeatureFlagProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
