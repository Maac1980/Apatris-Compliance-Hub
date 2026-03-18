import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchWorkersFromApi } from "@/lib/api";
import { MOCK_WORKERS, type Worker } from "@/data/mockWorkers";

interface UseWorkersResult {
  workers: Worker[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
}

export function useWorkers(): UseWorkersResult {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWorkersFromApi(user?.jwt)
      .then((data) => {
        if (cancelled) return;
        if (data.length > 0) {
          setWorkers(data);
          setIsLive(true);
        } else {
          setWorkers(MOCK_WORKERS);
          setIsLive(false);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setWorkers(MOCK_WORKERS);
        setIsLive(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.jwt]);

  return { workers, loading, error, isLive };
}
