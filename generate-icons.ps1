# 확장 아이콘 생성 스크립트 (16/24/32/48/128)
# 크롬 권장 세트를 모두 생성한다. 실행: .\generate-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 3, 199, 90)
  $c2 = [System.Drawing.Color]::FromArgb(255, 0, 140, 200)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)

  $r = [Math]::Max(2, [int]($size * 0.22))
  $d = 2 * $r
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $d, $d, 180, 90)
  $gp.AddArc($size - $d, 0, $d, $d, 270, 90)
  $gp.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $gp.AddArc(0, $size - $d, $d, $d, 90, 90)
  $gp.CloseFigure()
  $g.FillPath($brush, $gp)

  $white = [System.Drawing.Brushes]::White
  $s = [double]$size

  # 화살표 몸통
  $g.FillRectangle($white, [single]($s * 0.42), [single]($s * 0.18), [single]($s * 0.16), [single]($s * 0.30))
  # 화살표 머리
  $pts = @(
    (New-Object System.Drawing.PointF([single]($s * 0.26), [single]($s * 0.44))),
    (New-Object System.Drawing.PointF([single]($s * 0.74), [single]($s * 0.44))),
    (New-Object System.Drawing.PointF([single]($s * 0.50), [single]($s * 0.70)))
  )
  $g.FillPolygon($white, $pts)
  # 받침선
  $penW = [Math]::Max(1.5, $s * 0.09)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single]$penW)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($pen, [single]($s * 0.26), [single]($s * 0.83), [single]($s * 0.74), [single]($s * 0.83))

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("  icon{0}.png" -f $size)
}

# $PSScriptRoot 사용 (한글 경로를 스크립트에 하드코딩하면 인코딩이 깨짐)
$dir = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $dir | Out-Null
Write-Host "generating icons ->" $dir
foreach ($sz in 16, 24, 32, 48, 128) {
  New-Icon $sz (Join-Path $dir ("icon{0}.png" -f $sz))
}
Write-Host "done"
