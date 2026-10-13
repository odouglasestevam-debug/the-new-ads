import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COR, Fundo, Kicker } from "./tema";

// "Sem matrícula você não vende, não financia e a herança trava."
const IconeVenda: React.FC = () => (
  <svg viewBox="0 0 120 120" width={150} height={150} fill="none" stroke={COR.ouro} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round">
    <path d="M30 112 V14" />
    <path d="M30 22 H100" />
    <path d="M46 22 V36 M86 22 V36" />
    <rect x="38" y="36" width="56" height="42" rx="5" />
    <path d="M52 57 h28" />
  </svg>
);

const IconeBanco: React.FC = () => (
  <svg viewBox="0 0 120 120" width={150} height={150} fill="none" stroke={COR.ouro} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round">
    <path d="M14 44 L60 16 L106 44 Z" />
    <path d="M28 52 V92 M50 52 V92 M70 52 V92 M92 52 V92" />
    <path d="M12 104 H108" />
  </svg>
);

const IconeFamilia: React.FC = () => (
  <svg viewBox="0 0 120 120" width={150} height={150} fill="none" stroke={COR.ouro} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round">
    <circle cx="36" cy="32" r="13" />
    <circle cx="84" cy="32" r="13" />
    <circle cx="60" cy="62" r="10" />
    <path d="M14 104 V78 a22 22 0 0 1 44 0" />
    <path d="M62 78 a22 22 0 0 1 44 0 V104" />
    <path d="M44 106 V96 a16 16 0 0 1 32 0 V106" />
  </svg>
);

const Linha: React.FC<{ inicio: number; icone: React.ReactNode; texto: string }> = ({ inicio, icone, texto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: frame - inicio, fps, config: { damping: 16 } });
  const risco = interpolate(frame, [inicio + 16, inicio + 26], [0, 1], { ...CLAMP, easing: Easing.bezier(0.7, 0, 0.3, 1) });
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 44,
        padding: "34px 46px",
        borderRadius: 28,
        background: "rgba(17,19,58,.72)",
        border: `2px solid ${COR.linha}`,
        opacity: entra * interpolate(risco, [0, 1], [1, 0.62]),
        translate: `${interpolate(entra, [0, 1], [-260, 0])}px 0px`,
      }}
    >
      {icone}
      <div style={{ fontWeight: 900, fontSize: 82, letterSpacing: "-0.03em", textTransform: "uppercase" }}>{texto}</div>
      {/* risco vermelho atravessando a linha */}
      <div
        style={{
          position: "absolute",
          left: 30,
          top: "50%",
          height: 14,
          width: `calc(${risco * 100}% - ${60 * risco}px)`,
          marginTop: -7,
          borderRadius: 7,
          background: COR.vermelho,
          boxShadow: "0 0 24px rgba(229,72,77,.6)",
          rotate: "-3deg",
          transformOrigin: "0% 50%",
        }}
      />
    </div>
  );
};

export const Cena2Travas: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Fundo>
      <div style={{ position: "absolute", top: 300, left: 90, right: 90 }}>
        <div style={{ opacity: interpolate(frame, [0, 10], [0, 1], CLAMP) }}>
          <Kicker>Sem matrícula</Kicker>
          <div style={{ fontWeight: 900, fontSize: 110, letterSpacing: "-0.035em", lineHeight: 1, marginTop: 30, textTransform: "uppercase" }}>
            você <span style={{ color: COR.vermelho }}>não</span>:
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 80 }}>
          <Linha inicio={22} icone={<IconeVenda />} texto="Vende" />
          <Linha inicio={49} icone={<IconeBanco />} texto="Financia" />
          <Linha inicio={79} icone={<IconeFamilia />} texto="Deixa herança" />
        </div>
      </div>
    </Fundo>
  );
};
