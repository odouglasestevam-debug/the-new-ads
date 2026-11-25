param([Parameter(Mandatory=$true)][string]$OverlayPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = $PSScriptRoot
$sourcePath = 'C:\Users\odoug\Downloads\IMG_1269.JPG.jpeg'
$originalHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
$photo = [System.Drawing.Bitmap]::FromFile($sourcePath)
$overlay = [System.Drawing.Bitmap]::FromFile($OverlayPath)
$master = $photo.Clone((New-Object System.Drawing.Rectangle(0, 0, $photo.Width, $photo.Height)), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($master)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$scale = $master.Width / 1080.0
$topSource = New-Object System.Drawing.Rectangle(0, 0, $overlay.Width, 500)
$topTarget = New-Object System.Drawing.Rectangle(0, 0, $master.Width, ([int](500.0 / $overlay.Height * $master.Height)))
$graphics.SetClip((New-Object System.Drawing.Rectangle(0, 0, $master.Width, ([int](470 * $scale)))))
$graphics.DrawImage($overlay, $topTarget, $topSource, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.ResetClip()
$bottomSource = New-Object System.Drawing.Rectangle(0, 1450, $overlay.Width, ($overlay.Height - 1450))
$bottomTarget = New-Object System.Drawing.Rectangle(0, ([int](1460 * $scale)), $master.Width, ([int](($overlay.Height - 1450.0) / $overlay.Height * $master.Height)))
$graphics.DrawImage($overlay, $bottomTarget, $bottomSource, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$master.Save((Join-Path $destination 'lash-lifting-original-resolucao.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$export = New-Object System.Drawing.Bitmap(1080, 1920, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
$graphics = [System.Drawing.Graphics]::FromImage($export)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.DrawImage($master, (New-Object System.Drawing.Rectangle(0, 0, 1080, 1920)), (New-Object System.Drawing.Rectangle(0, 0, $master.Width, $master.Height)), [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$export.Save((Join-Path $destination 'lash-lifting-1080x1920.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$preview = New-Object System.Drawing.Bitmap(540, 960)
$graphics = [System.Drawing.Graphics]::FromImage($preview)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($export, 0, 0, 540, 960)
$graphics.Dispose()
$preview.Save((Join-Path $destination 'preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$samePixels = 0
$differentPixels = 0
for ($y = [int]($photo.Height * 0.25); $y -lt [int]($photo.Height * 0.76); $y += 11) {
    for ($x = 0; $x -lt $photo.Width; $x += 11) {
        if ($photo.GetPixel($x, $y).ToArgb() -eq $master.GetPixel($x, $y).ToArgb()) { $samePixels++ } else { $differentPixels++ }
    }
}
[PSCustomObject]@{
    OriginalFileUnchanged = $originalHash -eq (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    OverlayWidth = $overlay.Width
    OverlayHeight = $overlay.Height
    OriginalPhotoWidth = $photo.Width
    OriginalPhotoHeight = $photo.Height
    FaceRegionIdenticalSampledPixels = $samePixels
    FaceRegionDifferentSampledPixels = $differentPixels
    Export = '1080x1920'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'verificacao.json') -Encoding UTF8
$preview.Dispose()
$export.Dispose()
$master.Dispose()
$overlay.Dispose()
$photo.Dispose()
Get-Content -LiteralPath (Join-Path $destination 'verificacao.json')
