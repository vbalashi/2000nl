export type PrimaryAppDestination =
  | "training"
  | "library"
  | "statistics"
  | "settings";
export type SecondaryAppDestination = "history";
export type AppDestination = PrimaryAppDestination | SecondaryAppDestination;
export type PrimaryNavigationDestination = Exclude<
  PrimaryAppDestination,
  "settings"
>;

export const TRAINING_HISTORY_DESTINATION: SecondaryAppDestination = "history";

export const parseAppDestination = (
  value: string | null,
  extendedDestinationsEnabled: boolean,
): AppDestination => {
  if (value === "library") return "library";
  if (value === TRAINING_HISTORY_DESTINATION) {
    return TRAINING_HISTORY_DESTINATION;
  }
  if (
    extendedDestinationsEnabled &&
    (value === "statistics" || value === "settings")
  ) {
    return value;
  }
  return "training";
};

export const appDestinationUrl = (
  currentUrl: string,
  destination: AppDestination,
) => {
  const url = new URL(currentUrl);
  if (destination === "training") {
    url.searchParams.delete("destination");
  } else {
    url.searchParams.set("destination", destination);
  }
  return `${url.pathname}${url.search}${url.hash}`;
};
