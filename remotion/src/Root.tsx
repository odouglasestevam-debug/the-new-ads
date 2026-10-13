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
          durationInFrames={800}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ narracao: null }}
        />
      </Folder>
    </>
  );
};
