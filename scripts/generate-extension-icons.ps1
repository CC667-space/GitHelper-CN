$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'public\icons'
$sizes = @(16, 32, 48, 128)

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc(
    $X + $Width - $diameter,
    $Y + $Height - $diameter,
    $diameter,
    $diameter,
    0,
    90
  )
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new(
    $size,
    $size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $backgroundBrush = $null
  $textBrush = $null
  $font = $null
  $format = $null
  $path = $null

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $margin = [Math]::Max(1, [Math]::Round($size * 0.04))
    $edge = $size - ($margin * 2)
    $radius = [Math]::Max(2, $size * 0.21)
    $path = New-RoundedRectanglePath -X $margin -Y $margin -Width $edge -Height $edge -Radius $radius
    $backgroundBrush = [System.Drawing.SolidBrush]::new(
      [System.Drawing.ColorTranslator]::FromHtml('#176b87')
    )
    $graphics.FillPath($backgroundBrush, $path)

    $font = [System.Drawing.Font]::new(
      'Segoe UI',
      $size * 0.58,
      [System.Drawing.FontStyle]::Bold,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBox = [System.Drawing.RectangleF]::new(0, -($size * 0.035), $size, $size)
    $graphics.DrawString('G', $font, $textBrush, $textBox, $format)

    $outputPath = Join-Path $outputDirectory "icon-$size.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "ICON_PATH=public\icons\icon-$size.png"
  }
  finally {
    if ($path) { $path.Dispose() }
    if ($format) { $format.Dispose() }
    if ($font) { $font.Dispose() }
    if ($textBrush) { $textBrush.Dispose() }
    if ($backgroundBrush) { $backgroundBrush.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}
