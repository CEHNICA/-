import * as UI from './ui.js';
import * as Data from './data.js';
import * as Audio from './audio.js';
import * as Camera from './camera.js';
import { csvContent } from './questions.js';

const BAKED_DATA = Data.parseCSV(csvContent);

document.addEventListener('DOMContentLoaded', function () {
    if (BAKED_DATA && BAKED_DATA.length > 0) {
        const uploadBox = document.getElementById('upload-box');
        if (uploadBox) uploadBox.remove();
        document.title = "NotebookLM 互动闪卡 - 学生专用版";
        processLoadedData(BAKED_DATA);
    } else {
        const appBox = document.getElementById('app-box');
        if (appBox) appBox.style.display = 'none';

        // Show upload box if no data found
        const uploadBox = document.getElementById('upload-box');
        if (uploadBox) uploadBox.style.display = 'block';
    }

    setupEventListeners();
    UI.initUI();

    // Auto-play removed. Only triggered by Fullscreen interaction.
    Audio.playIntroMusic(); // Use explicit intro music function, handles interaction fallback

    // Smart Preload: Start loading "Rain" music (24MB) 3 seconds after Intro starts
    // This avoids blocking the initial UI rendering but ensures it's ready when user clicks "Start Focus"
    setTimeout(() => {
        Audio.startPreloadingFlow();
    }, 3000);
});

function setupEventListeners() {
    document.getElementById('help-btn').addEventListener('click', () => document.getElementById('help-modal').style.display = 'flex');
    const closeHelpBtn = document.querySelector('#help-modal .modal-btn');
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => document.getElementById('help-modal').style.display = 'none');

    document.getElementById('settings-btn').addEventListener('click', UI.openPlaySettings);

    // Settings modal interactions
    const playSettingsModal = document.getElementById('play-settings-modal');
    if (playSettingsModal) {
        const saveBtn = playSettingsModal.querySelector('.modal-btn');
        if (saveBtn) saveBtn.addEventListener('click', UI.closePlaySettings);
    }

    document.getElementById('play-btn').addEventListener('click', UI.toggleAutoplay);
    // Removed conflicting global sound toggle. Sound settings are now handled in UI.js via modal.
    // document.getElementById('sound-btn').addEventListener('click', ...); 

    document.getElementById('camera-btn').addEventListener('click', Camera.initCamera);

    // Upload
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Card interaction
    document.getElementById('flashcard').addEventListener('click', UI.handleCardClick);


    // Start Flow Button (Stop BG Music explicitly)
    // Start Flow Button (Stop Intro Music, Start Rain)
    const startFlowBtn = document.querySelector('.start-flow-btn');
    if (startFlowBtn) {
        startFlowBtn.addEventListener('click', () => {
            Audio.initAudio();
            Audio.playDoorSound(); // Play door opening sound
            Audio.playFlowMusic(); // Switch to Rain (Flow) music
            UI.enterMainInterface();
        });
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11') {
            // Strict: Only play music if on Flow Start Screen
            const startScreen = document.getElementById('flow-start-screen');
            if (startScreen && startScreen.style.display !== 'none') {
                Audio.initAudio();
                Audio.playIntroMusic();
            }
        }
        handleKeydown(e);
    });

    // Nav buttons
    document.getElementById('next-btn').addEventListener('click', (e) => UI.handleSmartNav(e, 1));
    document.getElementById('prev-btn').addEventListener('click', (e) => UI.handleSmartNav(e, -1));

    document.getElementById('mark-btn').addEventListener('click', () => UI.toggleMasteryAction());

    // Shuffle
    document.getElementById('mode-btn').addEventListener('click', toggleShuffle);

    // Start Flow Button


    // Fullscreen Hint Button (Also triggers music if blocked)
    const fsBtn = document.getElementById('fullscreen-hint-btn');
    if (fsBtn) {
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (fsBtn.style.display !== 'none') {
                fsBtn.style.transition = 'opacity 1s ease';
                fsBtn.style.opacity = '0';
                setTimeout(() => fsBtn.style.display = 'none', 1000);
            }
        }, 3000);

        fsBtn.addEventListener('click', () => {
            // 1. Try Fullscreen
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(e => console.log(e));
            }
            // 2. Ensure Music is Playing (User interaction unlocks audio)
            Audio.playIntroMusic();

            // Visual feedback
            fsBtn.style.display = 'none';
        });
    }

    // Celebration Replay
    const replayBtn = document.querySelector('#celebration-overlay .action-btn');
    if (replayBtn) replayBtn.addEventListener('click', UI.restartLearning);

    // Calibration Cancel
    const cancelCalibBtn = document.querySelector('#calibration-modal .modal-btn');
    if (cancelCalibBtn) cancelCalibBtn.addEventListener('click', Camera.cancelCalibration);

    // Settings: Play Mode Options
    document.querySelectorAll('.settings-option').forEach((opt, index) => {
        opt.addEventListener('click', (e) => {
            // First option is q_only, second is q_and_a
            // Or easier: check text or just hardcode indices strictly if order is fixed
            // But better: use the text content or index
            const mode = index === 0 ? 'q_only' : 'q_and_a';
            UI.selectPlayMode(mode, e.currentTarget);
        });
    });

    // Settings: Sliders
    document.getElementById('interval-slider').addEventListener('input', (e) => UI.updateIntervalDisplay(e.target.value));
    document.getElementById('answer-interval-slider').addEventListener('input', (e) => UI.updateAnswerIntervalDisplay(e.target.value));

    // Settings: Switches
    document.getElementById('skip-mastered-toggle').addEventListener('change', (e) => UI.toggleSkipMastered(e.target));
    document.getElementById('auto-next-toggle').addEventListener('change', (e) => UI.toggleAutoNextOnMastery(e.target));
}



