export let isSoundOn = true;
let audioCtx = null;

export function initAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function toggleSoundState() {
    isSoundOn = !isSoundOn;
    initAudio();

    // 同步背景音乐静音状态
    if (bgMusic) {
        bgMusic.muted = !isSoundOn;
    }

    return isSoundOn;
}

// Volume State
let musicVolume = 1.0;
let sfxVolume = 0.8;
export let isMusicOn = true;
export let isSfxOn = true;

export function setMusicVolume(val) {
    musicVolume = val;
    if (bgMusic) bgMusic.volume = isMusicOn ? musicVolume : 0;
    // Update both tracks in case they are paused but will be played
    introMusic.volume = isMusicOn ? musicVolume : 0;
    flowMusic.volume = isMusicOn ? musicVolume : 0;
}

export function setSfxVolume(val) {
    sfxVolume = val;
}

export function toggleMusic(state) {
    isMusicOn = state;
    if (bgMusic) bgMusic.volume = isMusicOn ? musicVolume : 0;
}

export function toggleSfx(state) {
    isSfxOn = state;
}

export function playTone(freq, duration) {
    if (!isSfxOn || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        // 使用正弦波 (sine)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        // Volume control applied here
        const baseVolume = 0.15 * sfxVolume;

        const now = audioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(baseVolume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start(now);
        osc.stop(now + duration);
    } catch (e) { }
}

export function playClickSound() { playTone(350, 0.15); }
export function playFlipSound() { playTone(250, 0.2); }

// 2. Victory Music (MP3)
const victorySound = new Audio('通关.mp3');
export function playVictoryMusic() {
    if (!isMusicOn) return; // Victory sound treated as music? Or SFX? Let's say Music.
    victorySound.volume = musicVolume;
    victorySound.currentTime = 0;
    victorySound.play().catch(() => { });
}

// Real Page Flip Sound (MP3)
const realFlipSound = new Audio('翻页.MP3');
export function playPageFlip() {
    if (!isSfxOn) return;
    realFlipSound.volume = sfxVolume;
    realFlipSound.currentTime = 0;
    realFlipSound.play().catch(() => { });
}

export function playSuccessSound() {
    if (!isSfxOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const baseVolume = 0.1 * sfxVolume;

    [523.25, 659.25, 783.99].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(baseVolume, now + i * 0.05 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.6);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.6);
    });
}
// Background Music System
// 1. Intro Music (Meditation)
export let introMusic = new Audio('冥想.MP3');
introMusic.loop = true;
introMusic.volume = musicVolume;

// 2. Flow Music (Rain)
export let flowMusic = new Audio('下雨.mp3');
flowMusic.loop = true;
flowMusic.volume = musicVolume;

// Current Active Music Track (Default to Intro)
export let currentBgMusic = introMusic;
export let bgMusic = currentBgMusic; // Alias for backward compatibility if needed temporarily


// Helper to switch tracks
export function playIntroMusic() {
    if (bgMusic === flowMusic) {
        flowMusic.pause();
        flowMusic.currentTime = 0;
    }
    bgMusic = introMusic;
    currentBgMusic = introMusic;
    playBackgroundMusic();
}

export function playFlowMusic() {
    if (bgMusic === introMusic) {
        introMusic.pause();
        introMusic.currentTime = 0;
    }
    bgMusic = flowMusic;
    currentBgMusic = flowMusic;
    playBackgroundMusic();
}

export function playBackgroundMusic() {
    if (!isMusicOn) {
        bgMusic.pause();
        return;
    }
    bgMusic.volume = musicVolume;

    // Try to play - catch autoplay policy errors
    bgMusic.play().catch(e => {
        console.log("Autoplay blocked, waiting for interaction:", e);
        const startOnInteraction = () => {
            if (isMusicOn) bgMusic.play();
            document.body.removeEventListener('click', startOnInteraction);
            document.body.removeEventListener('keydown', startOnInteraction);
        };
        document.body.addEventListener('click', startOnInteraction);
        document.body.addEventListener('keydown', startOnInteraction);
    });
}

export function stopBackgroundMusic() {
    introMusic.pause();
    flowMusic.pause();
    introMusic.currentTime = 0;
    flowMusic.currentTime = 0;
}

// Door Opening Sound (Web Audio API for Zero Latency)
let doorBuffer = null;

async function loadDoorSound() {
    try {
        // Create context if needed to decode
        initAudio();
        const response = await fetch('开门.mp3');
        const arrayBuffer = await response.arrayBuffer();
        doorBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to load door sound:", e);
    }
}

// Start loading immediately
loadDoorSound();

// Preload all audio files on page load for instant playback
export function preloadAllSounds() {
    // Trigger loading by loading metadata
    [victorySound, realFlipSound, introMusic, flowMusic].forEach(audio => {
        audio.load();
    });
    // Door sound is preloaded via loadDoorSound()
}

export function playDoorSound() {
    if (!isSfxOn) return;

    initAudio(); // Ensure context is active

    if (doorBuffer && audioCtx) {
        try {
            const source = audioCtx.createBufferSource();
            source.buffer = doorBuffer;

            const gainNode = audioCtx.createGain();
            gainNode.gain.value = sfxVolume;

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            source.start(0);
        } catch (e) {
            console.error("WebAudio play failed", e);
        }
    } else {
        // Fallback
        const tmp = new Audio('开门.mp3');
        tmp.volume = sfxVolume;
        tmp.play().catch(() => { });
    }
}

// Auto-preload
preloadAllSounds();
