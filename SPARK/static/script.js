document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const s1 = document.getElementById('servo1');
    const s2 = document.getElementById('servo2');
    const s3 = document.getElementById('servo3');
    const limit1 = document.getElementById('limit1');
    const limitValSpan = document.getElementById('limitValue');
    const warningDiv = document.getElementById('warning');
    const gameBtn = document.getElementById('gameBtn');
    const resetBtn = document.getElementById('reset');
    const stopBtn = document.getElementById('stop');
    const manualCtrl = document.getElementById('manualControl');
    const gaugeCont = document.getElementById('gaugeContainer');
    const canvas = document.getElementById('gauge');
    const statusDiv = document.querySelector('.status');

    let maxLimit = parseInt(limit1.value) || 120;
    let servo1Angle = parseInt(s1.value) || 0;

    let gamifyActive = false;
    let targetAngle = 60;
    let score = 0;
    let matchTime = 0; // ms matched
    let lastTime = Date.now();
    let animationFrameId = null;

    // Set initial display
    gaugeCont.style.display = 'none';

    // Poll status from server to find physical connection state
    function checkStatus() {
        fetch('/status')
            .then(res => res.json())
            .then(data => {
                if (data.connected) {
                    statusDiv.innerHTML = `<span class="dot" style="background-color: #00c853;"></span> Arduino Connected (${data.port})`;
                } else {
                    statusDiv.innerHTML = `<span class="dot" style="background-color: #ff9800;"></span> Running in Simulation Mode`;
                }
            })
            .catch(() => {
                statusDiv.innerHTML = `<span class="dot" style="background-color: #f44336;"></span> Server Disconnected`;
            });
    }

    checkStatus();
    setInterval(checkStatus, 5000);

    // API calls to server
    function sendServoUpdate(servoId, angle, limitVal) {
        const data = new URLSearchParams();
        data.append('servo', servoId);
        data.append('angle', angle);
        if (limitVal !== undefined) {
            data.append('limit', limitVal);
        }
        fetch('/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: data.toString()
        })
        .then(res => res.text())
        .catch(err => console.error('Update error:', err));
    }

    // Safety checks
    function checkSafety() {
        const limit = parseInt(limit1.value) || 120;
        maxLimit = limit;
        limitValSpan.textContent = limit + "°";

        let s1Val = parseInt(s1.value) || 0;
        if (s1Val > maxLimit) {
            s1Val = maxLimit;
            s1.value = s1Val;
            warningDiv.textContent = `⚠️ Safety clamp active! Angle limited to ${maxLimit}°`;
            // Trigger quick beep warning in console
            console.warn("Servo angle clamp triggered!");
        } else {
            warningDiv.textContent = "";
        }
        servo1Angle = s1Val;
    }

    // Sliders event listeners
    s1.addEventListener('input', () => {
        checkSafety();
        sendServoUpdate("1", s1.value, maxLimit);
    });

    s2.addEventListener('input', () => {
        sendServoUpdate("2", s2.value, maxLimit);
    });

    s3.addEventListener('input', () => {
        sendServoUpdate("3", s3.value, maxLimit);
    });

    limit1.addEventListener('input', () => {
        checkSafety();
        sendServoUpdate("1", s1.value, maxLimit);
        // Regulate target angle in game if it is now out of limit
        if (gamifyActive && targetAngle > maxLimit - 10) {
            newTarget();
        }
    });

    // Reset All
    resetBtn.addEventListener('click', () => {
        fetch('/reset', { method: 'POST' })
            .then(res => res.text())
            .then(() => {
                s1.value = 0;
                s2.value = 0;
                s3.value = 0;
                servo1Angle = 0;
                warningDiv.textContent = "";
                checkSafety();
                if (gamifyActive) {
                    newTarget();
                }
            })
            .catch(err => console.error("Reset error:", err));
    });

    // Emergency Stop
    stopBtn.addEventListener('click', () => {
        fetch('/stop', { method: 'POST' })
            .then(res => res.text())
            .then(() => {
                warningDiv.textContent = "🛑 Emergency Stop Triggered!";
            })
            .catch(err => console.error("Stop error:", err));
    });

    // Gamify mode implementation
    function newTarget() {
        const minAngle = 15;
        const maxAngle = Math.max(minAngle + 15, maxLimit - 15);
        targetAngle = Math.round(minAngle + Math.random() * (maxAngle - minAngle));
    }

    gameBtn.addEventListener('click', () => {
        gamifyActive = !gamifyActive;
        if (gamifyActive) {
            manualCtrl.style.display = 'none';
            gaugeCont.style.display = 'flex';
            gameBtn.textContent = "🎮 Manual Mode";
            newTarget();
            score = 0;
            matchTime = 0;
            lastTime = Date.now();
            gameLoop();
        } else {
            manualCtrl.style.display = 'block';
            gaugeCont.style.display = 'none';
            gameBtn.textContent = "🎮 Gamify Mode";
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    });

    // Keyboard bindings for Gamify Mode
    window.addEventListener('keydown', (e) => {
        if (!gamifyActive) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            servo1Angle = Math.max(0, servo1Angle - 3);
            s1.value = servo1Angle;
            checkSafety();
            sendServoUpdate("1", servo1Angle, maxLimit);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            servo1Angle = Math.min(maxLimit, servo1Angle + 3);
            s1.value = servo1Angle;
            checkSafety();
            sendServoUpdate("1", servo1Angle, maxLimit);
        }
    });

    // Canvas Pointer Events
    let isPointerDown = false;
    canvas.addEventListener('pointerdown', (e) => {
        if (!gamifyActive) return;
        isPointerDown = true;
        canvas.setPointerCapture(e.pointerId);
        handlePointer(e);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (isPointerDown) {
            handlePointer(e);
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        isPointerDown = false;
        canvas.releasePointerCapture(e.pointerId);
    });

    function handlePointer(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale to canvas size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = 225;
        const cy = 210;
        const dx = (x * scaleX) - cx;
        const dy = (y * scaleY) - cy;
        
        let angleRad = Math.atan2(dy, dx);
        
        if (angleRad > 0) {
            if (dx < 0) angleRad = -Math.PI;
            else angleRad = 0;
        }
        
        let deg = Math.round((angleRad + Math.PI) / Math.PI * 180);
        deg = Math.max(0, Math.min(maxLimit, deg));
        
        if (deg !== servo1Angle) {
            servo1Angle = deg;
            s1.value = servo1Angle;
            checkSafety();
            sendServoUpdate("1", servo1Angle, maxLimit);
        }
    }

    function gameLoop() {
        if (!gamifyActive) return;

        const now = Date.now();
        const dt = now - lastTime;
        lastTime = now;

        updateGameLogic(dt);
        drawGauge();

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function updateGameLogic(dt) {
        // Target match check (within 4 degrees threshold)
        if (Math.abs(servo1Angle - targetAngle) <= 4) {
            matchTime += dt;
            if (matchTime >= 1000) { // 1 second hold
                score += 10;
                newTarget();
                matchTime = 0;
            }
        } else {
            // Decay match progress
            matchTime = Math.max(0, matchTime - dt * 1.5);
        }
    }

    function drawGauge() {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cx = 225;
        const cy = 210;
        const outerR = 150;
        const innerR = 110;

        // 1. Base grey/blue track (0 - 180 degrees)
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, Math.PI, 2 * Math.PI, false);
        ctx.arc(cx, cy, innerR, 2 * Math.PI, Math.PI, true);
        ctx.closePath();
        ctx.fillStyle = '#dfe9ff';
        ctx.fill();

        // 2. Safe limit arc region
        const limitRad = Math.PI + (maxLimit / 180) * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, Math.PI, limitRad, false);
        ctx.arc(cx, cy, innerR, limitRad, Math.PI, true);
        ctx.closePath();
        ctx.fillStyle = '#eaf0ff';
        ctx.fill();

        // 3. Active progress arc
        const currentRad = Math.PI + (servo1Angle / 180) * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, Math.PI, currentRad, false);
        ctx.arc(cx, cy, innerR, currentRad, Math.PI, true);
        ctx.closePath();

        const grad = ctx.createLinearGradient(75, 210, 375, 210);
        grad.addColorStop(0, '#1565c0');
        grad.addColorStop(1, '#1976d2');
        ctx.fillStyle = grad;
        ctx.fill();

        // 4. Safe limit line indicator
        ctx.beginPath();
        ctx.moveTo(cx + innerR * Math.cos(limitRad), cy + innerR * Math.sin(limitRad));
        ctx.lineTo(cx + (outerR + 6) * Math.cos(limitRad), cy + (outerR + 6) * Math.sin(limitRad));
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#d63031';
        ctx.stroke();

        // Safe Limit Text
        ctx.fillStyle = '#d63031';
        ctx.font = 'bold 11px "Segoe UI"';
        ctx.textAlign = 'center';
        // Compute text offset slightly outside outer radius
        const textR = outerR + 18;
        ctx.fillText('LIMIT', cx + textR * Math.cos(limitRad), cy + textR * Math.sin(limitRad) - 4);

        // 5. Target marker dot
        const targetRad = Math.PI + (targetAngle / 180) * Math.PI;
        const middleR = (outerR + innerR) / 2;
        const tx = cx + middleR * Math.cos(targetRad);
        const ty = cy + middleR * Math.sin(targetRad);

        // Pulsing outer halo
        const pulse = 10 + 4 * Math.sin(Date.now() / 150);
        ctx.beginPath();
        ctx.arc(tx, ty, pulse, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(235, 94, 85, 0.4)';
        ctx.fill();

        // Target center
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff3f34';
        ctx.fill();

        // 6. Draw pointer needle
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (outerR - 12) * Math.cos(currentRad), cy + (outerR - 12) * Math.sin(currentRad));
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#1565c0';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Center hub
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
        ctx.fillStyle = '#0d47a1';
        ctx.fill();

        // 7. Middle Score Panel
        ctx.fillStyle = '#2d3436';
        ctx.textAlign = 'center';
        
        ctx.font = 'bold 12px "Segoe UI"';
        ctx.fillStyle = '#777';
        ctx.fillText('TARGET MATCHING', cx, cy - 80);

        ctx.font = 'bold 36px "Segoe UI"';
        ctx.fillStyle = '#00b894';
        ctx.fillText(`Score: ${score}`, cx, cy - 45);

        ctx.font = '14px "Segoe UI"';
        ctx.fillStyle = '#2d3436';
        ctx.fillText(`Current: ${servo1Angle}°  |  Target: ${targetAngle}°`, cx, cy - 18);

        // Progress ring under target
        if (matchTime > 0) {
            const pct = Math.min(1, matchTime / 1000);
            ctx.beginPath();
            ctx.arc(cx, cy - 50, 48, -Math.PI / 2, -Math.PI / 2 + pct * 2 * Math.PI);
            ctx.lineWidth = 5;
            ctx.strokeStyle = `rgba(0, 184, 148, ${0.3 + pct * 0.7})`;
            ctx.stroke();
        }
    }
});
