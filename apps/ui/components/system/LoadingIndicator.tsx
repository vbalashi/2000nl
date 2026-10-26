import React from "react";
import styles from "./LoadingIndicator.module.css";

/** Decorative motion; the enclosing status provides the accessible message. */
export function LoadingIndicator() {
  return <span className={styles.dots} aria-hidden="true" data-testid="loading-indicator"><i /><i /><i /></span>;
}
