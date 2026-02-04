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

export function playTone(freq, duration) {
    if (!isSoundOn || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        // 修改1：使用正弦波 (sine) 代替三角波 (triangle)，声音更圆润
        osc.type = 'sine';

        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        // 修改2：优化音量包络，避免生硬的爆破音
        const now = audioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.02); // 稍微柔和的起音
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // 自然的衰减

        osc.start(now);
        osc.stop(now + duration);
    } catch (e) { }
}

// 修改3：降低频率，使其不尖锐
// 原来是 600Hz, 现在改为 350Hz，听起来像柔和的泡泡声
export function playClickSound() { playTone(350, 0.15); }
// 翻转声音也相应调整，保持风格统一
export function playFlipSound() { playTone(250, 0.2); }

// 2. Victory Music (MP3)
const victorySound = new Audio('通关.mp3');
export function playVictoryMusic() {
    if (!isSoundOn) return;
    victorySound.currentTime = 0;
    victorySound.play().catch(() => { });
}

// Real Page Flip Sound (MP3)
const realFlipSound = new Audio('翻页.MP3');
export function playPageFlip() {
    if (!isSoundOn) return;
    realFlipSound.currentTime = 0;
    realFlipSound.play().catch(() => { });
}

export function playSuccessSound() {
    if (!isSoundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.1, now + i * 0.05 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.6);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.6);
    });
}
// Background Music
let bgMusic = new Audio('冥想.MP3');
bgMusic.loop = true;
bgMusic.volume = 0.5; // Set reasonable volume

export function playBackgroundMusic() {
    // Try to play - catch autoplay policy errors
    bgMusic.play().catch(e => {
        console.log("Autoplay blocked, waiting for interaction:", e);
        // Fallback: Add one-time click listener to body to start music if blocked
        const startOnInteraction = () => {
            bgMusic.play();
            document.body.removeEventListener('click', startOnInteraction);
            document.body.removeEventListener('keydown', startOnInteraction);
        };
        document.body.addEventListener('click', startOnInteraction);
        document.body.addEventListener('keydown', startOnInteraction);
    });
}

export function stopBackgroundMusic() {
    bgMusic.pause();
    bgMusic.currentTime = 0; // Reset to start
}
