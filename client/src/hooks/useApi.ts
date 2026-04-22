import { useEffect, useState } from "react";
import { api } from "../api";

type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useApi<T>(loader: () => Promise<T>): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    loader()
      .then((value) => {
        if (!active) {
          return;
        }

        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loader, refreshNonce]);

  useEffect(() => {
    const handleRefresh = () => setRefreshNonce((value) => value + 1);
    window.addEventListener(api.authChangedEvent, handleRefresh);

    return () => {
      window.removeEventListener(api.authChangedEvent, handleRefresh);
    };
  }, []);

  return { data, loading, error };
}
