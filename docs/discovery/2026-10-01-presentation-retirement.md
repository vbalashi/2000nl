# Removal of the legacy presentation

Production 0.18.1063 enables both presentation flags. Legacy branches remain as a temporary rollout fallback, not a second supported design. The diagnostic inventory contains 32 source files referencing either flag; an import reference does not necessarily mean a removable component.

Evidence: `../diagnostics/2026-10-01-training-followup/presentation-flag-inventory.txt`.

Recommended bounded follow-up: make the approved training and shared article presentation unconditional; remove the two presentation flags from configuration, health reporting and deployment; delete branches/components only after checking remaining imports; migrate old-presentation tests to the retained interface; verify navigation, completed/resumed sessions, settings, translation-off, loading/error states and mobile drawers.

Do not remove shared scheduler, learning-state, authentication, saved-settings or dictionary behavior with CSS branches. Platform V2 capability flags and historic database migrations are separate concerns. `TrainingScreen`, `TrainingCardTemplates`, the builder and navigation mix presentation with behavior; they require characterization rather than mechanical deletion.

This is a separate maintenance change after the diagnostic findings are reviewed. No runtime code was removed in this evidence collection. There is no reason to wait for another redesign before retiring the old presentation.
