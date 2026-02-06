import React from "react";

type Props = {
  className?: string;
  accentClassName?: string;
};

export function BrandLogo({
  className = "truncate text-3xl md:text-[36px] leading-none font-black tracking-tight text-slate-900 dark:text-white opacity-75 dark:opacity-80",
  accentClassName = "text-blue-600 dark:text-blue-400",
}: Props) {
  return (
    <p className={className} aria-label="2000nl">
      <span className="whitespace-nowrap">
        2000<span className={accentClassName}>nl</span>
      </span>
    </p>
  );
}
