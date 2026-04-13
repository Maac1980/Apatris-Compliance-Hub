import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";

/**
 * Top progress bar that shows when React Query is fetching data.
 * Provides instant visual feedback on page transitions.
 */
export function TopProgressBar() {
  const isFetching = useIsFetching();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isFetching > 0) {
      setVisible(true);
      setProgress(30);
      const t1 = setTimeout(() => setProgress(60), 200);
      const t2 = setTimeout(() => setProgress(80), 500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      setProgress(100);
      const t = setTimeout(() => { setVisible(false); setProgress(0); }, 300);
      return () => clearTimeout(t);
    }
  }, [isFetching]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5">
      <div
        className="h-full bg-[#C41E18] shadow-[0_0_10px_rgba(196,30,24,0.7)] transition-all duration-300 ease-out"
        style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
      />
    </div>
  );
}
