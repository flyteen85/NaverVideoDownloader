# Extension icon generator
#   color set : icon16/24/32/48/128.png        -> active (naver.com tabs)
#   gray set  : icon16-gray/...-gray.png       -> inactive (other domains)
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
#       when there is no BOM, so non-ASCII comments corrupt the lines that
#       follow them (this previously nulled out the gray color variables).
#
# Usage: .\generate-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$size,
    [string]$path,
    [System.Drawing.Color]$c1,
    [System.Drawing.Color]$c2,
    [int]$arrowAlpha = 255
  )
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)

  # rounded square background
  $r = [Math]::Max(2, [int]($size * 0.22))
  $d = 2 * $r
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $d, $d, 180, 90)
  $gp.AddArc($size - $d, 0, $d, $d, 270, 90)
  $gp.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $gp.AddArc(0, $size - $d, $d, $d, 90, 90)
  $gp.CloseFigure()
  $g.FillPath($brush, $gp)

  $fg = [System.Drawing.Color]::FromArgb($arrowAlpha, 255, 255, 255)
  $white = New-Object System.Drawing.SolidBrush($fg)
  $s = [double]$size

  # arrow shaft
  $g.FillRectangle($white, [single]($s * 0.42), [single]($s * 0.18), [single]($s * 0.16), [single]($s * 0.30))
  # arrow head
  $pts = @(
    (New-Object System.Drawing.PointF([single]($s * 0.26), [single]($s * 0.44))),
    (New-Object System.Drawing.PointF([single]($s * 0.74), [single]($s * 0.44))),
    (New-Object System.Drawing.PointF([single]($s * 0.50), [single]($s * 0.70)))
  )
  $g.FillPolygon($white, $pts)
  # base line
  $penW = [Math]::Max(1.5, $s * 0.09)
  $pen = New-Object System.Drawing.Pen($fg, [single]$penW)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($pen, [single]($s * 0.26), [single]($s * 0.83), [single]($s * 0.74), [single]($s * 0.83))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# use $PSScriptRoot; hardcoding a Korean path here would get mangled
$dir = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host "generating icons ->" $dir

# active: naver green -> teal
$on1 = [System.Drawing.Color]::FromArgb(255, 3, 199, 90)
$on2 = [System.Drawing.Color]::FromArgb(255, 0, 140, 200)

# inactive: mid gray -> dark gray, arrow slightly dimmed
$off1 = [System.Drawing.Color]::FromArgb(255, 154, 160, 166)
$off2 = [System.Drawing.Color]::FromArgb(255, 95, 99, 104)

foreach ($sz in 16, 24, 32, 48, 128) {
  New-Icon -size $sz -path (Join-Path $dir ("icon{0}.png" -f $sz)) -c1 $on1 -c2 $on2
  New-Icon -size $sz -path (Join-Path $dir ("icon{0}-gray.png" -f $sz)) -c1 $off1 -c2 $off2 -arrowAlpha 225
  Write-Host ("  icon{0}.png + icon{0}-gray.png" -f $sz)
}
Write-Host "done"
