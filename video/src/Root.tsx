import React from 'react';
import { Composition } from 'remotion';
import { ShowcaseVideo } from './ShowcaseVideo';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ShowcaseVideo"
        component={ShowcaseVideo}
        durationInFrames={3042}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
