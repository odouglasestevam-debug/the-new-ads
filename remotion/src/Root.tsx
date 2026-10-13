import { Composition, Folder } from "remotion";
import { MyComposition } from "./Composition";
import { RegularizeMotion } from "./regularize/RegularizeMotion";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Folder name="Regularize">
        <Composition
          id="RegularizeReurb"
          component={RegularizeMotion}
          durationInFrames={758}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ narracao: "regularize/narracao.wav", trilha: "regularize/trilha.mp3", volumeTrilha: 0.024 }}
        />
      </Folder>
    </>
  );
};
