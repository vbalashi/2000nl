/** Signals describe accepted application actions; the guide never performs mutations. */
export const ONBOARDING_PAUSE = '2000nl:onboarding-pause';
export const ONBOARDING_SIGNAL = '2000nl:onboarding-action';
export type OnboardingSignal = 'practice-accepted' | 'training-saved' | 'link-copied' | 'code-copied';
export function signalOnboarding(action: OnboardingSignal) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ONBOARDING_SIGNAL, {detail: action}));
}
