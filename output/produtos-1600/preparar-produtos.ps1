Add-Type -AssemblyName System.Drawing
$outputDir = $PSScriptRoot
$sourceDir = 'C:\Users\odoug\Downloads'
$items = @(
    @{ Name = '01-blister-moeda'; Source = 'WhatsApp Image 2026-10-06 at 09.31.41 (3).jpeg'; Crop = @(19, 11, 230, 223); Flag = @(216, 260, 40, 31) },
    @{ Name = '02-blister-livro'; Source = 'WhatsApp Image 2026-10-06 at 09.31.41 (2).jpeg'; Crop = @(30, 25, 215, 208); Flag = @(217, 267, 41, 30) },
    @{ Name = '03-colecao-mega-master'; Source = 'WhatsApp Image 2026-10-06 at 09.31.41 (1).jpeg'; Crop = @(34, 20, 231, 249); Flag = @(230, 281, 41, 33) },
    @{ Name = '04-binder-collection'; Source = 'WhatsApp Image 2026-10-06 at 09.31.41.jpeg'; Crop = @(20, 8, 235, 315); Flag = @(218, 307, 42, 28) },
    @{ Name = '05-display-30th'; Source = 'WhatsApp Image 2026-10-06 at 09.31.42 (1).jpeg'; Crop = @(30, 0, 366, 420); Flag = $null },
    @{ Name = '06-premium-espeon-umbreon'; Source = 'WhatsApp Image 2026-10-06 at 09.31.42.jpeg'; Crop = @(140, 10, 508, 714); Flag = $null }
)
$report = @()
foreach ($item in $items) {
    $sourcePath = Join-Path $sourceDir $item.Source
    $source = [System.Drawing.Bitmap]::new($sourcePath)
    try {
        if ($null -ne $item.Flag) {
            $cleanup = [System.Drawing.Graphics]::FromImage($source)
            try {
                $r = $item.Flag
                $cleanup.FillRectangle([System.Drawing.Brushes]::White, [int]$r[0], [int]$r[1], [int]$r[2], [int]$r[3])
            } finally { $cleanup.Dispose() }
        }
        $crop = $item.Crop
        $scale = [Math]::Min(1440.0 / $crop[2], 1440.0 / $crop[3])
        $destWidth = [int][Math]::Round($crop[2] * $scale)
        $destHeight = [int][Math]::Round($crop[3] * $scale)
        $canvas = [System.Drawing.Bitmap]::new(1600, 1600, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $canvas.SetResolution(300, 300)
            $drawing = [System.Drawing.Graphics]::FromImage($canvas)
            $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
            try {
                $drawing.Clear([System.Drawing.Color]::White)
                $drawing.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $drawing.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $drawing.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
                $dest = [System.Drawing.Rectangle]::new([int][Math]::Round((1600 - $destWidth) / 2), [int][Math]::Round((1600 - $destHeight) / 2), $destWidth, $destHeight)
                $drawing.DrawImage($source, $dest, [single]$crop[0], [single]$crop[1], [single]$crop[2], [single]$crop[3], [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            } finally {
                $attributes.Dispose()
                $drawing.Dispose()
            }
            $pngPath = Join-Path $outputDir ($item.Name + '-1600.png')
            $canvas.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
            $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
            $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
            try {
                $encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]95)
                $jpgPath = Join-Path $outputDir ($item.Name + '-1600.jpg')
                $canvas.Save($jpgPath, $jpegCodec, $encoderParameters)
            } finally { $encoderParameters.Dispose() }
            $report += [PSCustomObject]@{ Source = $item.Source; Output = $item.Name; Width = 1600; Height = 1600; OriginalWidth = $source.Width; OriginalHeight = $source.Height; Crop = $crop; FlagRemoval = $item.Flag; Scale = $scale }
        } finally { $canvas.Dispose() }
    } finally { $source.Dispose() }
}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputDir 'processamento.json') -Encoding UTF8
$report | Select-Object Output, Width, Height, OriginalWidth, OriginalHeight | Format-Table -AutoSize
