import React from "react";
import HomePage from "./HomePage";

// Revalidate the document on every navigation; content-hashed JS stays immutable.
export const dynamic = "force-dynamic";

export default function Page() {
  return <HomePage />;
}
