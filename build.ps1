# 배포용 클린 패키지 생성 스크립트
# 개발용 파일(.claude, preview.html, README, build.ps1 등)을 제외하고
# dist\naver-video-downloader-v<버전>.zip 을 만든다.
# 실행: PowerShell 에서  .\build.ps1

$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$out   = Join-Path $root 'dist'
$stage = Join-Path $out  'naver-video-downloader'

# 스테이징 폴더 초기화
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

# 배포에 포함할 파일만 복사
Copy-Item (Join-Path $root 'manifest.json')  $stage
Copy-Item (Join-Path $root 'background.js')   $stage
Copy-Item (Join-Path $root 'INSTALL.md')      $stage

New-Item -ItemType Directory -Force (Join-Path $stage 'content') | Out-Null
Copy-Item (Join-Path $root 'content\interceptor.js') (Join-Path $stage 'content')
Copy-Item (Join-Path $root 'content\bridge.js')      (Join-Path $stage 'content')
Copy-Item (Join-Path $root 'content\panel.js')       (Join-Path $stage 'content')

New-Item -ItemType Directory -Force (Join-Path $stage 'popup') | Out-Null
Copy-Item (Join-Path $root 'popup\popup.html') (Join-Path $stage 'popup')
Copy-Item (Join-Path $root 'popup\popup.css')  (Join-Path $stage 'popup')
Copy-Item (Join-Path $root 'popup\popup.js')   (Join-Path $stage 'popup')

New-Item -ItemType Directory -Force (Join-Path $stage 'icons') | Out-Null
Copy-Item (Join-Path $root 'icons\*.png') (Join-Path $stage 'icons')

# 버전 읽어서 zip 이름 구성
# NOTE: Windows PowerShell 5.1은 UTF-8 파일을 ANSI(CP949)로 읽어 한글을 깨뜨린다.
#       그러면 ConvertFrom-Json이 실패하므로, UTF8로 명시해 읽고 정규식으로 버전만 뽑는다.
#       (버전은 ASCII라 한글 손상 여부와 무관하게 안전하다.)
$manifestText = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8
if ($manifestText -match '"version"\s*:\s*"([^"]+)"') {
  $version = $Matches[1]
} else {
  throw "manifest.json에서 version을 찾지 못했습니다."
}
$zip = Join-Path $out ("naver-video-downloader-v{0}.zip" -f $version)
if (Test-Path $zip) { Remove-Item -Force $zip }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip

Write-Host "완료: $zip"
Write-Host "포함 파일:"
Get-ChildItem -Recurse -File $stage | ForEach-Object {
  Write-Host "  " $_.FullName.Replace($stage + '\', '')
}
