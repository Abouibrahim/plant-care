import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { t } from "../i18n";
import { listPlants } from "../lib/db";

export function TodayScreen() {
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listPlants()
      .then((plants) => {
        if (active) setCount(plants.length);
      })
      .catch(() => {
        // The count is decoration; a failed load shows nothing.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="screen">
      <h1>{t.today.title}</h1>

      {loading ? (
        <div className="muted small" style={{ marginBottom: 12 }}>
          <Spinner label={t.common.loading} />
        </div>
      ) : (
        count !== null && <p className="muted">{t.today.plantsCount(count)}</p>
      )}

      <div className="card">
        <p>{t.today.empty}</p>
        <Link to="/capture" className="btn primary block">
          {t.today.capture}
        </Link>
      </div>
    </div>
  );
}
