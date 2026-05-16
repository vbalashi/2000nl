# App Behavior Features: Auth And Platform

### Google OAuth Authentication
**Added:** 2026-01-29
**User Story:** US-067.2

Google OAuth is the primary authentication method across web and PWA contexts.

### Supabase Site URL and Redirect Configuration
**Added:** 2026-01-29
**User Story:** US-067.1

Supabase auth is configured to use the production domain and matching callback URLs.

### Email OTP Authentication (No Passwords)
**Added:** 2026-01-29
**User Story:** US-067.3

Password auth is disabled and OTP length is matched to Supabase configuration.

### Branded Email Templates (Supabase)
**Added:** 2026-01-29
**User Story:** US-067.4

Auth emails use branded templates with cross-client rendering checks.

### PWA OAuth Verification + Manual OTP Fallback
**Added:** 2026-02-06
**User Story:** US-072.1

PWA standalone mode supports OAuth, with manual OTP fallback when email-link flows open in the wrong context.

### PWA Icon and iOS Splash Screens
**Added:** 2026-02-06
**User Stories:** US-085.1, US-085.2

The manifest includes installable icons and iOS startup images.

### PWA Install Support (Icon + Fullscreen)
**Added:** 2026-01-23
**User Story:** US-032

The app can be installed to the home screen and launched without browser chrome.

### Desktop Card Width Expansion (Readability)
**Added:** 2026-01-23
**User Story:** US-045

The main training column expands on desktop for better readability.

### Color Accessibility Improvements (WCAG AA)
**Added:** 2026-01-23
**User Story:** US-052

UI colors were adjusted to meet WCAG AA contrast requirements.
