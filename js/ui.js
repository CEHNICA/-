import * as Audio from './audio.js';
import * as Data from './data.js';

let isPlaying = false;
let playMode = 'q_only';
let playInterval = 3000;
let answerInterval = 3000;
let skipMasteredMode = false;
let autoNextOnMastery = true;
let autoPlayTimer = null;
let nextBtnTimer = null;
let prevBtnTimer = null;
let idleTimer = null;
let isNavigating = false;
const IDLE_TIMEOUT = 3000;

export function initUI() {
    setupIdleDetection();
    loadCard(Data.currentIndex);
}

export function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// --- Idle Mode ---
// --- Idle Mode ---
function setupIdleDetection() {
    // 只有鼠标操作会触发唤醒
    ['mousemove', 'mousedown'].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer);
    });

    // 移动端：边缘唤醒 (Edge Wake) Logic
    const WAKE_ZONE_PCT = 0.15; // Top/Bottom 15% triggers wake

    document.addEventListener('touchstart', (e) => {
        const y = e.touches[0].clientY;
        const h = window.innerHeight;
        // Check if touch is at top or bottom edge
        if (y < h * WAKE_ZONE_PCT || y > h * (1 - WAKE_ZONE_PCT)) {
            resetIdleTimer();
        }
    });

    // Mobile Gestures on Flashcard
    const card = document.getElementById('flashcard');
    let startX = 0;
    let startY = 0;
    let isSwipe = false;
    let lastTapTime = 0;

    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwipe = false;
        window.longPressTriggered = false;

        // Start Long Press Timer (600ms) -> Mastery
        window.longPressTimer = setTimeout(() => {
            window.longPressTriggered = true;
            toggleMasteryAction();
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);

        e.stopPropagation();
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        // If moved significantly in ANY direction (X or Y), it's not a tap
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
            isSwipe = true;
            clearTimeout(window.longPressTimer);
        }
        e.stopPropagation(); // No idle reset
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
        clearTimeout(window.longPressTimer); // Cancel timer on release

        // If Long Press triggered, don't do anything else (click suppressed)
        if (window.longPressTriggered) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            return;
        }

        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;

        // 1. Swipe Logic (Nav)
        if (isSwipe && Math.abs(deltaX) > 50) {
            // Only consider it a horizontal swipe if dominant movement is horizontal?
            // For now, if deltaX is large enough and isSwipe is true.
            if (deltaX > 0) manualNav(-1, true); // Swipe Right -> Prev (Smart)
            else manualNav(1, true); // Swipe Left -> Next (Smart)
            if (e.cancelable) e.preventDefault();
        }
        // 2. Single Tap Logic (Immediate Flip!)
        else if (!isSwipe) {
            handleCardClick(); // Immediate flip, no delay!
            if (e.cancelable) e.preventDefault();
        }
        e.stopPropagation();
    });

    resetIdleTimer();
}

export function resetIdleTimer(e) {
    if (e && e.type === 'touchstart') return; // Should be handled by new edge logic, but safety check

    // IGNORE mouse events on flashcard (fix for mobile tap waking UI)
    if (e && (e.type === 'mousedown' || e.type === 'mousemove')) {
        if (e.target && e.target.closest && e.target.closest('#flashcard')) {
            return;
        }
    }

    document.body.classList.remove('idle-mode');
    if (idleTimer) clearTimeout(idleTimer);

    idleTimer = setTimeout(() => {
        const hasModalOpen = document.querySelector('.modal-overlay[style*="flex"]');
        if (!hasModalOpen) {
            document.body.classList.add('idle-mode');
        }
    }, IDLE_TIMEOUT);
}

// --- Card Rendering ---
export function loadCard(index, preserveFlip = false) {
    const flashcard = document.getElementById('flashcard');
    const qBox = document.getElementById('q-text');
    const aBox = document.getElementById('a-text');

    if (!preserveFlip) {
        flashcard.classList.remove('flipped');
    }

    const card = Data.cards[index];
    if (!card) return;

    function updateContent(container, text) {
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'card-text-wrapper';
        if (text.length > 50) wrapper.classList.add('long-text');
        wrapper.textContent = text;
        container.appendChild(wrapper);
        return wrapper;
    }

    const qW = updateContent(qBox, card.q);
    const aW = updateContent(aBox, card.a);

    document.getElementById('progress-str').textContent = `${index + 1} / ${Data.cards.length}`;
    document.querySelector('.progress-sub').textContent = `已掌握: ${Data.masteredCards.size}`;

    const markBtn = document.getElementById('mark-btn');
    if (Data.masteredCards.has(card._id)) {
        markBtn.classList.add('primary');
        markBtn.querySelector('span').textContent = '已掌握';
        markBtn.querySelector('svg').innerHTML = '<path d="M20 6 9 17l-5-5"/>';
        flashcard.classList.add('mastered');
    } else {
        markBtn.classList.remove('primary');
        markBtn.querySelector('span').textContent = '掌握';
        markBtn.querySelector('svg').innerHTML = '<circle cx="12" cy="12" r="10"/>';
        flashcard.classList.remove('mastered');
    }

    if (window.MathJax && window.MathJax.typesetPromise) MathJax.typesetPromise([qW, aW]).catch(() => { });
}

