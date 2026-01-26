export type AppVersionInfo = {
  version: string;
  commit: string;
  commitShort: string;
  buildTimestamp: string;
  formattedBuildTimestamp: string;
  display: string;
};

const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const rawCommit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
const rawBuildTimestamp = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? "";

const formatBuildTimestamp = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const appVersionInfo = (): AppVersionInfo => {
  const commitShort = rawCommit === "dev" ? "dev" : rawCommit.slice(0, 8);
  const formattedBuildTimestamp = formatBuildTimestamp(rawBuildTimestamp);
  const display = `Version ${rawVersion} (build ${commitShort}, ${formattedBuildTimestamp})`;

  return {
    version: rawVersion,
    commit: rawCommit,
    commitShort,
    buildTimestamp: rawBuildTimestamp,
    formattedBuildTimestamp,
    display,
  };
};
