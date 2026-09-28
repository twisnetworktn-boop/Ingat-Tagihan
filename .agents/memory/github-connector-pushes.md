---
name: GitHub connector pushes
description: Non-obvious authentication and empty-repository constraints when publishing local Git history.
---

The connected GitHub integration authenticates GitHub REST requests, but it does not automatically authenticate `git push` or `gh` in the workspace shell. An empty GitHub repository can reject Git Data API writes with HTTP 409 until it receives an initial commit through the Contents API.

**Why:** A shell push failed even with a working connector, and the Git Data API rejected blob creation in an empty repository. The connector proxy worked once the repository was initialized.

**How to apply:** Prefer a Git remote with working provider authentication. If only the connector proxy is available, use its authenticated API without extracting credentials, verify that remote Git object SHAs match local objects, and never replace an existing branch's history without confirming it contains only a temporary initialization commit.