// --- Navigation ---
export function manualNav(dir, skipMastered = true) {
    if (isNavigating) return; // Prevent rapid firing
    isNavigating = true;

    Audio.initAudio();
    if (!isPlaying) {
        Audio.playPageFlip();
    }

    const flashcard = document.getElementById('flashcard');
    const container = document.querySelector('.card-container'); // Use container for slide

    // 1. Prepare Animation Classes
    const outClass = dir === 1 ? 'anim-out-left' : 'anim-out-right';
    const inClass = dir === 1 ? 'anim-in-right' : 'anim-in-left';

    // 2. Start OUT Animation
    container.classList.add(outClass);

    // 3. Wait for OUT to finish (300ms)
    setTimeout(() => {
        // --- DATA UPDATE ---
        let newIndex = Data.currentIndex;
        let found = false;

        if (skipMastered && Data.masteredCards.size < Data.cards.length) {
            // Smart Skip
            let attempts = 0;
            const totalCards = Data.cards.length;
            while (attempts < totalCards) {
                if (dir === 1) newIndex = (newIndex + 1) % totalCards;
                else newIndex = (newIndex - 1 + totalCards) % totalCards;

                const cardId = Data.cards[newIndex]._id;
                if (!Data.masteredCards.has(cardId)) {
                    found = true;
                    break;
                }
                attempts++;
            }
        } else {
            // Sequential (Force Next/Prev regardless of mastery)
            const totalCards = Data.cards.length;
            if (dir === 1) newIndex = (newIndex + 1) % totalCards;
            else newIndex = (newIndex - 1 + totalCards) % totalCards;
            found = true;
        }

        if (found) {
            Data.setCurrentIndex(newIndex);
            loadCard(newIndex, false);
        } else {
            loadCard(Data.currentIndex, false);
        }

        // --- ANIMATION SWITCH ---
        container.classList.remove(outClass);
        void container.offsetWidth;
        container.classList.add(inClass);

        // 4. Wait for IN to finish
        setTimeout(() => {
            container.classList.remove(inClass);
            isNavigating = false;
        }, 300);

        // --- Completion Check (Only trigger in Smart Skip mode when logic demands?)
        // Or trigger always if full? User implies victory when "all mastered".
        // But if sticking to sequential, we might just flip through mastered cards.
        // Let's keep Victory check but maybe only trigger once? 
        // Logic: If playing game (automated/smart), victory makes sense. 
        // If reviewing (manual buttons), maybe less so? 
        // But condition is "when all cards mastered".
        if (Data.masteredCards.size === Data.cards.length) {
            if (isPlaying) stopAutoplay();
            // Only play music if we just arrived here? 
            // Let's just play it for reinforcement.
            // But debouncing might be good.
            Audio.playVictoryMusic();
            showCelebration();
        }

        // --- AutoPlay Handling ---
        if (isPlaying && Data.masteredCards.size < Data.cards.length) {
            clearTimeout(autoPlayTimer);
            runAutoPlayStep();
        }
    }, 300);
}

export function handleSmartNav(e, dir) {
    if (e.detail === 1) {
        if (dir === 1) {
            nextBtnTimer = setTimeout(() => {
                manualNav(1, false);
                nextBtnTimer = null;
            }, 220);
        } else {
            prevBtnTimer = setTimeout(() => {
                manualNav(-1, false);
                prevBtnTimer = null;
            }, 220);
        }
    } else if (e.detail === 2) {
        if (dir === 1) {
            clearTimeout(nextBtnTimer);
            nextBtnTimer = null;
        } else {
            clearTimeout(prevBtnTimer);
            prevBtnTimer = null;
        }
        skipToUnmastered(dir);
    }
}

