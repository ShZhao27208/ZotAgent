param([string]$WslFakeAgent, [string]$NodeExe = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference = 'Stop'
& $NodeExe (Join-Path $PSScriptRoot 'windows-agent-smoke.mjs') $WslFakeAgent
exit $LASTEXITCODE
