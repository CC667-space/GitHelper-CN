$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$artifactsPath = Join-Path $projectRoot 'artifacts'
$archivePath = Join-Path $artifactsPath 'GitHelper-CN-v0.1.0.zip'

if (-not (Test-Path -LiteralPath (Join-Path $distPath 'manifest.json'))) {
  throw 'dist/manifest.json 不存在，请先运行 pnpm build'
}

New-Item -ItemType Directory -Force -Path $artifactsPath | Out-Null
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath
}

Compress-Archive -Path (Join-Path $distPath '*') -DestinationPath $archivePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $manifest = $archive.Entries | Where-Object { $_.FullName -eq 'manifest.json' } | Select-Object -First 1
  if (-not $manifest) {
    throw '扩展包根目录缺少 manifest.json'
  }
  $entryCount = $archive.Entries.Count
}
finally {
  $archive.Dispose()
}

$stream = [System.IO.File]::OpenRead($archivePath)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $hashBytes = $sha256.ComputeHash($stream)
  $hash = ([System.BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
}
finally {
  $sha256.Dispose()
  $stream.Dispose()
}
$relativePath = Join-Path 'artifacts' 'GitHelper-CN-v0.1.0.zip'
Write-Output "PACKAGE_PATH=$relativePath"
Write-Output "PACKAGE_ENTRIES=$entryCount"
Write-Output "PACKAGE_SHA256=$hash"
