import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ARCHIVO, CLAMP, COR, Kicker, MONO } from "./tema";

// Prova real: entrega dos títulos no Núcleo de Vila (Urussanga/SC). Vídeo da entrega e depois a foto do grupo.
export const TROCA_FOTO = 66;

export const Cena5Prova: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tag = spring({ frame: frame - 6, fps, config: { damping: 16 } });
  const flash = interpolate(frame, [TROCA_FOTO - 3, TROCA_FOTO, TROCA_FOTO + 6], [0, 0.85, 0], CLAMP);

  return (
    <AbsoluteFill style={{ background: COR.bgDeep, fontFamily: ARCHIVO, color: COR.branco }}>
      <Sequence name="Vídeo da entrega" durationInFrames={TROCA_FOTO} premountFor={fps}>
        <Video
          src={staticFile("regularize/prova-entrega.mp4")}
          muted
          objectFit="cover"
          style={{ position: "absolute", width: "100%", height: "100%", scale: interpolate(frame, [0, TROCA_FOTO], [1.04, 1.12]) }}
        />
      </Sequence>
      <Sequence name="Foto do grupo" from={TROCA_FOTO} premountFor={fps}>
        <Img
          src={staticFile("regularize/entrega-grupo.jpg")}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "58% 50%",
            scale: interpolate(frame, [TROCA_FOTO, TROCA_FOTO + 90], [1.18, 1.06], CLAMP),
          }}
        />
      </Sequence>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(17,19,58,.75) 0%, rgba(17,19,58,0) 30%, rgba(17,19,58,0) 52%, rgba(17,19,58,.95) 82%)" }} />
      <AbsoluteFill style={{ background: "#FFF6DA", opacity: flash }} />

      <div style={{ position: "absolute", top: 170, width: "100%", textAlign: "center", opacity: tag }}>
        <Kicker style={{ background: "rgba(17,19,58,.85)" }}>● Entrega real</Kicker>
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          bottom: 260,
          opacity: interpolate(frame, [12, 24], [0, 1], CLAMP),
          translate: `0px ${interpolate(frame, [12, 24], [40, 0], CLAMP)}px`,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 100, lineHeight: 1, letterSpacing: "-0.035em", textTransform: "uppercase" }}>
          Títulos
          <br />
          <span style={{ color: COR.ouroHi }}>entregues</span>
        </div>
        <div style={{ marginTop: 26, display: "inline-block", fontFamily: MONO, fontWeight: 700, fontSize: 32, letterSpacing: "0.08em", borderLeft: `6px solid ${COR.ouro}`, padding: "10px 20px", background: "rgba(17,19,58,.8)" }}>
          NÚCLEO DE VILA · URUSSANGA/SC
        </div>
      </div>
    </AbsoluteFill>
  );
};
