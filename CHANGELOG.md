# Changelog

## 0.3.7 - 2026-09-24

### Fixes

- Bundle Runtime source and Windows x64/ARM64 node-pty dependencies in the XPI, excluding Node.js and build-machine absolute paths.
- Install the backend under the Zotero data directory, discover existing Windows Node.js, and launch natively by default. Keep WSL as an explicit manual option.
- Preserve Windows paths and use the Windows user directory for sessions and temporary files.

### Validation

- Automated installer tests cover a copied XPI, Unicode/spaces in the data path, repeat startup, and missing Node. Actual Zotero Windows installation remains a manual verification.


## 0.3.6 - 2026-09-23

### Improvements

- Run structured Agent requests, version checks, and PTY sessions through the user's current default Shell with its login configuration.
- Use automatic runtime environment defaults instead of requiring WSL-specific platform settings for every Agent.
- Keep OpenCode on its native default model unless a temporary override is explicitly configured, and show detected model information in the dialog.
- Preserve CMD AutoRun configuration when launching Windows commands.

### Validation

- 95 Node.js tests pass; XPI build and verification pass.

## 0.3.5 - 2026-09-21

### Fixes

- Restore the September 10 direct `env → Node → Runtime` launch strategy with literal arguments and an explicit Node directory in PATH.
- Resolve the default Node command to the local build metadata instead of relying on Bash or NVM shell initialization.
- Pass the configured local Endpoint port to Runtime. Recover an unreachable default port 24119 through 24129, saving the new address only after authentication succeeds. Preserve custom endpoints and report Token conflicts.

### Validation

- Windows launched the direct command on port 24129; authenticated health and all three Agent version checks succeeded.
- Added tests for literal arguments, absolute Node paths, custom ports, authenticated fallback, and failure rollback.

## 0.3.4 - 2026-09-21

### Fixes

- Bound health, configuration, and CLI discovery requests with Zotero HTTP timeouts; expose failed discovery instead of waiting indefinitely.
- Normalize saved Linux paths pasted with backslashes and a missing leading slash.
- Launch Bash through `wsl.exe --exec` to prevent the default WSL shell from expanding startup variables prematurely.
- Repair an incorrectly capitalized home directory only when Runtime confirms the configured directory does not exist.
- Provide explicit bootstrap timers and report early WSL process exits.

### Validation

- Launched Runtime from Windows using the normalized saved paths on an isolated test port; authenticated health and all three CLI version checks passed.
- Stopped the test Runtime after validation. Zotero UI installation validation remains manual.

## 0.3.3 - 2026-09-21

### Fixes

- Preserve the local runtime source location in source-built XPI packages after Zotero installs them.
- Initialize NVM and common CLI paths when launching WSL runtime; quote shell arguments and share concurrent startup attempts.
- Detect installed agents on connection and refresh preferences without requiring a chat request.
- Discover native and NVM CLI installations when the shell PATH is incomplete.
- Fill an unset working directory from the authenticated runtime while preserving explicit user settings.

### Validation

- Add regression coverage for installed XPI startup, quoted paths, concurrent connections, CLI discovery, and default working directory recovery.
- Locally built XPI packages still require the source checkout and its installed dependencies. Windows Zotero UI validation remains manual.