export function skipToUnmastered(dir) {
    Audio.initAudio();
    if (!isPlaying) {
        Audio.playClickSound();
    }

    let checkIndex = Data.currentIndex;
    let foundIndex = -1;

    for (let i = 0; i < Data.cards.length - 1; i++) {
        checkIndex = (checkIndex + dir + Data.cards.length) % Data.cards.length;
        if (!Data.masteredCards.has(Data.cards[checkIndex]._id)) {
            foundIndex = checkIndex;
            break;
        }
    }

    if (foundIndex !== -1) {
        Data.setCurrentIndex(foundIndex);
        loadCard(foundIndex);

        const flashcard = document.getElementById('flashcard');
        flashcard.classList.add('no-transition');
        void flashcard.offsetWidth;
        flashcard.classList.remove('no-transition');

        if (isPlaying) {
            clearTimeout(autoPlayTimer);
            runAutoPlayStep();
        }
    } else {
        if (Data.masteredCards.size === Data.cards.length) {
            if (isPlaying) stopAutoplay();
            showCelebration();
        }
    }
}

// --- Flip ---
export function handleCardClick() {
    Audio.initAudio();
    const flashcard = document.getElementById('flashcard');
    if (isPlaying) {
        flashcard.classList.toggle('flipped');
        return;
    }
    flashcard.classList.toggle('flipped');
}

// --- Mastery ---
export function toggleMasteryAction(forceState) {
    Audio.initAudio();
    // resetIdleTimer(); // 移除：Enter 键不应打断沉浸模式
    const card = Data.cards[Data.currentIndex];
    if (!card) return;

    let newState;
    if (typeof forceState !== 'undefined') {
        if (forceState && Data.masteredCards.has(card._id)) return;
        newState = forceState;
    } else newState = !Data.masteredCards.has(card._id);

    const flashcard = document.getElementById('flashcard');
    const wasFlipped = flashcard.classList.contains('flipped');

    if (newState) {
        Data.addToMastered(card._id);
        loadCard(Data.currentIndex, true);

        Audio.playSuccessSound();
        document.body.style.backgroundColor = '#D5F5E3';
        setTimeout(() => document.body.style.backgroundColor = '', 300);

        if (Data.masteredCards.size === Data.cards.length) {
            if (isPlaying) stopAutoplay();
            setTimeout(showCelebration, 600);
        }
        else if (!isPlaying && autoNextOnMastery) {
            if (!wasFlipped) {
                setTimeout(() => {
                    flashcard.classList.add('flipped');
                }, 100);
                setTimeout(() => manualNav(1), 1100);
            } else {
                setTimeout(() => manualNav(1), 600);
            }
        }
    } else {
        Data.removeFromMastered(card._id);
        loadCard(Data.currentIndex, true);
    }
}

// --- Celebration ---
export function showCelebration() {
    Audio.initAudio();
    Audio.playVictoryMusic(); // Corrected to use Victory Music (通关.mp3)
    const overlay = document.getElementById('celebration-overlay');
    overlay.style.display = 'flex';
    const colors = ['#3498DB', '#2ECC71', '#F1C40F', '#E74C3C'];
    for (let i = 0; i < 80; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + 'vw';
        c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        c.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
        c.style.animationDelay = Math.random() + 's';
        overlay.appendChild(c);
    }
}

export function restartLearning() {
    document.getElementById('celebration-overlay').style.display = 'none';
    document.querySelectorAll('.confetti').forEach(c => c.remove());
    Data.clearMastered();
    if (Data.isShuffleMode) Data.setCards([...Data.originalCards].sort(() => Math.random() - 0.5));
    Data.setCurrentIndex(0);
    loadCard(0);
}

// --- Autoplay ---
export function toggleAutoplay() {
    if (isPlaying) {
        stopAutoplay();
    } else {
        startAutoplay();
    }
}

function startAutoplay() {
    isPlaying = true;
    document.body.classList.add('autoplay-mode');
    const btn = document.getElementById('play-btn');
    btn.classList.add('playing');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    Audio.initAudio();
    runAutoPlayStep();
}

function stopAutoplay() {
    isPlaying = false;
    document.body.classList.remove('autoplay-mode');
    if (autoPlayTimer) clearTimeout(autoPlayTimer);
    const btn = document.getElementById('play-btn');
    btn.classList.remove('playing');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}

function runAutoPlayStep() {
    if (!isPlaying) return;
    const flashcard = document.getElementById('flashcard');

    if (flashcard.classList.contains('flipped')) flashcard.classList.remove('flipped');
    Audio.playFlipSound();

    autoPlayTimer = setTimeout(() => {
        if (!isPlaying) return;

        if (playMode === 'q_only') {
            moveToNextAutoCard();
        } else {
            flashcard.classList.add('flipped');
            autoPlayTimer = setTimeout(() => {
                if (isPlaying) moveToNextAutoCard();
            }, answerInterval);
        }
    }, playInterval);
}

