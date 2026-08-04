# Public GitHub Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the validated Zotero Context Translator 0.1.6 source as a public GitHub repository named `zotero-context-translator` without exposing personal information or credentials.

**Architecture:** Preserve the existing local development history, sanitize the current tracked snapshot, then export it into a separate one-commit Git repository whose default branch is `main`. Create the public GitHub repository through an existing authenticated browser session, push the audited clean repository over HTTPS, and verify the remote repository independently.

**Tech Stack:** Git, GitHub, Markdown, Node.js test runner, PowerShell build script, Zotero 9 add-on source

## Global Constraints

- GitHub repository name is exactly `zotero-context-translator`.
- Repository visibility is public and the default branch is `main`.
- Do not publish the original local Git history because historical commits contain a Windows user-directory path.
- Do not publish API credentials, bearer tokens, personal paper paths, temporary clipboard paths, local profiles, caches, PDFs, generated XPI files, dependencies, coverage output, or worktrees.
- Public service URLs may appear only as generic documentation examples and must not contain credentials.
- The README is Chinese-first and contains no environment-specific screenshots.
- Do not add a license or GitHub Release in this pass.
- Never ask the user to paste a GitHub password, personal access token, or recovery code into chat.

---

### Task 1: Sanitize the tracked source snapshot

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-close-button-pointer-capture-fix.md`
- Modify: `docs/superpowers/plans/2026-08-04-reliable-api-and-floating-card.md`
- Modify: `docs/superpowers/plans/2026-08-04-single-translate-action.md`
- Modify: this publication plan when it contains literal audit examples

**Interfaces:**
- Consumes: the current validated 0.1.6 feature branch
- Produces: a current tracked tree with machine-specific paths replaced by `<workspace>` placeholders

- [ ] **Step 1: Record current sensitive-path matches**

Run:

```powershell
$localUsername = [regex]::Escape([Environment]::UserName)
$windowsHomePrefix = 'C:' + [char]92 + 'Users' + [char]92
$temporaryClipboardPath = 'AppData' + [char]92 + 'Local' + [char]92 + 'Temp'
$legacyFragment = $env:ZCT_PUBLIC_AUDIT_LEGACY_FRAGMENT
if ([string]::IsNullOrWhiteSpace($legacyFragment)) {
  throw 'ZCT_PUBLIC_AUDIT_LEGACY_FRAGMENT must be set to run this audit.'
}
$sensitivePathPattern = [regex]::Escape($windowsHomePrefix) + '|' + $localUsername + '|' + [regex]::Escape($temporaryClipboardPath) + '|' + [regex]::Escape($legacyFragment)
git grep -n -I -E $sensitivePathPattern HEAD --
```

Expected: matches only in the planning files listed above before sanitization.

- [ ] **Step 2: Replace each machine-specific path**

Replace repository paths such as:

```text
<local-user-directory>/Documents/Codex/.../.worktrees/zotero-context-translator
```

with:

```text
<workspace>/.worktrees/zotero-context-translator
```

Do not change command meaning or acceptance criteria.

- [ ] **Step 3: Verify current sensitive-path matches are gone**

Run the Step 1 command again.

Expected: exit code 1 with no matches.

- [ ] **Step 4: Commit the sanitization**

```powershell
git add docs/superpowers/plans
git commit -m "docs: sanitize local workspace paths"
```

### Task 2: Add the public README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `docs/INSTALL.md`, `docs/ACCEPTANCE.md`, `package.json`, and `addon/manifest.json`
- Produces: the GitHub landing page for users and contributors

- [ ] **Step 1: Write the README with exact top-level sections**

Create `README.md` with this structure and project-specific content derived from the validated documentation:

```markdown
# Zotero Context Translator

面向 Zotero 9 PDF Reader 的上下文感知学术翻译插件。

