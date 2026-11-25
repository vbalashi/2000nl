"use client";

import React, {useEffect, useState, type ReactNode} from "react";

/** Mount only while a background read is pending. Fast reads never paint a notice. */
export function DelayedReadNotice({children}: {children: ReactNode}) {
  const [visible,setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <>{children}</> : null;
}
