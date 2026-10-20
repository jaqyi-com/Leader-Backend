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
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";
import JoinPage from "./pages/JoinPage";
import SettingsPage from "./pages/SettingsPage";
import DocumentationPage from "./pages/DocumentationPage";
import PeoplePage               from "./pages/PeoplePage";
import PeopleEmailPage          from "./pages/PeopleEmailPage";
import PeopleNumberPage         from "./pages/PeopleNumberPage";
import EmailPage                from "./pages/EmailPage";
import NumberPage               from "./pages/NumberPage";
import CompaniesPage            from "./pages/CompaniesPage";
import CategoryExplorerPage     from "./pages/CategoryExplorerPage";
import CityExplorerPage         from "./pages/CityExplorerPage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import PageTracker        from "./components/PageTracker";

import { ThemeProvider } from "./context/ThemeContext";

import ApiDocsPage from "./pages/ApiDocsPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FeatureFlagProvider>
          <PageTracker />
          <Routes>
            {/* ── Public routes ─────────────────────────────────── */}
            <Route path="/"                element={<LandingPage />} />
            <Route path="/pricing"         element={<PricingPage />} />
            <Route path="/join"            element={<JoinPage />} />
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/register"        element={<RegisterGate />} />
            <Route path="/auth/callback"   element={<AuthCallbackPage />} />
            <Route path="/verify-email"    element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password"  element={<ResetPasswordPage />} />
            <Route path="/api-docs"        element={<ApiDocsPage />} />
            <Route path="/api-docs.html"   element={<ApiDocsPage />} />

            {/* ── Protected app routes ───────────────────────────── */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/app/categories" replace />} />

              <Route path="settings"         element={<FeatureGate featureKey="settings"><SettingsPage /></FeatureGate>} />
              {/* Documentation */}
              <Route path="docs"             element={<FeatureGate featureKey="docs"><DocumentationPage /></FeatureGate>} />
              <Route path="people"            element={<FeatureGate featureKey="people"><PeoplePage /></FeatureGate>} />
              <Route path="people-email"      element={<FeatureGate featureKey="people"><PeopleEmailPage /></FeatureGate>} />
              <Route path="people-number"     element={<FeatureGate featureKey="people"><PeopleNumberPage /></FeatureGate>} />
              <Route path="email"             element={<FeatureGate featureKey="emails"><EmailPage /></FeatureGate>} />
              <Route path="number"            element={<FeatureGate featureKey="numbers"><NumberPage /></FeatureGate>} />
              <Route path="categories"        element={<FeatureGate featureKey="categories"><CategoryExplorerPage /></FeatureGate>} />
              <Route path="cities"            element={<FeatureGate featureKey="cities"><CityExplorerPage /></FeatureGate>} />
              <Route path="companies"         element={<FeatureGate featureKey="companies"><CompaniesPage /></FeatureGate>} />
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
