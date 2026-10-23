import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/Spinner";
import { LoginScreen } from "./screens/LoginScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { PlantScreen } from "./screens/PlantScreen";
import { PlantsScreen } from "./screens/PlantsScreen";
import { SpeciesListScreen } from "./screens/SpeciesListScreen";
import { SpeciesScreen } from "./screens/SpeciesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const { session, loading, configured } = useAuth();

  if (loading) {
    return (
      <div className="center">
        <Spinner />
      </div>
    );
  }
  if (!configured || !session) {
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
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
