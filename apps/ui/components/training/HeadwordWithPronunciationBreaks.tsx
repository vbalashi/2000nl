import React, { Fragment } from "react";

const PRONUNCIATION_SEPARATOR = "·";

export function HeadwordWithPronunciationBreaks({ text }: { text: string }) {
  const segments = text.split(PRONUNCIATION_SEPARATOR);

  if (segments.length === 1) return <>{text}</>;

  return (
    <>
      {segments.map((segment, index) => {
        const hasNext = index < segments.length - 1;
        return (
          <Fragment key={`${segment}-${index}`}>
            <span className="whitespace-nowrap">
              {segment}
              {hasNext ? PRONUNCIATION_SEPARATOR : null}
            </span>
            {hasNext ? <wbr /> : null}
          </Fragment>
        );
      })}
    </>
  );
}