function moveToNextAutoCard() {
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.add('no-transition');

    if (skipMasteredMode) {
        let found = false, idx = Data.currentIndex;
        for (let i = 0; i < Data.cards.length; i++) {
            idx = (idx + 1) % Data.cards.length;
            if (!Data.masteredCards.has(Data.cards[idx]._id)) {
                Data.setCurrentIndex(idx); found = true; break;
            }
        }
        if (!found) { stopAutoplay(); showCelebration(); return; }
    } else {
        Data.setCurrentIndex((Data.currentIndex + 1) % Data.cards.length);
    }

    loadCard(Data.currentIndex);
    void flashcard.offsetWidth;
    flashcard.classList.remove('no-transition');

    runAutoPlayStep();
}

// --- Settings Modals ---
export function openPlaySettings() { document.getElementById('play-settings-modal').style.display = 'flex'; }
export function closePlaySettings() { document.getElementById('play-settings-modal').style.display = 'none'; }

export function selectPlayMode(mode, el) {
    playMode = mode;
    document.querySelectorAll('.settings-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('answer-time-group').style.opacity = (mode === 'q_only') ? 0.3 : 1;
}

export function updateIntervalDisplay(v) { playInterval = v * 1000; document.getElementById('interval-display').innerText = v + 's'; }
export function updateAnswerIntervalDisplay(v) { answerInterval = v * 1000; document.getElementById('answer-interval-display').innerText = v + 's'; }
export function toggleSkipMastered(el) { skipMasteredMode = el.checked; }
export function toggleAutoNextOnMastery(el) { autoNextOnMastery = el.checked; }

export function getIsPlaying() { return isPlaying; }

// --- Pre-rendering & Startup ---
export async function startPreRendering() {
    const modal = document.getElementById('rendering-modal');
    const bar = document.getElementById('render-bar');
    const txt = document.getElementById('render-text');
    modal.style.display = 'flex';

    const hiddenDiv = document.createElement('div');
    hiddenDiv.style.position = 'absolute';
    hiddenDiv.style.visibility = 'hidden';
    hiddenDiv.style.top = '-9999px';
    document.body.appendChild(hiddenDiv);

    // We access cards from Data module
    const cards = Data.cards;
    const batchSize = 10;
    for (let i = 0; i < cards.length; i += batchSize) {
        hiddenDiv.innerHTML = '';
        const batch = cards.slice(i, i + batchSize);
        batch.forEach(card => {
            const d1 = document.createElement('div'); d1.innerText = card.q;
            const d2 = document.createElement('div'); d2.innerText = card.a;
            hiddenDiv.appendChild(d1); hiddenDiv.appendChild(d2);
        });
        if (window.MathJax && window.MathJax.typesetPromise) {
            try { await MathJax.typesetPromise([hiddenDiv]); } catch (e) { }
        }
        const percent = Math.min(100, Math.round(((i + batchSize) / cards.length) * 100));
        bar.style.width = percent + '%';
        txt.textContent = `${percent}%`;
        await new Promise(r => setTimeout(r, 10));
    }
    document.body.removeChild(hiddenDiv);
    modal.style.display = 'none';

    showFlowStartScreen();
}

function showFlowStartScreen() {
    document.body.classList.add('focus-mode');
    if (document.getElementById('upload-box')) document.getElementById('upload-box').style.display = 'none';

    const startScreen = document.getElementById('flow-start-screen');
    startScreen.classList.add('active');

    Data.setCurrentIndex(0);
    loadCard(0);

    document.querySelector('.header').classList.remove('visible');
    document.querySelectorAll('.controls').forEach(el => el.classList.remove('visible'));
    document.getElementById('app-box').style.display = 'none';
}

export function enterMainInterface() {
    const startScreen = document.getElementById('flow-start-screen');
    startScreen.style.opacity = 0;
    setTimeout(() => {
        startScreen.classList.remove('active');
        startScreen.style.display = 'none';

        document.body.classList.remove('focus-mode');

        const appBox = document.getElementById('app-box');
        appBox.style.display = 'flex';
        appBox.style.opacity = 0;

        let op = 0;
        const t = setInterval(() => {
            op += 0.1;
            appBox.style.opacity = op;
            if (op >= 1) {
                clearInterval(t);
                document.querySelector('.header').classList.add('visible');
                document.querySelectorAll('.controls').forEach(el => el.classList.add('visible'));

                document.getElementById('play-btn').style.display = 'flex';
                document.getElementById('settings-btn').style.display = 'flex';
                document.getElementById('camera-btn').style.display = 'flex';
            }
        }, 30);

        resetIdleTimer();
    }, 600);
}

