export type AppDestination =
  | "training"
  | "library"
  | "statistics"
  | "settings"
  | "history";

export const parseAppDestination = (
  value: string | null,
  extendedDestinationsEnabled: boolean,
): AppDestination => {
  if (value === "library") return "library";
  if (value === "history") return "history";
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
