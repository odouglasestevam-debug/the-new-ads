import React from "react";
import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COR, Fundo } from "./tema";

// "Veja se o seu imóvel pode ser regularizado. Clique e fale com a gente."
export const CLIQUE_EM = 62;

export const Cena6Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 15 } });
  const botao = spring({ frame: frame - 22, fps, config: { damping: 14 } });
  const cursor = interpolate(frame, [30, CLIQUE_EM - 4], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const aperta = interpolate(frame, [CLIQUE_EM - 2, CLIQUE_EM + 2, CLIQUE_EM + 8], [1, 0.93, 1], CLAMP);
  const onda = interpolate(frame, [CLIQUE_EM, CLIQUE_EM + 22], [0, 1], CLAMP);

  return (
    <Fundo>
      <Img
        src={staticFile("regularize/logo.png")}
        style={{
          position: "absolute",
          left: 540 - 300,
          top: 300,
          width: 600,
          opacity: logo,
          scale: interpolate(logo, [0, 1], [0.85, 1]),
          filter: `drop-shadow(0 0 ${40 * logo}px rgba(242,210,122,.35))`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 760,
          left: 90,
          right: 90,
          textAlign: "center",
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          textTransform: "uppercase",
          opacity: interpolate(frame, [8, 20], [0, 1], CLAMP),
          translate: `0px ${interpolate(frame, [8, 20], [40, 0], CLAMP)}px`,
        }}
      >
        Seu imóvel pode
        <br />
        <span style={{ color: COR.ouroHi }}>ser regularizado?</span>
      </div>

      {/* botão */}
      <div style={{ position: "absolute", top: 1180, width: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", opacity: botao, scale: interpolate(botao, [0, 1], [0.8, 1]) * aperta }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 26,
              border: `6px solid ${COR.ouroHi}`,
              scale: interpolate(onda, [0, 1], [1, 1.35]),
              opacity: interpolate(onda, [0, 0.1, 1], [0, 0.9, 0]),
            }}
          />
          <div
            style={{
              padding: "40px 70px",
              borderRadius: 26,
              background: `linear-gradient(180deg, ${COR.ouroHi}, ${COR.ouro})`,
              color: "#16183F",
              fontWeight: 900,
              fontSize: 60,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              boxShadow: "0 24px 70px rgba(242,210,122,.35)",
              whiteSpace: "nowrap",
            }}
          >
            Analise seu imóvel
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1360,
          width: "100%",
          textAlign: "center",
          fontWeight: 500,
          fontSize: 44,
          color: COR.cinza,
          opacity: interpolate(frame, [30, 42], [0, 1], CLAMP),
        }}
      >
        Fale com a nossa equipe
      </div>

      {/* cursor */}
      <svg
        viewBox="0 0 40 52"
        width={84}
        height={109}
        style={{
          position: "absolute",
          left: interpolate(cursor, [0, 1], [900, 640]),
          top: interpolate(cursor, [0, 1], [1700, 1250]),
          opacity: interpolate(frame, [28, 34], [0, 1], CLAMP),
          scale: aperta,
          filter: "drop-shadow(0 6px 10px rgba(0,0,0,.5))",
        }}
      >
        <path d="M4 3 L4 42 L14 32 L21 48 L28 45 L21 29 L35 29 Z" fill="#FFFFFF" stroke="#16183F" strokeWidth={3} strokeLinejoin="round" />
      </svg>
    </Fundo>
  );
};
