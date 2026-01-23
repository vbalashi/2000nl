"use client";

import { useEffect, useState } from "react";

const OFFLINE_MESSAGE = "You're offline. Please connect to continue";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm"
      role="status"
      aria-live="polite"
    >
      {OFFLINE_MESSAGE}
    </div>
  );
}
