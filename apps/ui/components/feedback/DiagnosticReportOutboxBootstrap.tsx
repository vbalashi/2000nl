"use client";

import React from "react";
import { startDiagnosticReportOutboxDelivery } from "@/lib/feedback/diagnosticReportClient";

export function DiagnosticReportOutboxBootstrap() {
  React.useEffect(() => {
    startDiagnosticReportOutboxDelivery();
  }, []);

  return null;
}