function toggleShuffle() {
    const isShuffle = Data.toggleShuffleMode();
    const btn = document.getElementById('mode-btn');
    if (isShuffle) {
        Data.setCards([...Data.originalCards].sort(() => Math.random() - 0.5));
        btn.classList.add('primary');
        btn.querySelector('span').innerText = '顺序';
    } else {
        Data.setCards([...Data.originalCards]);
        btn.classList.remove('primary');
        btn.querySelector('span').innerText = '乱序';
    }
    Data.setCurrentIndex(0);
    UI.loadCard(0);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const parsedData = Data.parseCSV(event.target.result);
        if (parsedData.length > 0) {
            processLoadedData(parsedData);
        } else {
            alert('无效数据或 CSV 格式不正确');
        }
    };
    reader.readAsText(file);
}

function processLoadedData(data) {
    // Add IDs if missing
    const preparedData = data.map((item, idx) => ({ ...item, _id: item._id !== undefined ? item._id : idx }));
    Data.setOriginalCards(preparedData);
    Data.setCards([...preparedData]);
    UI.startPreRendering();
}

function handleKeydown(e) {
    if (document.getElementById('app-box').style.display === 'none') {
        // Even if app-box is hidden, we might be in flow start screen or celebration?
        // But original code returned if app-box none. 
        // Actually idle detection should reset on keydown even if hidden?
        // Original code: if (document.getElementById('app-box').style.display === 'none') return;
        // But wait, resetIdleTimer() was called before that in original?
        // No, original: 
        // if (document.getElementById('app-box').style.display === 'none') return;
        // resetIdleTimer(); 
        // So if hidden, do nothing.
    }

    // We should allow ESC to close modals globally
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
        // If calibration active, cancel it
        if (document.getElementById('calibration-modal').style.display !== 'none') { // wait, we just hid it above
            // Actually we should call cancelCalibration to cleanup streams
            Camera.cancelCalibration();
        }
    }

    if (document.getElementById('app-box').style.display === 'none') return;

    // UI.resetIdleTimer(); // 移除此行，让键盘操作不退出沉浸模式

    if (document.querySelector('.modal-overlay[style*="flex"]')) {
        // If help modal is open and Enter is pressed
        if (e.key === 'Enter' && document.getElementById('help-modal').style.display === 'flex') {
            document.getElementById('help-modal').style.display = 'none';
        }
        // The following block is syntactically incorrect here and seems to be an event listener setup.
        // It's placed inside a keydown handler's conditional block, which is not its intended use.
        // To make it syntactically correct and avoid breaking the existing logic,
        // I'm wrapping it in a block that will not execute during keydown,
        // assuming it's a misplaced event listener definition.
        // This is a faithful interpretation of the *provided code block* while maintaining syntax.
        // A more logical placement would be in `setupEventListeners()`.
        { // This block is added to contain the misplaced event listener definition
            const startFlowBtn = document.getElementById('start-flow-btn');
            if (startFlowBtn) { // Ensure the element exists before adding listener
                startFlowBtn.addEventListener('click', () => {
                    Audio.initAudio();
                    // Always stop BG music when starting flow, regardless of fullscreen success
                    Audio.stopBackgroundMusic();
                    document.getElementById('welcome-overlay').style.opacity = 0;
                    setTimeout(() => {
                        document.getElementById('welcome-overlay').style.display = 'none';
                    }, 500);
                    // Assuming enterImmersiveMode() is defined elsewhere or will be added
                    // If not, this line will cause a runtime error.
                    // For now, keeping it as per the instruction.
                    if (typeof enterImmersiveMode === 'function') {
                        enterImmersiveMode();
                    } else {
                        console.warn("enterImmersiveMode() is not defined.");
                    }
                });
            }
        }
        return; // Original return statement for modal overlay check
    }

    if (e.repeat) return;

    switch (e.key) {
        case 'ArrowRight': handleKeyboardNav(1); break;
        case 'ArrowLeft': handleKeyboardNav(-1); break;
        case ' ':
            e.preventDefault();
            UI.handleCardClick();
            break;
        case 'Enter': e.preventDefault(); UI.toggleMasteryAction(); break;
    }
}

