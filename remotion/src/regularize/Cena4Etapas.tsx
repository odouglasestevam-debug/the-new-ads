import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COR, Fundo, Kicker, MONO } from "./tema";

// "A Regularize cuida de tudo, do levantamento até a matrícula sair."
const ETAPAS = [
  { n: "01", titulo: "Levantamento", sub: "medição do lote e da área" },
  { n: "02", titulo: "Prefeitura", sub: "processo REURB aprovado" },
  { n: "03", titulo: "Cartório", sub: "registro do título" },
  { n: "04", titulo: "Matrícula no seu nome", sub: "o imóvel passa a ser seu no papel" },
];
const INICIO = 51; // "levantamento"
const PASSO = 23; // a 4ª etapa acende em "matrícula"
const TOPO = 640;
const ALTURA = 250;

export const Cena4Etapas: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progresso = interpolate(frame, [INICIO, INICIO + PASSO * 3], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });

  return (
    <Fundo>
      <div style={{ position: "absolute", top: 260, left: 90, right: 90, opacity: interpolate(frame, [0, 10], [0, 1], CLAMP) }}>
        <Kicker>Do começo ao fim</Kicker>
        <div style={{ fontWeight: 900, fontSize: 96, letterSpacing: "-0.035em", lineHeight: 1, marginTop: 30, textTransform: "uppercase" }}>
          A Regularize
          <br />
          <span style={{ color: COR.ouroHi }}>cuida de tudo</span>
        </div>
      </div>

      {/* trilho */}
      <div style={{ position: "absolute", left: 150, top: TOPO + 46, width: 8, height: ALTURA * 3, background: "rgba(224,184,74,.18)", borderRadius: 4 }} />
      <div
        style={{
          position: "absolute",
          left: 150,
          top: TOPO + 46,
          width: 8,
          height: ALTURA * 3 * progresso,
          background: `linear-gradient(180deg, ${COR.ouro}, ${COR.ouroHi})`,
          boxShadow: "0 0 30px rgba(242,210,122,.6)",
          borderRadius: 4,
        }}
      />

      {ETAPAS.map((e, i) => {
        const t = INICIO + PASSO * i;
        const acende = spring({ frame: frame - t, fps, config: { damping: 13, stiffness: 180 } });
        const ultima = i === ETAPAS.length - 1;
        return (
          <div key={e.n} style={{ position: "absolute", top: TOPO + ALTURA * i, left: 106, right: 80, display: "flex", alignItems: "center", gap: 44 }}>
            <div
              style={{
                width: 96,
                height: 96,
                flex: "none",
                borderRadius: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: acende > 0.5 ? `linear-gradient(180deg, ${COR.ouroHi}, ${COR.ouro})` : COR.bgDeep,
                border: `4px solid ${COR.ouro}`,
                boxShadow: `0 0 ${50 * acende}px rgba(242,210,122,${0.6 * acende})`,
                scale: interpolate(acende, [0, 1], [0.7, 1]),
              }}
            >
              {acende > 0.5 ? (
                <svg viewBox="0 0 48 48" width={50} height={50}>
                  <path d="M10 25 L20 35 L38 14" fill="none" stroke="#16183F" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, color: COR.ouroHi }}>{e.n}</span>
              )}
            </div>
            <div
              style={{
                flex: 1,
                padding: ultima ? "30px 36px" : "0px",
                borderRadius: 24,
                background: ultima ? `linear-gradient(180deg, ${COR.ouroHi}, ${COR.ouro})` : "transparent",
                color: ultima ? "#16183F" : COR.branco,
                opacity: interpolate(acende, [0, 1], [0.35, 1]),
                translate: `${interpolate(acende, [0, 1], [40, 0])}px 0px`,
                boxShadow: ultima ? `0 20px 60px rgba(242,210,122,${0.35 * acende})` : "none",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: ultima ? 62 : 66, letterSpacing: "-0.025em", lineHeight: 1.02, textTransform: "uppercase" }}>{e.titulo}</div>
              <div style={{ fontWeight: 500, fontSize: 36, marginTop: 8, color: ultima ? "#2A2C5A" : COR.cinza }}>{e.sub}</div>
            </div>
          </div>
        );
      })}
    </Fundo>
  );
};
