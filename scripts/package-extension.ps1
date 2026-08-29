$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'
$artifactsPath = Join-Path $projectRoot 'artifacts'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$licensePath = Join-Path $projectRoot 'LICENSE'
$thirdPartyNoticesPath = Join-Path $projectRoot 'THIRD_PARTY_NOTICES.txt'
$noticeGeneratorPath = Join-Path $PSScriptRoot 'generate-third-party-notices.mjs'
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

& node $noticeGeneratorPath
if ($LASTEXITCODE -ne 0) {
  throw '生成 THIRD_PARTY_NOTICES.txt 失败'
}
foreach ($legalFile in @($licensePath, $thirdPartyNoticesPath)) {
  if (-not (Test-Path -LiteralPath $legalFile)) {
    throw "发布包缺少法律文件：$legalFile"
  }
  Copy-Item -LiteralPath $legalFile -Destination $distPath -Force
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

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixedTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$resolvedDistPath = (Resolve-Path -LiteralPath $distPath).Path.TrimEnd('\')
$sourceFiles = @(
  Get-ChildItem -LiteralPath $distPath -Recurse -File |
    ForEach-Object {
      if (-not $_.FullName.StartsWith("$resolvedDistPath\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "发布文件越出 dist：$($_.FullName)"
      }
      [PSCustomObject]@{
        FullName = $_.FullName
        RelativePath = $_.FullName.Substring($resolvedDistPath.Length + 1).Replace('\', '/')
      }
    } |
    Sort-Object -Property RelativePath
)

$archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
$zipWriter = [System.IO.Compression.ZipArchive]::new(
  $archiveStream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)
try {
  foreach ($sourceFile in $sourceFiles) {
    $entry = $zipWriter.CreateEntry(
      $sourceFile.RelativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
    $entry.LastWriteTime = $fixedTimestamp
    $entryStream = $entry.Open()
    $inputStream = [System.IO.File]::OpenRead($sourceFile.FullName)
    try {
      $inputStream.CopyTo($entryStream)
    }
    finally {
      $inputStream.Dispose()
      $entryStream.Dispose()
    }
  }
}
finally {
  $zipWriter.Dispose()
  $archiveStream.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ($entryNames -notcontains 'manifest.json') {
    throw '扩展包根目录缺少 manifest.json'
  }
  foreach ($legalEntry in @('LICENSE', 'THIRD_PARTY_NOTICES.txt')) {
    if ($entryNames -notcontains $legalEntry) {
      throw "扩展包缺少法律文件：$legalEntry"
    }
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