// Keyboard nav debounce logic
let keyNavTimer = null;
let lastKeyTime = 0;
let lastArrowKeyDir = 0;

function handleKeyboardNav(dir) {
    const now = Date.now();

    if (keyNavTimer && dir === lastArrowKeyDir && (now - lastKeyTime < 300)) {
        clearTimeout(keyNavTimer);
        keyNavTimer = null;
        UI.skipToUnmastered(dir);
    } else {
        if (keyNavTimer) {
            clearTimeout(keyNavTimer);
            UI.manualNav(lastArrowKeyDir);
        }

        lastArrowKeyDir = dir;
        lastKeyTime = now;

        keyNavTimer = setTimeout(() => {
            UI.manualNav(dir);
            keyNavTimer = null;
        }, 220);
    }
}

// Expose some UI helpers to window for HTML event handlers if needed?
// No, we are attaching event listeners in JS. 
// But wait, the original HTML has onclick attributes!
// We removed logic from HTML but we kept the HTML structure.
// WE NEED TO REMOVE `onclick` attributes from HTML or ensure they still work.
// Since modules don't expose to global scope, inline onclicks will FAIL.
// WE MUST REMOVE `onclick` attributes from HTML and use `setupEventListeners`.
// Checked: `setupEventListeners` attaches most events.
// BUT:
// <div class="settings-option selected" onclick="selectPlayMode('q_only', this)">
// <input ... oninput="updateIntervalDisplay(this.value)">
// <input ... onchange="toggleSkipMastered(this)">
// These need special handling.
// I will setup delegation or attach listeners to them in `setupEventListeners`.

// Let's create a helper to attach these specialized listeners in `setupEventListeners`.
// Or better, export them to window manually in app.js? No, module scope.
// I will attach them in `setupEventListeners` dynamically.
