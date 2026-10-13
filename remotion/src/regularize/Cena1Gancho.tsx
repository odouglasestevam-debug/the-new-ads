import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COR, Fundo, Kicker, MONO } from "./tema";

// "Você paga IPTU, tem luz e água no nome... mas no papel a casa não é sua."
// Casa desenhada em linha dourada, recibo entra, carimbo SEM MATRÍCULA bate.
export const CARIMBO_EM = 62;

export const Cena1Gancho: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const desenho = interpolate(frame, [0, 34], [1, 0], { ...CLAMP, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const recibo = spring({ frame: frame - 26, fps, config: { damping: 16, stiffness: 120 } });
  const carimbo = spring({ frame: frame - CARIMBO_EM, fps, config: { damping: 11, stiffness: 260 } });
  const tremor = frame >= CARIMBO_EM && frame < CARIMBO_EM + 8 ? Math.sin(frame * 9) * (CARIMBO_EM + 8 - frame) * 2.2 : 0;
  const titulo = spring({ frame: frame - (CARIMBO_EM + 8), fps, config: { damping: 18 } });

  return (
    <Fundo>
      <AbsoluteFill style={{ translate: `${tremor}px ${tremor * 0.6}px` }}>
        <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center", opacity: interpolate(frame, [4, 16], [0, 1], CLAMP) }}>
          <Kicker>IPTU pago · luz e água no nome</Kicker>
        </div>

        {/* casa em traço dourado */}
        <svg
          viewBox="0 0 600 520"
          style={{ position: "absolute", left: 140, top: 300, width: 800, height: 693, overflow: "visible" }}
        >
          <defs>
            <filter id="brilho" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g
            fill="none"
            stroke={COR.ouro}
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#brilho)"
          >
            <path d="M40 260 L300 50 L560 260" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
            <path d="M100 215 V480 H500 V215" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
            <path d="M255 480 V350 H345 V480" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
            <path d="M140 300 H220 V370 H140 Z" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
            <path d="M380 300 H460 V370 H380 Z" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
            <path d="M400 130 V75 H450 V170" pathLength={1} strokeDasharray={1} strokeDashoffset={desenho} />
          </g>
        </svg>

        {/* recibo de compra e venda */}
        <div
          style={{
            position: "absolute",
            left: 230,
            top: 760,
            width: 620,
            height: 520,
            background: "#FBF8EF",
            borderRadius: 18,
            boxShadow: "0 40px 90px rgba(0,0,0,.55)",
            padding: "46px 50px",
            color: "#2A2C44",
            rotate: `${interpolate(recibo, [0, 1], [14, -4])}deg`,
            translate: `0px ${interpolate(recibo, [0, 1], [900, 0])}px`,
          }}
        >
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 25, letterSpacing: "0.12em" }}>RECIBO DE</div>
          <div style={{ fontWeight: 900, fontSize: 46, lineHeight: 1.05, marginTop: 6 }}>COMPRA E VENDA</div>
          {[0.92, 0.78, 0.86, 0.6, 0.82].map((w, i) => (
            <div key={i} style={{ height: 14, width: `${w * 100}%`, background: "#D9D4C4", borderRadius: 8, marginTop: i === 0 ? 40 : 20 }} />
          ))}
          <div style={{ position: "absolute", bottom: 54, left: 50, width: 240, borderTop: "3px solid #8A8678" }} />
          <div style={{ position: "absolute", bottom: 22, left: 50, fontFamily: MONO, fontSize: 18, color: "#8A8678" }}>assinatura</div>

          {/* carimbo */}
          <div
            style={{
              position: "absolute",
              left: 70,
              top: 210,
              border: `9px solid ${COR.vermelho}`,
              borderRadius: 16,
              padding: "14px 30px",
              color: COR.vermelho,
              fontWeight: 900,
              fontSize: 64,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              mixBlendMode: "multiply",
              opacity: frame >= CARIMBO_EM ? 0.92 : 0,
              scale: interpolate(carimbo, [0, 1], [2.6, 1]),
              rotate: "-13deg",
            }}
          >
            SEM MATRÍCULA
          </div>
        </div>

        {/* título */}
        <div
          style={{
            position: "absolute",
            top: 1390,
            width: "100%",
            textAlign: "center",
            fontWeight: 900,
            fontSize: 104,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            opacity: titulo,
            translate: `0px ${interpolate(titulo, [0, 1], [60, 0])}px`,
          }}
        >
          No papel, a casa
          <br />
          <span
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "6px 24px",
              color: "#16183F",
              background: `linear-gradient(180deg, ${COR.ouroHi}, ${COR.ouro})`,
              borderRadius: 10,
            }}
          >
            não é sua.
          </span>
        </div>
      </AbsoluteFill>
    </Fundo>
  );
};
