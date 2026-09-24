# Test-production release boundary

Merging a deploy-relevant change into `main` starts the NUC deployment. The deploy workflow's database contract protects app/DB compatibility, but it does not prove that all related application changes are present. A partial stacked merge can therefore reach test production before its child PR.

The trusted base-branch workflow runs for every PR to `main` and posts a `release-boundary` status on the PR head commit. Requiring the workflow job itself would not work: `pull_request_target` jobs are attached to the base commit. For a PR whose files match the deployment workflow's path filter, the PR body must contain a line `Release-Ready: yes`. Set this only after verifying that the PR can deploy without another PR or coordinated step. The check also blocks a PR while another open PR targets its head branch. Documentation-only PRs do not need the declaration.

For changes that require several PRs, keep the component PRs open for review and create a single integration PR to `main` with the complete tested result. The integration PR needs its own `Release-Ready: yes` statement. Do not merge a parent PR into `main` merely because its tests pass while a child is still required. Child PR creation, closure, and retargeting reevaluate the affected parent's commit status, including when its previous check had passed.

The `main` branch requires this check and the production dependency security check, plus a PR for changes. The ruleset has no bypass actors and zero required approvals, so normal agent and owner review can proceed without an added approval queue. Direct and force pushes cannot skip these checks. The branch rule and workflow are both required: a CI check without an enforced rule is advisory.

When changing deployment paths, update both `.github/workflows/deploy-nuc.yml` and the `triggersDeploy` matcher in `scripts/lib/release-boundary.mjs`, then run `node --test scripts/check-release-boundary.test.mjs`. If the check cannot query GitHub or its input is unexpected, it fails closed.
