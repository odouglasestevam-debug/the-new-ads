"""Prepara vídeo e fotos do cliente pra landing page.

Uso:
  python midia.py quadros  <video> <pasta> [--cada 0.5]       folha de contato pra escolher quadros
  python midia.py quadro   <video> <saida.jpg> --em 17.5 [--recorte x,y,l,a]
  python midia.py comprimir <video> <saida.mp4> [--largura 540] [--ate 34] [--voz]
  python midia.py poster   <video> <saida.jpg> [--em 2]
  python midia.py webp     <foto> <saida.webp> [--max 1400] [--qualidade 78]

O ffmpeg vem do pacote imageio-ffmpeg (o mesmo da skill edicao-video), então não
precisa estar no PATH. Vídeo de reel costuma ser montado em tela dividida: olhe a
folha de contato antes de recortar um quadro, porque metade dele pode ser outra cena.
"""
import argparse
import glob
import os
import subprocess

from PIL import Image, ImageDraw, ImageOps


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def roda(args):
    subprocess.run([ffmpeg(), "-v", "error", "-y"] + args, check=True)


# Vídeo de iPhone vem em HDR (HLG, bt2020). Sem converter, sai lavado na página e o
# Chrome nem sempre toca HEVC. Mesma conversão da skill edicao-video (common.py).
TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
           "zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


def filtro(video, vf):
    info = subprocess.run([ffmpeg(), "-hide_banner", "-i", video], capture_output=True, text=True, errors="ignore").stderr
    hdr = any(m in info for m in ("arib-std-b67", "smpte2084", "bt2020"))
    return f"{TONEMAP},{vf}" if hdr else vf


def quadros(a):
    os.makedirs(a.pasta, exist_ok=True)
    roda(["-i", a.video, "-vf", filtro(a.video, f"fps={1 / a.cada},scale=180:-2"), "-pix_fmt", "yuvj420p", os.path.join(a.pasta, "t_%03d.jpg")])
    fs = sorted(glob.glob(os.path.join(a.pasta, "t_*.jpg")))
    w, h = Image.open(fs[0]).size
    cols = 12
    folha = Image.new("RGB", (cols * w, ((len(fs) + cols - 1) // cols) * (h + 18)), "white")
    d = ImageDraw.Draw(folha)
    for i, f in enumerate(fs):
        x, y = (i % cols) * w, (i // cols) * (h + 18)
        folha.paste(Image.open(f), (x, y + 18))
        d.text((x + 4, y + 2), f"{i * a.cada:.1f}s", fill="black")
    saida = os.path.join(a.pasta, "folha-de-contato.jpg")
    folha.save(saida, quality=82)
    print("folha:", saida, f"({len(fs)} quadros)")


def quadro(a):
    tmp = a.saida + ".tmp.png"
    roda(["-ss", str(a.em), "-i", a.video, "-frames:v", "1", "-vf", filtro(a.video, "null"), tmp])
    im = Image.open(tmp).convert("RGB")
    if a.recorte:
        x, y, l, al = map(int, a.recorte.split(","))
        im = im.crop((x, y, x + l, y + al))
    im.save(a.saida, quality=80) if not a.saida.endswith(".webp") else im.save(a.saida, quality=78, method=6)
    os.remove(tmp)
    print("quadro:", a.saida, im.size)


def comprimir(a):
    args = ["-i", a.video]
    if a.ate:
        args += ["-t", str(a.ate)]
    # min() não amplia vídeo menor que a largura pedida (ex: 480 px do WhatsApp)
    args += ["-vf", filtro(a.video, f"scale='min({a.largura},iw)':-2"), "-c:v", "libx264", "-crf", "28", "-preset", "slow",
             "-profile:v", "main", "-pix_fmt", "yuv420p"]
    # depoimento tem som: nivela o volume pra um vídeo não sair mais alto que o outro
    args += ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000"] if a.voz else []
    args += ["-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", a.saida]
    roda(args)
    print("vídeo:", a.saida, f"{os.path.getsize(a.saida) / 1e6:.1f} MB")


def poster(a):
    roda(["-ss", str(a.em), "-i", a.video, "-frames:v", "1", "-vf", filtro(a.video, "scale=540:-2"), "-pix_fmt", "yuvj420p", a.saida])
    print("poster:", a.saida)


def webp(a):
    im = ImageOps.exif_transpose(Image.open(a.foto))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    im.thumbnail((a.max, a.max))
    im.save(a.saida, quality=a.qualidade, method=6)
    print("webp:", a.saida, im.size, f"{os.path.getsize(a.saida) / 1e3:.0f} KB")


def main():
    ap = argparse.ArgumentParser(description="Vídeo e fotos pra landing page")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("quadros"); p.add_argument("video"); p.add_argument("pasta"); p.add_argument("--cada", type=float, default=.5); p.set_defaults(f=quadros)
    p = sub.add_parser("quadro"); p.add_argument("video"); p.add_argument("saida"); p.add_argument("--em", type=float, required=True); p.add_argument("--recorte", help="x,y,largura,altura em pixels do vídeo original"); p.set_defaults(f=quadro)
    p = sub.add_parser("comprimir"); p.add_argument("video"); p.add_argument("saida"); p.add_argument("--largura", type=int, default=540); p.add_argument("--ate", type=float); p.add_argument("--voz", action="store_true", help="nivela o volume (depoimento)"); p.set_defaults(f=comprimir)
    p = sub.add_parser("poster"); p.add_argument("video"); p.add_argument("saida"); p.add_argument("--em", type=float, default=2); p.set_defaults(f=poster)
    p = sub.add_parser("webp"); p.add_argument("foto"); p.add_argument("saida"); p.add_argument("--max", type=int, default=1400); p.add_argument("--qualidade", type=int, default=78); p.set_defaults(f=webp)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
