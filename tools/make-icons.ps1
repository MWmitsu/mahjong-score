# icon.svg と同じデザインの PNG アイコンを生成する（PWA/ストア用）。
# 使い方: PowerShell で  .\tools\make-icons.ps1
# 生成物: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png, icons/icon-1024.png
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "icons"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# icon.svg の配色・比率（512基準）
$GREEN = [System.Drawing.ColorTranslator]::FromHtml("#0b7a3b")
$WHITE = [System.Drawing.Color]::White

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  if ($d -le 0) { $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h))); return $p }
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Get-JpFont([single]$px) {
  foreach ($name in @("Yu Gothic UI", "Yu Gothic", "Meiryo", "MS Gothic")) {
    try {
      $f = New-Object System.Drawing.Font($name, $px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      if ($f.Name -eq $name) { return $f }
      $f.Dispose()
    } catch { }
  }
  return New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
}

# $contentScale: 図柄全体の縮小率（maskable は安全域に収めるため小さくする）
# $roundBg: 背景の角を丸めるか（maskable は全面塗りにする）
function Save-Icon([int]$size, [string]$path, [single]$contentScale, [bool]$roundBg) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 512.0   # 512基準のスケール
  $brGreen = New-Object System.Drawing.SolidBrush($GREEN)
  $brWhite = New-Object System.Drawing.SolidBrush($WHITE)

  # 背景（緑）
  if ($roundBg) {
    $bg = New-RoundedPath 0 0 $size $size (104 * $s)
    $g.FillPath($brGreen, $bg); $bg.Dispose()
  } else {
    $g.FillRectangle($brGreen, 0, 0, $size, $size)
  }

  # 白い牌（中央そろえ・contentScale で縮小）
  $tileW = 304 * $s * $contentScale
  $tileH = 368 * $s * $contentScale
  $tileX = ($size - $tileW) / 2.0
  $tileY = ($size - $tileH) / 2.0
  $tileR = 36 * $s * $contentScale
  $tile = New-RoundedPath $tileX $tileY $tileW $tileH $tileR
  $g.FillPath($brWhite, $tile); $tile.Dispose()

  # 「麻」を牌の中央に
  $fontPx = 230 * $s * $contentScale
  $font = Get-JpFont $fontPx
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF($tileX, $tileY, $tileW, $tileH)
  $g.DrawString("麻", $font, $brGreen, $rect, $fmt)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $font.Dispose(); $fmt.Dispose(); $brGreen.Dispose(); $brWhite.Dispose(); $g.Dispose(); $bmp.Dispose()
  Write-Output ("生成: " + (Split-Path -Leaf $path) + " (" + $size + "x" + $size + ")")
}

# 通常アイコン（角丸背景・原寸デザイン）
Save-Icon 192  (Join-Path $outDir "icon-192.png")  1.0 $true
Save-Icon 512  (Join-Path $outDir "icon-512.png")  1.0 $true
Save-Icon 1024 (Join-Path $outDir "icon-1024.png") 1.0 $true   # ストア掲載用
# maskable（全面塗り＋安全域に収まるよう縮小）
Save-Icon 512  (Join-Path $outDir "icon-maskable-512.png") 0.72 $false

Write-Output "完了"

