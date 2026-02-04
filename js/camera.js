import { showToast, toggleMasteryAction, manualNav, handleCardClick } from './ui.js';
import { playFlipSound } from './audio.js';

// Global Hands from CDN
let hands = null;
export let isCameraOn = false;
let isCameraInitializing = false;

// Gesture State
let activeGestureType = null;
let gestureHoldStartTime = null;
let isGestureLocked = false;
let gestureEnableTime = 0;

// Configuration
const BASE_HOLD_DURATION = 400; // default (OK)
const FLIP_HOLD_DURATION = 300; // faster for flip (Palms)
let videoStream = null;
let animationFrameId = null;
let lastProcessTime = 0;
const PROCESS_INTERVAL = 100; // Throttle AI detection

export async function initCamera() {
    if (isCameraInitializing) return;
    const btn = document.getElementById('camera-btn');

    if (isCameraOn) {
        // Turn Off
        isCameraInitializing = true;
        btn.classList.add('loading');
        disableWebcam();
        isCameraOn = false;
        btn.classList.remove('camera-on');
        btn.classList.remove('loading');
        isCameraInitializing = false;
        showToast("摄像头已关闭", 2000);
        return;
    }

    // Turn On
    isCameraInitializing = true;
    btn.classList.add('loading');

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Browser API not supported");
        }

        // Initialize Hands if not already done
        if (!hands) {
            if (window.Hands) {
                hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
                hands.setOptions({
                    maxNumHands: 2,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                hands.onResults(onHandResults);
            } else {
                throw new Error("MediaPipe Hands library not loaded globally.");
            }
        }

        await startCameraStream();
    } catch (e) {
        console.error("Camera init error:", e);
        alert("启动失败: " + e.message + "\n请确保网络正常以加载AI模型。");
        isCameraInitializing = false;
        btn.classList.remove('loading');
    }
}

async function startCameraStream() {
    try {
        // Try simplified constraints first for reliability
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }
        });

        videoStream = stream;
        const videoElement = document.getElementById('input_video');
        videoElement.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve) => {
            if (videoElement.readyState >= 2) resolve();
            else videoElement.onloadedmetadata = () => resolve();
        });

        await videoElement.play();

        isCameraOn = true;
        const btn = document.getElementById('camera-btn');
        btn.classList.remove('loading');
        btn.classList.add('camera-on');
        isCameraInitializing = false;

        gestureEnableTime = Date.now() + 1000; // Warmup
        showToast("✋ 手势控制已开启！<br>👌=掌握 | ✋=下一个", 3000);

        startVideoLoop();
    } catch (e) {
        console.error("Stream start error:", e);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            alert("请允许浏览器访问摄像头。");
        } else {
            // Fallback
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoStream = stream;
                document.getElementById('input_video').srcObject = stream;
                isCameraOn = true;
                document.getElementById('camera-btn').classList.remove('loading').add('camera-on');
                isCameraInitializing = false;
                startVideoLoop();
            } catch (e2) {
                alert("摄像头启动失败 (Fallback): " + e2.message);
                isCameraInitializing = false;
                document.getElementById('camera-btn').classList.remove('loading');
            }
        }
    }
}

export function disableWebcam() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    const videoElement = document.getElementById('input_video');
    if (videoElement) videoElement.srcObject = null;

    resetGesture();
}

