# Public GitHub Backup Design

## Goal

Publish Zotero Context Translator as a public GitHub repository named `zotero-context-translator`, with a useful Chinese-first README and no personal information, credentials, local caches, test papers, or machine-specific paths.

## Publication model

The existing local development history remains untouched as the private development backup. The public repository receives a new, clean `main` history created from the validated 0.1.6 source snapshot.

This is required because several historical planning commits contain a Windows user-directory path. Pushing the original branch would keep those paths recoverable even after editing the latest files. A clean public history removes that risk without destructively rewriting the local repository.

## Repository contents

The public snapshot includes:

- Zotero add-on source code
- automated tests and fixtures
- build scripts and package metadata
- installation and acceptance documentation
- design and implementation notes after replacing machine-specific paths
- a Chinese-first `README.md`

It excludes generated XPI files, caches, temporary acceptance scripts, PDFs, API credentials, local profiles, dependencies, coverage output, and worktrees through `.gitignore` and a tracked-file allowlist review.

## README structure

The README contains:

1. product purpose and supported Zotero version
2. main capabilities and interaction behavior
3. installation from a locally built XPI
4. OpenAI-compatible API configuration using placeholders only
5. local context indexing and privacy behavior
6. development, testing, and XPI build commands
7. current validation status and known PDF limitations
8. project status and absence of an open-source license

No screenshot is required for this publication pass because the available images are local clipboard captures and may contain environment-specific information.

## Sensitive-information gate

Before publication, scan both the clean snapshot and staged public commit for:

- Windows home directories and usernames
- personal paper paths and temporary clipboard paths
- API keys, bearer tokens, and credential-shaped strings
- non-placeholder email addresses
- tracked PDFs, caches, profiles, build output, and XPI binaries

The push is blocked if any unexplained match remains. Public service URLs such as the DeepSeek API endpoint may remain when used only as documentation and never include a credential.

## GitHub settings

- repository name: `zotero-context-translator`
- visibility: public
- default branch: `main`
- description: `Context-aware academic translation for the Zotero 9 PDF reader.`
- no GitHub Release in this pass
- no license file in this pass; the README states that no reuse license has yet been granted

## Verification

Before pushing, run the full automated test suite on the exact source snapshot, confirm a clean Git status, audit tracked files and commit content, and verify that the remote `main` commit matches the locally audited public commit. After creation, open the repository page and confirm its name, visibility, default branch, README rendering, and file list.
