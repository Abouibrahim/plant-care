import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/Spinner";
import { LoginScreen } from "./screens/LoginScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { CheckRoute } from "./screens/CheckScreen";
import { PlantScreen } from "./screens/PlantScreen";
import { PlantsScreen } from "./screens/PlantsScreen";
import { SpeciesListScreen } from "./screens/SpeciesListScreen";
import { SpeciesScreen } from "./screens/SpeciesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TagRoute } from "./screens/TagRoute";

// The tag sheet brings the QR encoder: it loads when a sheet is opened, not with the app.
const TagsScreen = lazy(() => import("./screens/TagsScreen"));

export default function App() {
  const { session, loading, configured, offline } = useAuth();

  // While the stored sign-in is read; offline from the start, the shell shows on the phone's copy meanwhile (Phase 14).
  if (loading && !offline) {
    return (
      <div className="center">
        <Spinner />
      </div>
    );
  }
  // Offline with a sign-in the server could not refresh, the shell shows on the phone's copy (Phase 14).
  if (!configured || (!session && !offline)) {
    return <LoginScreen />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayScreen />} />
        <Route path="capture" element={<CaptureScreen />} />
        <Route path="plants" element={<PlantsScreen />} />
        <Route path="plants/:id" element={<PlantScreen />} />
        <Route path="species" element={<SpeciesListScreen />} />
        <Route path="species/:id" element={<SpeciesScreen />} />
        <Route path="check" element={<CheckRoute />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route
          path="tags"
          element={
            <Suspense
              fallback={
                <div className="center">
                  <Spinner />
                </div>
              }
            >
              <TagsScreen />
            </Suspense>
          }
        />
        <Route path="t/:code" element={<TagRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
