param(
  [Parameter(Mandatory=$true)][string]$TestXpi,
  [Parameter(Mandatory=$true)][string]$ResultCopy,
  [string]$ZoteroExe = 'E:\Zotero\zotero.exe'
)
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path $env:TEMP ('zotagent-host-' + [guid]::NewGuid().ToString('N'))
$profile = Join-Path $testRoot 'profile'
$data = Join-Path $testRoot 'data'
$extensions = Join-Path $profile 'extensions'
$result = Join-Path $testRoot 'result.json'
New-Item -ItemType Directory -Path $profile,$data,$extensions -Force | Out-Null
Copy-Item -LiteralPath $TestXpi -Destination (Join-Path $extensions 'zotagent@shzhao.local.xpi')
function Pref([string]$Name, $Value) { 'user_pref(' + (ConvertTo-Json $Name -Compress) + ', ' + (ConvertTo-Json $Value -Compress) + ');' }
$prefs = @(
  (Pref 'extensions.zotero.dataDir' $data),
  (Pref 'extensions.zotero.useDataDir' $true),
  (Pref 'extensions.zotero.firstRun2' $false),
  (Pref 'extensions.zotero.firstRunGuidance' $false),
  (Pref 'extensions.zotero.firstRun.skipFirefoxProfileAccessCheck' $true),
  (Pref 'extensions.zotero.automaticScraperUpdates' $false),
  (Pref 'extensions.zotero.sync.autoSync' $false),
  (Pref 'extensions.autoDisableScopes' 0),
  (Pref 'extensions.enabledScopes' 15),
  (Pref 'xpinstall.signatures.required' $false),
  (Pref 'extensions.zotagent.autoStartRuntime' $false),
  (Pref 'extensions.zotagent.testOutput' $result)
)
[IO.File]::WriteAllLines((Join-Path $profile 'user.js'), $prefs, (New-Object Text.UTF8Encoding $false))
$process = Start-Process -FilePath $ZoteroExe -ArgumentList @('-no-remote','-profile',('"' + $profile + '"'),'-purgecaches') -PassThru
$deadline = (Get-Date).AddSeconds(100)
while (!(Test-Path -LiteralPath $result) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Test-Path -LiteralPath $result) {
  Copy-Item -LiteralPath $result -Destination $ResultCopy
  Get-Content -LiteralPath $result -Raw
} else {
  $failure = @{ok=$false; error='Zotero host test did not produce a result'; testRoot=$testRoot; pid=$process.Id} | ConvertTo-Json
  [IO.File]::WriteAllText($ResultCopy,$failure)
  Write-Output $failure
}
# Only the explicitly launched isolated process may be stopped.
if (!$process.HasExited -and !$process.WaitForExit(5000)) { Stop-Process -Id $process.Id }
# Windows launcher can hand off to another PID; match only our unique profile.
Get-CimInstance Win32_Process -Filter "name = 'zotero.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
Write-Output ('Isolated test directory: ' + $testRoot)
