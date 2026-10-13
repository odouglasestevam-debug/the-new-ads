import React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { staticFile, useVideoConfig } from "remotion";
import { Cena1Gancho } from "./Cena1Gancho";
import { Cena2Travas } from "./Cena2Travas";
import { Cena3Reurb } from "./Cena3Reurb";
import { Cena4Etapas } from "./Cena4Etapas";
import { Cena6Cta } from "./Cena6Cta";

export type RegularizeMotionProps = {
  readonly narracao: string | null;
};

// Duração de cada cena (quadros a 30 fps); encaixar na narração. Cada transição sobrepõe TRANS quadros.
export const TRANS = 8;
export const DURACOES = [192, 129, 159, 169, 178];
export const DURACAO_TOTAL = DURACOES.reduce((a, b) => a + b, 0) - TRANS * (DURACOES.length - 1);

export const RegularizeMotion: React.FC<RegularizeMotionProps> = ({ narracao }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence name="Gancho" durationInFrames={192} premountFor={fps}>
          <Cena1Gancho />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: TRANS })} />
        <TransitionSeries.Sequence name="Travas" durationInFrames={129} premountFor={fps}>
          <Cena2Travas />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: TRANS })} />
        <TransitionSeries.Sequence name="REURB" durationInFrames={159} premountFor={fps}>
          <Cena3Reurb />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TRANS })} />
        <TransitionSeries.Sequence name="Etapas" durationInFrames={169} premountFor={fps}>
          <Cena4Etapas />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: TRANS })} />
        <TransitionSeries.Sequence name="CTA" durationInFrames={178} premountFor={fps}>
          <Cena6Cta />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {narracao ? <Audio src={staticFile(narracao)} /> : null}
    </>
  );
};
