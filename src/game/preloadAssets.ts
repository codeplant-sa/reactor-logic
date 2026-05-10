import codeplantLogoUrl from "../../public/codeplant.png";
import floorTextureUrl from "../../public/images/floor1.jpg";
import labWallTextureUrl from "../../public/images/lab1.jpg";
import labWallTextureTwoUrl from "../../public/images/lab2.jpg";
import officeWallTextureUrl from "../../public/images/office1.jpg";
import wallTextureOneUrl from "../../public/images/wall1.jpg";
import wallTextureTwoUrl from "../../public/images/wall2.jpg";
import wallTextureFiveUrl from "../../public/images/wall5.jpg";
import titleImageUrl from "../../public/title.jpg";
import { preloadBackgroundMusic, preloadIntroMusic } from "./audio";

export interface PreloadProgress {
  loaded: number;
  total: number;
  label: string;
}

type PreloadStep = {
  label: string;
  load: () => Promise<void>;
};

const preloadImage = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Image failed to load: ${src}`));
    image.src = src;
  });

const steps: PreloadStep[] = [
  {
    label: "Loading coastal facility image",
    load: () => preloadImage(titleImageUrl)
  },
  {
    label: "Loading CodePlant mark",
    load: () => preloadImage(codeplantLogoUrl)
  },
  {
    label: "Loading lab and reactor wall textures",
    load: async () => {
      await Promise.all([
        preloadImage(floorTextureUrl),
        preloadImage(labWallTextureUrl),
        preloadImage(labWallTextureTwoUrl),
        preloadImage(officeWallTextureUrl),
        preloadImage(wallTextureOneUrl),
        preloadImage(wallTextureTwoUrl),
        preloadImage(wallTextureFiveUrl)
      ]);
    }
  },
  {
    label: "Loading briefing audio",
    load: preloadIntroMusic
  },
  {
    label: "Loading mission audio",
    load: preloadBackgroundMusic
  }
];

export const preloadGameAssets = async (
  onProgress: (progress: PreloadProgress) => void
) => {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    onProgress({
      loaded: index,
      total: steps.length,
      label: step.label
    });
    await step.load();
    onProgress({
      loaded: index + 1,
      total: steps.length,
      label: step.label
    });
  }
};
