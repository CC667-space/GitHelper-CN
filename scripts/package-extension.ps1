$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$artifactsPath = Join-Path $projectRoot 'artifacts'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$packageJson = Get-Content -Raw -Encoding UTF8 -LiteralPath $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version

if (-not $version) {
  throw 'package.json 缺少 version'
}

$archiveName = "GitHelper-CN-v$version-chrome.zip"
$checksumName = "GitHelper-CN-v$version-SHA256SUMS.txt"
$archivePath = Join-Path $artifactsPath $archiveName
$checksumPath = Join-Path $artifactsPath $checksumName
$legacyArchivePath = Join-Path $artifactsPath "GitHelper-CN-v$version.zip"
$distManifestPath = Join-Path $distPath 'manifest.json'

if (-not (Test-Path -LiteralPath $distManifestPath)) {
  throw 'dist/manifest.json 不存在，请先运行 pnpm build'
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $distManifestPath | ConvertFrom-Json
if ([string]$manifest.version -ne $version) {
  throw "版本不一致：package.json=$version，dist/manifest.json=$($manifest.version)"
}

$requiredIcons = @(
  'icons\icon-16.png',
  'icons\icon-32.png',
  'icons\icon-48.png',
  'icons\icon-128.png'
)
foreach ($icon in $requiredIcons) {
  if (-not (Test-Path -LiteralPath (Join-Path $distPath $icon))) {
    throw "发布包缺少图标：$icon"
  }
}

New-Item -ItemType Directory -Force -Path $artifactsPath | Out-Null
foreach ($oldPath in @($archivePath, $checksumPath, $legacyArchivePath)) {
  if (Test-Path -LiteralPath $oldPath) {
    Remove-Item -LiteralPath $oldPath
  }
}

Compress-Archive -Path (Join-Path $distPath '*') -DestinationPath $archivePath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ($entryNames -notcontains 'manifest.json') {
    throw '扩展包根目录缺少 manifest.json'
  }
  foreach ($icon in $requiredIcons) {
    $normalizedIcon = $icon.Replace('\', '/')
    if ($entryNames -notcontains $normalizedIcon) {
      throw "扩展包缺少图标：$normalizedIcon"
    }
  }
  $forbiddenEntries = @(
    $entryNames | Where-Object {
      $_ -match '(^|/)(\.env($|\.)|credentials|secrets?)' -or
      $_ -match '\.(pem|key|p12|pfx|map|log)$'
    }
  )
  if ($forbiddenEntries.Count -gt 0) {
    throw "扩展包包含禁止条目：$($forbiddenEntries -join ', ')"
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
$checksumLine = "$hash  $archiveName`n"
[System.IO.File]::WriteAllText(
  $checksumPath,
  $checksumLine,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Output "PACKAGE_PATH=$(Join-Path 'artifacts' $archiveName)"
Write-Output "PACKAGE_ENTRIES=$entryCount"
Write-Output "PACKAGE_SHA256=$hash"
Write-Output "CHECKSUM_PATH=$(Join-Path 'artifacts' $checksumName)"
