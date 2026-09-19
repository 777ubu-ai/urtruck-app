# Internal TestFlight RC path

The controlled RC workflow is `.github/workflows/testflight-rc-internal.yml`.

- A same-repository pull request to `main` runs the exact-source build and all
  release guards, but never submits to TestFlight.
- After the workflow file is present on the default branch, an owner invokes
  `workflow_dispatch` with `source_ref` set to the audited branch or full SHA
  and `submit_internal=true`.
- The workflow checks out that exact ref, verifies the EAS production profile,
  checks the EAS `gitCommitHash`, and only then submits internal TestFlight.
- The existing `.github/workflows/testflight-rc.yml` remains the protected
  main-only production workflow. Its automatic trigger is limited to changes
  to that workflow file; it does not react to RC product commits or the
  controlled workflow.

The default-branch registration rule means a new workflow cannot be manually
dispatched from GitHub until the workflow-only change is merged or otherwise
registered on the default branch. No product code needs to be merged: the
review PR provides the pre-merge exact-SHA build, and the owner performs the
explicit internal submit only after the workflow-only registration is
approved.