## 功能特点
## 系统要求
## 安装
## API 配置
## 使用方法
## 上下文与缓存
## 隐私说明
## 本地开发
## 测试与验收
## 已知限制
## 许可证
```

The README must state:

- current version `0.1.6` and Zotero support `9.0.*`
- selection opens a floating card but does not call the API automatically
- one explicit `翻译` button triggers one OpenAI-compatible Chat Completions request
- configurable `Base URL`, `API Key`, and `Model Name`
- API Key storage uses Zotero's Firefox Login Manager
- local indexing uses title, abstract, section path, and nearby paragraphs
- no full-paper translation history is persisted
- build command `pnpm run build` and test command `pnpm test`
- XPI output path `outputs/zotero-context-translator-0.1.6.xpi`
- no open-source license has yet been granted

Use only placeholder configuration values:

```text
Base URL: https://api.example.com/v1
API Key: <your-api-key>
Model Name: model-name
```

- [ ] **Step 2: Check README consistency**

Run:

```powershell
rg -n '0\.1\.6|Zotero 9|Base URL|API Key|Model Name|pnpm test|pnpm run build|许可证' README.md
```

Expected: every required topic is present and no older release is described as current.

- [ ] **Step 3: Commit the README**

```powershell
git add README.md
git commit -m "docs: add public project readme"
```

### Task 3: Verify and audit the publication source

**Files:**
- Verify: all files returned by `git ls-files`
- Verify: `.gitignore`

**Interfaces:**
- Consumes: sanitized tracked source and README
- Produces: a passing test result and zero unexplained sensitive-information findings

- [ ] **Step 1: Run the full automated test suite**

```powershell
node --test
```

Expected: 123 tests pass, 0 fail.

- [ ] **Step 2: Check whitespace and repository status**

```powershell
git diff --check
git status --short
```

Expected: both commands produce no actionable output.

- [ ] **Step 3: Audit tracked filenames**

```powershell
git ls-files | rg -i '\.(pdf|xpi|sqlite|db|log)$|(^|/)(work|node_modules|build|dist|coverage|\.worktrees)/'
```

Expected: no matches.

- [ ] **Step 4: Audit tracked content**

Run a tracked-content scan for:

```text
the local user-directory prefix
the known local username
the known legacy-encoding fragment
the temporary clipboard-path prefix
sk- followed by 16 or more token characters
Bearer followed by 16 or more token characters
non-placeholder personal email addresses
```

Expected: zero unexplained matches. `codex@local`, `noreply@users.noreply.github.com`, and documented placeholder values are allowed.

### Task 4: Create an independent clean public repository

**Files:**
- Create temporarily: `work/public-github-export/source.zip`
- Create temporarily: `work/public-github-export/repository/`

**Interfaces:**
- Consumes: audited feature-branch `HEAD`
- Produces: an independent Git repository with one root commit on `main`

- [ ] **Step 1: Export only tracked files from the audited commit**

```powershell
git archive --format=zip --output=work/public-github-export/source.zip HEAD
Expand-Archive -LiteralPath work/public-github-export/source.zip -DestinationPath work/public-github-export/repository
```

- [ ] **Step 2: Initialize the clean repository**

```powershell
git -C work/public-github-export/repository init -b main
git -C work/public-github-export/repository add --all
git -C work/public-github-export/repository -c user.name="Zotero Context Translator" -c user.email="noreply@users.noreply.github.com" commit -m "Initial public release"
```

- [ ] **Step 3: Prove the public history is clean and singular**

```powershell
git -C work/public-github-export/repository rev-list --count HEAD
git -C work/public-github-export/repository log -1 --format='%an <%ae> %s'
```

Expected:

```text
1
Zotero Context Translator <noreply@users.noreply.github.com> Initial public release
```

- [ ] **Step 4: Repeat Task 3 audits inside the clean repository**

Expected: tests pass and every sensitive-information gate remains clear.

### Task 5: Create and push the GitHub repository

**Files:**
- Modify: clean repository `.git/config` through `git remote add origin`

**Interfaces:**
- Consumes: audited one-commit `main` repository and an authenticated GitHub browser session
- Produces: public GitHub repository `zotero-context-translator`

- [ ] **Step 1: Check for an existing GitHub login**

Open `https://github.com/new` in the available authenticated browser surface.

Expected: the New repository form is shown. If GitHub shows a login page, ask the user to sign in there personally and continue only after confirmation.

- [ ] **Step 2: Create the empty public repository**

Set:

```text
Repository name: zotero-context-translator
Description: Context-aware academic translation for the Zotero 9 PDF reader.
Visibility: Public
Initialize with README: No
Add .gitignore: None
Choose a license: None
```

Submit once and record the canonical HTTPS clone URL displayed by GitHub.

- [ ] **Step 3: Add the remote and push main**

```powershell
git -C work/public-github-export/repository remote add origin <canonical-https-clone-url>
git -C work/public-github-export/repository push -u origin main
```

If Git Credential Manager opens an official authorization page, allow the user to complete it personally. Never request credentials in chat.

### Task 6: Verify the remote publication

**Files:**
- Verify: public GitHub repository page and remote Git refs

**Interfaces:**
- Consumes: pushed public `main`
- Produces: evidence that the remote is public, correctly named, correctly rendered, and identical to the audited local commit

- [ ] **Step 1: Compare local and remote commit IDs**

```powershell
git -C work/public-github-export/repository rev-parse HEAD
git -C work/public-github-export/repository ls-remote origin refs/heads/main
```

Expected: both commit IDs are identical.

- [ ] **Step 2: Inspect the repository page**

Confirm through GitHub UI:

- repository name is `zotero-context-translator`
- visibility is `Public`
- default branch is `main`
- README renders in Chinese
- tracked file list contains no PDF, XPI, cache, local profile, or worktree
- no release and no license are shown

- [ ] **Step 3: Report the canonical repository URL and audit summary**

Report the repository URL, remote commit ID, test count, sensitive-information result, and note that the local full development history was not published.
