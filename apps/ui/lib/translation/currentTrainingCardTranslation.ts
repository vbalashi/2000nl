import { coordinateDictionaryMeaningTranslation } from "./dictionaryMeaningTranslationCoordinator";
/** Explicit current-card authorization owns this rare archived-content path.
 * Do not enqueue an ordinary background job: it has no current-target permit.
 * Reuse the existing bounded inline translator/cache projection, then check the
 * permit again before returning any content after a run change or expiry.
 */
export async function requestCurrentTrainingCardTranslation(
  input: Parameters<typeof coordinateDictionaryMeaningTranslation>[0] & {
    observeOnly?: boolean;
  },
  authorize: () => Promise<boolean>,
) {
  const denied = () => ({
    payload: { error: "current_training_permit_invalid" },
    httpStatus: 403,
    cacheStatus: "unknown",
  });
  if (!(await authorize())) return denied();
  if (input.observeOnly)
    return {
      payload: { status: "pending", overlay: null, note: null },
      httpStatus: 202,
      cacheStatus: "unknown",
    };
  const result = await coordinateDictionaryMeaningTranslation(input);
  return (await authorize()) ? result : denied();
}
