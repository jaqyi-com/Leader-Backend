import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { FeatureFlagProvider } from "./context/FeatureFlagContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import FeatureGate from "./components/FeatureGate";

import PageTracker        from "./components/PageTracker";
import { ThemeProvider } from "./context/ThemeContext";

// Public marketing pages — loaded eagerly because they are pre-rendered (scripts/prerender.mjs)
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";

// Everything except the public marketing pages loads on demand, so the landing page stays light.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterGate = lazy(() => import("./components/RegisterGate")); // password-protected internal signup
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const DocumentationPage = lazy(() => import("./pages/DocumentationPage"));
const PeoplePage = lazy(() => import("./pages/PeoplePage"));
const PeopleEmailPage = lazy(() => import("./pages/PeopleEmailPage"));
const PeopleNumberPage = lazy(() => import("./pages/PeopleNumberPage"));
const EmailPage = lazy(() => import("./pages/EmailPage"));
const NumberPage = lazy(() => import("./pages/NumberPage"));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const CategoryExplorerPage = lazy(() => import("./pages/CategoryExplorerPage"));
const CityExplorerPage = lazy(() => import("./pages/CityExplorerPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const ApiDocsPage = lazy(() => import("./pages/ApiDocsPage"));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FeatureFlagProvider>
          <PageTracker />
          <Suspense fallback={null}>
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
          </Suspense>
        </FeatureFlagProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
