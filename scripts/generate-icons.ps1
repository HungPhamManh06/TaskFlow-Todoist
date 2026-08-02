# Sinh icon PWA (chick pastel) bằng System.Drawing — chạy: powershell -File scripts/generate-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-ChickIcon {
  param([string]$Path, [int]$Size, [bool]$Maskable)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $cream  = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#EFE6D5'))
  $yellow = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FFD54A'))
  $darkY  = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#F2B53B'))
  $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FF9F43'))
  $ink    = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#4A403A'))
  $pink   = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#F59BB0'))

  # Nền: tràn viền nếu maskable, viền tròn mềm nếu icon thường
  if ($Maskable) {
    $g.FillRectangle($cream, 0, 0, $Size, $Size)
  } else {
    $g.FillRectangle($cream, 0, 0, $Size, $Size)
    $border = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#D9C9AC'), [Math]::Max(2, $Size * 0.02))
    $g.DrawRectangle($border, 0, 0, $Size - 1, $Size - 1)
  }

  $s = $Size / 512.0

  # Chân (2 cục cam nhỏ)
  $g.FillEllipse($orange, 195 * $s, 452 * $s, 46 * $s, 22 * $s)
  $g.FillEllipse($orange, 271 * $s, 452 * $s, 46 * $s, 22 * $s)

  # Má hồng
  $g.FillEllipse($pink, 196 * $s, 228 * $s, 34 * $s, 20 * $s)
  $g.FillEllipse($pink, 282 * $s, 228 * $s, 34 * $s, 20 * $s)

  # Cánh (ellipse vàng đậm, bên phải thân)
  $g.FillEllipse($darkY, 330 * $s, 292 * $s, 78 * $s, 104 * $s)

  # Thân (ellipse vàng lớn)
  $g.FillEllipse($yellow, 132 * $s, 216 * $s, 248 * $s, 248 * $s)

  # Đầu (tròn vàng)
  $g.FillEllipse($yellow, 182 * $s, 128 * $s, 148 * $s, 148 * $s)

  # Mỏ (tam giác cam)
  $beak = New-Object System.Drawing.Drawing2D.GraphicsPath
  $beakPts = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([float](232 * $s), [float](222 * $s)),
    [System.Drawing.PointF]::new([float](280 * $s), [float](222 * $s)),
    [System.Drawing.PointF]::new([float](256 * $s), [float](254 * $s))
  )
  $beak.AddPolygon($beakPts)
  $g.FillPath($orange, $beak)

  # Mắt (2 chấm đen)
  $g.FillEllipse($ink, 224 * $s, 188 * $s, 18 * $s, 24 * $s)
  $g.FillEllipse($ink, 270 * $s, 188 * $s, 18 * $s, 24 * $s)

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Da tao: $Path"
}

$dir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

New-ChickIcon -Path (Join-Path $dir 'icon-192.png') -Size 192 -Maskable $false
New-ChickIcon -Path (Join-Path $dir 'icon-512.png') -Size 512 -Maskable $false
New-ChickIcon -Path (Join-Path $dir 'icon-maskable-512.png') -Size 512 -Maskable $true
