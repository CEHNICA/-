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
    // Sync volume/mute state
    setMusicVolume(isSoundOn && isMusicOn ? musicVolume : 0);
    // SFX toggle is checked in play functions

    return isSoundOn;
}

// Volume State
let musicVolume = 0.6;
let sfxVolume = 0.8;
export let isMusicOn = true;
export let isSfxOn = true;



export function setSfxVolume(val) {
    sfxVolume = val;
}

export function toggleMusic(state) {
    isMusicOn = state;
    isMusicOn = state;
    setMusicVolume(musicVolume);
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
// Background Music System

// 1. Intro Music (Meditation) - Web Audio API for zero latency
let introBuffer = null;
let introSource = null;
let introGain = null;

async function loadIntroSound() {
    try {
        initAudio(); // Ensure context allowed
        const response = await fetch('冥想.MP3');
        const arrayBuffer = await response.arrayBuffer();
        introBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to load intro music:", e);
    }
}
loadIntroSound(); // Start fetching immediately

// 2. Flow Music (Rain) - Keep as HTML5 Audio (Streaming suitable for large file)
export let flowMusic = new Audio('下雨.mp3');
flowMusic.loop = true;
flowMusic.volume = musicVolume;
flowMusic.preload = 'metadata'; // Optimize: Don't auto-download 24MB on start

// Track state ('intro' | 'flow' | null)
let currentMode = 'intro';

export function playIntroMusic() {
    // Stop Flow if playing
    flowMusic.pause();
    flowMusic.currentTime = 0;
    currentMode = 'intro';

    playBackgroundMusic();
}

export function playFlowMusic() {
    // Stop Intro if playing
    if (introSource) {
        try { introSource.stop(); } catch (e) { }
        introSource = null;
    }
    currentMode = 'flow';

    playBackgroundMusic();
}

export function playBackgroundMusic() {
    if (!isMusicOn) return;

    initAudio(); // Essential for Web Audio

    if (currentMode === 'intro') {
        if (!introBuffer) return; // Not loaded yet
        if (introSource) return; // Already playing

        try {
            introSource = audioCtx.createBufferSource();
            introSource.buffer = introBuffer;
            introSource.loop = true;

            introGain = audioCtx.createGain();
            introGain.gain.value = musicVolume;

            introSource.connect(introGain);
            introGain.connect(audioCtx.destination);
            introSource.start(0);
        } catch (e) {
            console.error(e);
        }
    } else if (currentMode === 'flow') {
        flowMusic.volume = musicVolume;
        flowMusic.play().catch(e => {
            console.log("Flow music autoplay blocked", e);
            // Interaction logic handled by app.js usually, or add here if needed
        });
    }
}

export function setMusicVolume(val) {
    musicVolume = val;
    // Update Flow
    flowMusic.volume = isMusicOn ? musicVolume : 0;

    // Update Intro (Active Gain)
    if (introGain) {
        introGain.gain.value = isMusicOn ? musicVolume : 0;
    }
}

export function stopBackgroundMusic() {
    // Stop Intro
    if (introSource) {
        try { introSource.stop(); } catch (e) { }
        introSource = null;
    }
    // Stop Flow
    flowMusic.pause();
    flowMusic.currentTime = 0;
}

// Remove legacy bgMusic export usage if possible, or support it minimally
export let bgMusic = {
    // Mock interface to prevent crash if other files access bgMusic directly
    // Ideally refactor app.js to not use this.
    pause: stopBackgroundMusic
};

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
    [victorySound, realFlipSound].forEach(audio => {
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
