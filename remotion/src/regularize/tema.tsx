import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: ARCHIVO } = loadArchivo("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin", "latin-ext"],
});
export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

// Paleta da Regularize (clientes/regularize-imoveis/assets/anuncios-meta/base.css)
export const COR = {
  bg: "#1A1D4A",
  bgDeep: "#11133A",
  bgHi: "#23275E",
  ouro: "#E0B84A",
  ouroHi: "#F2D27A",
  branco: "#F6F4EE",
  cinza: "#B9BCD6",
  vermelho: "#E5484D",
  linha: "rgba(224,184,74,.35)",
};

export const OURO_GRAD = `linear-gradient(180deg, ${COR.ouroHi}, ${COR.ouro})`;

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Fundo comum: azul profundo, grade de planta e brilho dourado que respira
export const Fundo: React.FC<{ children?: React.ReactNode; grade?: boolean }> = ({ children, grade = true }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 70% at 50% 0%, ${COR.bgHi} 0%, ${COR.bg} 55%, ${COR.bgDeep} 100%)`,
        fontFamily: ARCHIVO,
        color: COR.branco,
        overflow: "hidden",
      }}
    >
      {grade ? (
        <AbsoluteFill
          style={{
            backgroundImage:
              "linear-gradient(rgba(224,184,74,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(224,184,74,.07) 1px, transparent 1px)",
            backgroundSize: "90px 90px",
            backgroundPosition: `0px ${frame * 0.6}px`,
            maskImage: "radial-gradient(80% 60% at 50% 45%, black 30%, transparent 100%)",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 25% at 50% ${interpolate(frame, [0, 300], [30, 60])}%, rgba(242,210,122,.16), transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      display: "inline-block",
      fontFamily: MONO,
      fontWeight: 700,
      fontSize: 30,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: COR.ouroHi,
      border: `2px solid ${COR.linha}`,
      borderRadius: 100,
      padding: "14px 30px",
      background: "rgba(17,19,58,.6)",
      ...style,
    }}
  >
    {children}
  </div>
);