async function startVideoLoop() {
    const videoElement = document.getElementById('input_video');

    const step = async () => {
        if (!videoStream || !isCameraOn) return;

        const now = Date.now();

        // --- UI Animation & Logic (60FPS roughly) ---
        if (activeGestureType && !isGestureLocked) {
            const duration = activeGestureType === 'palms' ? FLIP_HOLD_DURATION : BASE_HOLD_DURATION;
            const elapsed = now - gestureHoldStartTime;
            // 计算原始进度（不封顶）
            const rawProgress = elapsed / duration;
            // 视觉进度封顶在 1.0 (100%)
            const visualProgress = Math.min(rawProgress, 1);

            const feedback = document.getElementById('gesture-feedback');
            // 锁定手势类型，防止进度条填充时颜色切换
            if (!feedback.classList.contains('show')) {
                feedback.className = ''; // reset
                feedback.classList.add('show', `type-${activeGestureType}`);
                feedback.dataset.lockedType = activeGestureType; // 锁定当前类型
            } else if (feedback.dataset.lockedType && feedback.dataset.lockedType !== activeGestureType) {
                // 如果用户中途换了手势，重置进度
                return; // 忽略，继续使用原来的手势
            }
            feedback.style.setProperty('--p', `${visualProgress * 100}%`);

            // 在视觉填满后，额外等待 30% 的时间（约 120ms）作为顿挫感，确认用户意图
            if (rawProgress >= 1.3) {
                // Trigger Action
                isGestureLocked = true;
                feedback.style.setProperty('--p', '100%');

                handleGestureAction(activeGestureType);

                // Reset after delay
                setTimeout(() => {
                    feedback.classList.remove('show');
                    setTimeout(() => {
                        isGestureLocked = false;
                        resetGesture();
                    }, 1000); // Cooldown
                }, 500);
            }
        } else if (!activeGestureType && !isGestureLocked) {
            resetGesture();
        }

        // --- Video Processing (Throttled) ---
        if (now - lastProcessTime >= PROCESS_INTERVAL) {
            lastProcessTime = now;
            if (hands && videoElement.readyState >= 2 && !document.hidden) {
                await hands.send({ image: videoElement });
            }
        }

        animationFrameId = requestAnimationFrame(step);
    };
    step();
}

// --- Logic from Backup ---

function getDistance(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }

function isFingerExtended(lm, tipIdx, pipIdx, mcpIdx) {
    const tipToWrist = getDistance(lm[tipIdx], lm[0]);
    const pipToWrist = getDistance(lm[pipIdx], lm[0]);
    const mcpToWrist = getDistance(lm[mcpIdx], lm[0]);
    return tipToWrist > pipToWrist && tipToWrist > mcpToWrist * 1.1; // 1.1 buffer
}

function isHandOpen(lm) {
    const fingers = [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]];
    return fingers.every(f => isFingerExtended(lm, f[0], f[1], f[2]));
}

function isOkGesture(lm) {
    const pinchDistance = getDistance(lm[4], lm[8]);
    const handSize = getDistance(lm[0], lm[9]);
    const pinchRatio = pinchDistance / handSize;

    // Use default loose thresholds from backup
    const isPinching = pinchRatio <= 0.35 && pinchRatio >= 0.0;

    const isOtherFingersExtended = isFingerExtended(lm, 12, 10, 9) &&
        isFingerExtended(lm, 16, 14, 13) &&
        isFingerExtended(lm, 20, 18, 17);

    return isPinching && isOtherFingersExtended;
}

function onHandResults(results) {
    if (Date.now() < gestureEnableTime) return;
    if (isGestureLocked) return;

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        activeGestureType = null;
        gestureHoldStartTime = null;
        return;
    }

    let detectedType = null;

    // 1. Check Palms (Flip/Next) - 只有双手摊开才触发
    if (results.multiHandLandmarks.length === 2) {
        if (isHandOpen(results.multiHandLandmarks[0]) && isHandOpen(results.multiHandLandmarks[1])) {
            detectedType = 'palms';
        }
    }
    // 单手摊开不再触发翻面（已移除）

    // 2. Check OK (Mastery) - Overrides Open
    if (!detectedType || detectedType === 'palms') {
        for (const lm of results.multiHandLandmarks) {
            if (isOkGesture(lm)) {
                detectedType = 'ok';
                break;
            }
        }
    }

    if (detectedType) {
        if (activeGestureType !== detectedType) {
            activeGestureType = detectedType;
            gestureHoldStartTime = Date.now();
        }
    } else {
        activeGestureType = null;
        gestureHoldStartTime = null;
    }
}

function handleGestureAction(type) {
    if (type === 'ok') {
        toggleMasteryAction(true);
    } else if (type === 'palms') {
        const flashcard = document.getElementById('flashcard');
        const isFlipped = flashcard.classList.contains('flipped');
        if (!isFlipped) {
            flashcard.classList.add('flipped');
            playFlipSound();
        } else {
            manualNav(1);
        }
    }
}

function resetGesture() {
    activeGestureType = null;
    gestureHoldStartTime = null;
    const fb = document.getElementById('gesture-feedback');
    if (fb) {
        fb.classList.remove('show');
        fb.style.setProperty('--p', '0%');
    }
}


export function cancelCalibration() {
    // Stub
}
