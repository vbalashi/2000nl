## Change and verification

Describe the user-visible behavior and the checks that passed.

## Test-production release boundary

Every deploy-relevant merge to `main` automatically deploys to the NUC. Confirm that this PR is safe to deploy without any later PR, migration, or coordinated action. If related PRs must ship together, create one integration PR containing the complete change.

Release-Ready: no
