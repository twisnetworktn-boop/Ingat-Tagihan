---
name: Workspace dependency installs
description: Package installation limitation in this pnpm artifact workspace
---

The generic language-package installer runs `pnpm add` at the workspace root and cannot target a particular artifact. The workspace root guard blocks that install, and the installer rejects `--filter` as a package token.

**Why:** Runtime packages belong in the artifact's own manifest; installing them at the workspace root breaks dependency ownership.

**How to apply:** Follow the package-management and pnpm-workspace guidance first. If the package installer cannot target the artifact, use a package-scoped pnpm install, then check both the artifact manifest and lockfile.