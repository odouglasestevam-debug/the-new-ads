import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COR, Fundo, Kicker, MONO } from "./tema";

// "A saída tem nome: REURB, a regularização fundiária prevista em lei."
// Bairro visto de cima em perspectiva: os lotes ganham contorno dourado um a um (levantamento), depois REURB entra.
const COLS = 4;
const ROWS = 6;
const LOTE = 230;
const ordem = [9, 14, 5, 18, 2, 21, 12, 7, 16, 0, 23, 10, 3, 19, 13, 6, 22, 1, 17, 8, 11, 20, 4, 15];

export const Cena3Reurb: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sobe = spring({ frame: frame - 48, fps, config: { damping: 14, stiffness: 140 } });
  const varre = interpolate(frame, [0, 70], [-10, 110], CLAMP);

  return (
    <Fundo grade={false}>
      {/* mapa em perspectiva */}
      <AbsoluteFill style={{ perspective: 1400, perspectiveOrigin: "50% 20%" }}>
        <div
          style={{
            position: "absolute",
            left: (1080 - COLS * LOTE) / 2,
            top: 560,
            width: COLS * LOTE,
            height: ROWS * LOTE,
            transformOrigin: "50% 0%",
            rotate: `x ${interpolate(frame, [0, 150], [52, 46])}deg`,
            scale: interpolate(frame, [0, 150], [1.12, 1.0]),
            opacity: interpolate(sobe, [0, 1], [1, 0.45]),
          }}
        >
          {/* ruas */}
          <div style={{ position: "absolute", inset: -60, background: "#151842", borderRadius: 30 }} />
          {Array.from({ length: COLS * ROWS }).map((_, i) => {
            const c = i % COLS;
            const r = Math.floor(i / COLS);
            const t = 8 + ordem.indexOf(i) * 2.2;
            const marca = interpolate(frame, [t, t + 8], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: c * LOTE + 14,
                  top: r * LOTE + 14,
                  width: LOTE - 28,
                  height: LOTE - 28,
                  borderRadius: 10,
                  background: "rgba(35,39,94,.95)",
                  border: `5px solid rgba(224,184,74,${0.12 + 0.88 * marca})`,
                  boxShadow: `0 0 ${36 * marca}px rgba(242,210,122,${0.45 * marca})`,
                }}
              >
                {/* telhado da casa no lote */}
                <div
                  style={{
                    position: "absolute",
                    left: "26%",
                    top: "22%",
                    width: "48%",
                    height: "40%",
                    borderRadius: 6,
                    background: `linear-gradient(90deg, #2E3372 50%, #262A63 50%)`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    bottom: 8,
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 22,
                    color: COR.ouroHi,
                    opacity: marca,
                  }}
                >
                  L{String(i + 1).padStart(2, "0")}
                </div>
              </div>
            );
          })}
          {/* linha de varredura do levantamento */}
          <div
            style={{
              position: "absolute",
              left: -60,
              right: -60,
              top: `${varre}%`,
              height: 8,
              background: COR.ouroHi,
              boxShadow: `0 0 50px 18px rgba(242,210,122,.45)`,
              opacity: interpolate(frame, [60, 72], [1, 0], CLAMP),
            }}
          />
        </div>
      </AbsoluteFill>

      {/* contador do levantamento */}
      <div style={{ position: "absolute", top: 200, width: "100%", textAlign: "center", opacity: interpolate(frame, [0, 10, 50, 60], [0, 1, 1, 0], CLAMP) }}>
        <Kicker>Levantamento · {Math.min(24, Math.floor(interpolate(frame, [8, 62], [0, 24], CLAMP)))} lotes</Kicker>
      </div>

      {/* REURB */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", top: -120 }}>
        <div style={{ opacity: sobe, translate: `0px ${interpolate(sobe, [0, 1], [40, 0])}px`, marginBottom: 20 }}>
          <Kicker>A saída tem nome</Kicker>
        </div>
        <div
          style={{
            fontWeight: 900,
            fontSize: 250,
            lineHeight: 0.9,
            letterSpacing: `${interpolate(sobe, [0, 1], [0.12, -0.03])}em`,
            background: `linear-gradient(180deg, #FFF1C4 0%, ${COR.ouroHi} 40%, ${COR.ouro} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: `drop-shadow(0 18px 50px rgba(0,0,0,.6)) drop-shadow(0 0 40px rgba(242,210,122,${0.35 * sobe}))`,
            opacity: sobe,
            scale: interpolate(sobe, [0, 1], [1.25, 1]),
          }}
        >
          REURB
        </div>
        <div
          style={{
            marginTop: 30,
            fontWeight: 800,
            fontSize: 58,
            textAlign: "center",
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            opacity: interpolate(frame, [76, 90], [0, 1], CLAMP),
            translate: `0px ${interpolate(frame, [76, 90], [30, 0], CLAMP)}px`,
          }}
        >
          Regularização fundiária
          <br />
          <span style={{ color: COR.ouroHi }}>prevista em lei</span>
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 30,
            color: COR.cinza,
            letterSpacing: "0.1em",
            opacity: interpolate(frame, [114, 126], [0, 1], CLAMP),
          }}
        >
          LEI FEDERAL 13.465/2017
        </div>
      </AbsoluteFill>
    </Fundo>
  );
};
