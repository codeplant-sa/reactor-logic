import { Howl } from "howler";
import backgroundMusicUrl from "../../public/bg.mp3";
import introMusicUrl from "../../public/intro.mp3";

let backgroundMusic: Howl | null = null;
let introMusic: Howl | null = null;
let muted = false;
let backgroundWanted = false;
let introWanted = false;

const createLoopingMusic = (
  src: string,
  volume: number,
  shouldPlay: () => boolean
): Howl => {
  let sound: Howl;
  sound = new Howl({
    src: [src],
    loop: true,
    volume,
    preload: false,
    html5: false,
    mute: muted,
    onplayerror: () => {
      sound.once("unlock", () => {
        if (shouldPlay() && !muted && !sound.playing()) {
          sound.play();
        }
      });
    }
  });

  return sound;
};

const getBackgroundMusic = (): Howl => {
  if (backgroundMusic) {
    return backgroundMusic;
  }

  backgroundMusic = createLoopingMusic(
    backgroundMusicUrl,
    0.32,
    () => backgroundWanted
  );
  return backgroundMusic;
};

const getIntroMusic = (): Howl => {
  if (introMusic) {
    return introMusic;
  }

  introMusic = createLoopingMusic(introMusicUrl, 0.42, () => introWanted);
  return introMusic;
};

const preloadSound = (sound: Howl): Promise<void> =>
  new Promise((resolve, reject) => {
    if (sound.state() === "loaded") {
      resolve();
      return;
    }

    sound.once("load", () => resolve());
    sound.once("loaderror", (_id, error) =>
      reject(new Error(`Audio failed to load: ${String(error)}`))
    );
    sound.load();
  });

export const preloadIntroMusic = () => preloadSound(getIntroMusic());

export const preloadBackgroundMusic = () => preloadSound(getBackgroundMusic());

export const playIntroMusic = () => {
  backgroundWanted = false;
  introWanted = true;
  backgroundMusic?.stop();

  const sound = getIntroMusic();
  sound.mute(muted);

  if (!muted && !sound.playing()) {
    sound.play();
  }
};

export const stopIntroMusic = () => {
  introWanted = false;
  introMusic?.stop();
};

export const playBackgroundMusic = () => {
  introWanted = false;
  backgroundWanted = true;
  introMusic?.stop();

  const sound = getBackgroundMusic();
  sound.mute(muted);

  if (!muted && !sound.playing()) {
    sound.play();
  }
};

export const setBackgroundMusicMuted = (nextMuted: boolean) => {
  muted = nextMuted;
  backgroundMusic?.mute(nextMuted);
  introMusic?.mute(nextMuted);

  if (!nextMuted) {
    if (backgroundWanted) {
      playBackgroundMusic();
    } else if (introWanted) {
      playIntroMusic();
    }
  }
};

export const isBackgroundMusicMuted = () => muted;

export const stopBackgroundMusic = () => {
  backgroundWanted = false;
  backgroundMusic?.stop();
};
