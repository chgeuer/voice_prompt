// ────────────────────────────────────────────
//  VoicePrompt — Teleprompter Hook for Phoenix LiveView
//  Ported from voiceprompt.live/js/teleprompter.js
//  Replaces Firebase with LiveView pushEvent/handleEvent
// ────────────────────────────────────────────

const Teleprompter = {
  mounted() {
    this.words = [];
    this.sentenceBounds = [];
    this.wordCursor = 0;
    this.isRunning = false;
    this.recognition = null;
    this.popoutWindow = null;
    this.lightMode = false;
    this.scrollMode = 'voice';
    this.autoScrollTimer = null;
    this.scrollPositionPct = 0.30;
    this.customBg = null;
    this.customTextColor = null;
    this.scrollTargets = new Map();
    this.remoteBroadcastTimer = null;

    // Cache DOM elements
    this.$ = (id) => document.getElementById(id);
    this.scriptInput = this.$('scriptInput');
    this.fontSizeSlider = this.$('fontSize');
    this.fontSizeVal = this.$('fontSizeVal');
    this.mirrorToggle = this.$('mirrorToggle');
    this.btnStart = this.$('btnStart');
    this.btnStop = this.$('btnStop');
    this.btnReset = this.$('btnReset');
    this.btnPopout = this.$('btnPopout');
    this.voiceStatus = this.$('voiceStatus');
    this.prompterText = this.$('prompterText');
    this.prompterScroll = this.$('prompterScroll');
    this.prompterMain = this.$('prompterMain');
    this.posIndicator = this.$('posIndicator');
    this.progressFill = this.$('progressFill');
    this.langSelect = this.$('langSelect');
    this.themeToggle = this.$('themeToggle');
    this.scrollModeSelect = this.$('scrollMode');
    this.scrollSpeedSlider = this.$('scrollSpeed');
    this.scrollSpeedVal = this.$('scrollSpeedVal');
    this.marginSlider = this.$('marginSlider');
    this.marginVal = this.$('marginVal');
    this.scrollPosSlider = this.$('scrollPosSlider');
    this.scrollPosVal = this.$('scrollPosVal');
    this.colorBgInput = this.$('colorBg');
    this.colorTextInput = this.$('colorText');
    this.readingTimeEl = this.$('readingTime');
    this.countdownEl = this.$('countdownOverlay');
    this.btnFileUpload = this.$('btnFileUpload');
    this.fileInput = this.$('fileInput');
    this.countdownToggle = this.$('countdownToggle');
    this.fontFamilySelect = this.$('fontFamily');
    this.saveTimer = null;

    this.setupEventListeners();
    this.startSmoothScrollTick();

    // Initialize with default script
    if (this.scriptInput && this.scriptInput.value) {
      this.parseScript(this.scriptInput.value);
      this.renderAll();
      this.updateReadingTime();
    }

    // Hide speed slider initially if voice mode
    if (this.scrollModeSelect && this.scrollSpeedSlider) {
      const speedRow = this.scrollSpeedSlider.closest('.control-item');
      if (speedRow && this.scrollModeSelect.value !== 'auto') speedRow.style.display = 'none';
    }
    if (this.scrollModeSelect && this.langSelect) {
      const langRow = this.langSelect.closest('.control-item');
      if (langRow && this.scrollModeSelect.value === 'auto') langRow.style.display = 'none';
    }

    // LiveView event handlers
    this.handleEvent("remote_cmd", (cmd) => this.handleRemoteCommand(cmd));
    this.handleEvent("enable_remote", () => this.enableRemote());
    this.handleEvent("restore_state", (state) => this.restoreState(state));

    // Start broadcasting immediately (remote is always available via URL)
    this.enableRemote();
  },

  destroyed() {
    this.stop();
    // Save state one last time before teardown
    this.saveStateNow();
    if (this.remoteBroadcastTimer) {
      clearInterval(this.remoteBroadcastTimer);
      this.remoteBroadcastTimer = null;
    }
  },

  // ── Normalize for matching ──
  norm(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
  },

  // ── Parse script into words + sentence structure ──
  parseScript(text) {
    this.words = [];
    this.sentenceBounds = [];

    const paragraphs = text.split(/\n\s*\n/);
    let sentIdx = 0;

    paragraphs.forEach((para, pIdx) => {
      const sentTexts = para.match(/[^.!?]*[.!?]+[\s]*/g);
      const sentArray = sentTexts || [para];

      sentArray.forEach(sent => {
        sent = sent.trim();
        if (!sent) return;

        const sentStart = this.words.length;
        const rawWords = sent.split(/\s+/).filter(w => w.length > 0);

        rawWords.forEach(w => {
          this.words.push({
            text: w,
            norm: this.norm(w),
            sentenceIdx: sentIdx,
            paraBreakAfter: false
          });
        });

        if (this.words.length > sentStart) {
          this.sentenceBounds.push({ start: sentStart, end: this.words.length - 1 });
          sentIdx++;
        }
      });

      if (this.words.length > 0 && pIdx < paragraphs.length - 1) {
        this.words[this.words.length - 1].paraBreakAfter = true;
      }
    });
  },

  // ── Reading time estimate ──
  updateReadingTime() {
    if (!this.readingTimeEl) return;
    if (this.words.length === 0) { this.readingTimeEl.textContent = ''; return; }
    const minutes = this.words.length / 150;
    if (minutes < 1) {
      this.readingTimeEl.textContent = '~' + Math.max(1, Math.round(minutes * 60)) + 's read';
    } else if (minutes < 60) {
      const m = Math.floor(minutes);
      const s = Math.round((minutes - m) * 60);
      this.readingTimeEl.textContent = '~' + m + 'm ' + (s > 0 ? s + 's' : '') + ' read';
    } else {
      this.readingTimeEl.textContent = '~' + Math.round(minutes) + 'm read';
    }
  },

  // ── Render words into a container ──
  renderInto(container) {
    container.innerHTML = '';
    this.words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w.text + ' ';
      span.dataset.idx = i;
      container.appendChild(span);

      if (w.paraBreakAfter) {
        const br = document.createElement('span');
        br.className = 'para-break';
        container.appendChild(br);
      }
    });

    container.style.fontSize = this.fontSizeSlider.value + 'px';
    if (this.customTextColor) {
      container.querySelectorAll('.word').forEach(w => w.style.color = this.customTextColor);
    }
    this.applyOpacity(container);
  },

  getWordOpacity(i) {
    const dist = i - this.wordCursor;
    if (dist < -20) return 0.1;
    if (dist < -8) return 0.12;
    if (dist < -3) return 0.18;
    if (dist < 0) return 0.25;
    if (dist === 0) return 1.0;
    if (dist <= 2) return 0.95;
    if (dist <= 5) return 0.85;
    if (dist <= 8) return 0.7;
    if (dist <= 12) return 0.5;
    if (dist <= 18) return 0.3;
    if (dist <= 30) return 0.2;
    return 0.12;
  },

  applyOpacity(container) {
    const spans = container.querySelectorAll('.word');
    spans.forEach((span, i) => {
      span.style.opacity = this.getWordOpacity(i);
    });
  },

  renderAll() {
    this.renderInto(this.prompterText);
    if (this.popoutWindow && !this.popoutWindow.closed) {
      const el = this.popoutWindow.document.getElementById('prompterText');
      if (el) this.renderInto(el);
    }
  },

  // ── Smooth scroll ──
  startSmoothScrollTick() {
    const tick = () => {
      this.scrollTargets.forEach((state, scroller) => {
        const diff = state.target - state.current;
        if (Math.abs(diff) < 0.5) {
          state.current = state.target;
        } else {
          state.current += diff * 0.08;
          scroller.scrollTop = state.current;
        }
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  smoothScrollTo(scroller, targetScrollTop) {
    if (!this.scrollTargets.has(scroller)) {
      this.scrollTargets.set(scroller, { current: scroller.scrollTop, target: targetScrollTop });
    } else {
      const state = this.scrollTargets.get(scroller);
      state.current = scroller.scrollTop;
      state.target = targetScrollTop;
    }
  },

  // ── Update display ──
  updateDisplay() {
    this.updateContainer(this.prompterText, this.prompterScroll);
    if (this.popoutWindow && !this.popoutWindow.closed) {
      const pt = this.popoutWindow.document.getElementById('prompterText');
      const ps = this.popoutWindow.document.getElementById('prompterScroll');
      if (pt && ps) this.updateContainer(pt, ps);
    }
    if (this.posIndicator) {
      const curSent = this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx + 1 : 0;
      this.posIndicator.textContent = 'sentence ' + curSent + '/' + this.sentenceBounds.length + ' · word ' + (this.wordCursor + 1) + '/' + this.words.length;
    }
    if (this.words.length > 0) {
      const pct = Math.round((this.wordCursor / (this.words.length - 1)) * 100);
      if (this.progressFill) this.progressFill.style.width = pct + '%';
      if (this.popoutWindow && !this.popoutWindow.closed) {
        const popProg = this.popoutWindow.document.getElementById('popProgress');
        if (popProg) popProg.style.width = pct + '%';
      }
    }
  },

  updateContainer(container, scroller) {
    this.applyOpacity(container);
    const spans = container.querySelectorAll('.word');
    const cursorSpan = spans[this.wordCursor];
    if (cursorSpan && scroller) {
      const spanTop = cursorSpan.offsetTop;
      const targetScroll = spanTop - (scroller.clientHeight * this.scrollPositionPct);
      this.smoothScrollTo(scroller, targetScroll);
    }
  },

  // ── Word-level voice matching ──
  wordsMatch(a, b) {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    if (a.startsWith(b.slice(0, -1)) || b.startsWith(a.slice(0, -1))) return true;
    if (a.length > 5 && b.includes(a.slice(0, -1))) return true;
    if (b.length > 5 && a.includes(b.slice(0, -1))) return true;
    return false;
  },

  isSignificant(w) {
    return w.length >= 4;
  },

  processHeardText(heardText) {
    const heardWords = heardText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(w => w.length > 0);
    if (heardWords.length === 0) return;

    const searchStart = Math.max(0, this.wordCursor - 2);
    const searchEnd = Math.min(this.words.length - 1, this.wordCursor + 30);

    let bestPos = -1;
    let bestScore = -1;

    for (let scriptPos = searchStart; scriptPos <= searchEnd; scriptPos++) {
      for (let heardStart = 0; heardStart < heardWords.length; heardStart++) {
        let matchLen = 0;
        let significantMatches = 0;
        let si = scriptPos;
        let hi = heardStart;
        let skips = 0;

        while (si <= searchEnd && hi < heardWords.length && skips < 3) {
          const scriptWord = this.words[si].norm;
          const heardWord = heardWords[hi].replace(/[^a-z0-9]/g, '');

          if (!heardWord) { hi++; continue; }
          if (!scriptWord) { si++; continue; }

          if (this.wordsMatch(scriptWord, heardWord)) {
            matchLen++;
            if (this.isSignificant(scriptWord)) significantMatches++;
            si++;
            hi++;
            skips = 0;
          } else {
            let skipped = false;
            if (hi + 1 < heardWords.length) {
              const nextHeard = heardWords[hi + 1].replace(/[^a-z0-9]/g, '');
              if (this.wordsMatch(scriptWord, nextHeard)) {
                hi++;
                skips++;
                skipped = true;
              }
            }
            if (!skipped && si + 1 <= searchEnd) {
              const nextScript = this.words[si + 1] ? this.words[si + 1].norm : '';
              if (nextScript && this.wordsMatch(nextScript, heardWord)) {
                si++;
                skips++;
                skipped = true;
              }
            }
            if (!skipped) break;
          }
        }

        const effectiveEnd = si - 1;
        if (matchLen < 2 || significantMatches < 1) continue;

        const jumpDistance = scriptPos - this.wordCursor;
        if (jumpDistance < -2) continue;
        if (jumpDistance > 15 && matchLen < 4) continue;
        if (jumpDistance > 10 && matchLen < 3) continue;

        const proximityBonus = 1.0 - (Math.max(0, jumpDistance) / 100);
        const score = matchLen + (significantMatches * 0.5) + proximityBonus;

        if (score > bestScore) {
          bestScore = score;
          bestPos = effectiveEnd;
        }
      }
    }

    if (bestPos >= 0 && bestPos >= this.wordCursor - 1) {
      const newPos = Math.max(this.wordCursor, bestPos);
      const maxJump = Math.max(8, Math.round(heardWords.length * 1.5));
      const cappedPos = Math.min(newPos, this.wordCursor + maxJump);
      if (cappedPos !== this.wordCursor) {
        this.wordCursor = cappedPos;
        this.updateDisplay();
      }
    }
  },

  // ── Voice Recognition ──
  startRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.voiceStatus.textContent = 'Speech recognition not supported. Use Chrome.';
      this.voiceStatus.className = 'voice-status error';
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = (this.langSelect && this.langSelect.value) || 'en-US';
    this.recognition.maxAlternatives = 3;

    let lastProcessedInterim = '';

    this.recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalText) this.processHeardText(finalText);

      if (interim && interim !== lastProcessedInterim && interim.length > 5) {
        lastProcessedInterim = interim;
        const recentWords = interim.trim().split(/\s+/).slice(-8).join(' ');
        this.processHeardText(recentWords);
      }

      const display = (interim || finalText).trim();
      this.voiceStatus.textContent = '🎤 "' + display.slice(-80) + '"';
    };

    this.recognition.onend = () => {
      if (this.isRunning) {
        setTimeout(() => { try { this.recognition.start(); } catch(e) {} }, 100);
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.voiceStatus.textContent = 'Voice error: ' + e.error + ' (retrying...)';
      this.voiceStatus.className = 'voice-status error';
      if (this.isRunning) {
        setTimeout(() => { try { this.recognition.start(); } catch(e) {} }, 500);
      }
    };

    this.recognition.start();
    this.voiceStatus.textContent = '🎤 Listening...';
    this.voiceStatus.className = 'voice-status listening';
  },

  // ── Auto-scroll ──
  startAutoScroll() {
    this.stopAutoScroll();
    const speed = this.scrollSpeedSlider ? parseInt(this.scrollSpeedSlider.value) : 3;
    const interval = Math.round(800 - (speed - 1) * (650 / 9));
    this.autoScrollTimer = setInterval(() => {
      if (this.wordCursor < this.words.length - 1) {
        this.wordCursor++;
        this.updateDisplay();
      } else {
        this.stopAutoScroll();
      }
    }, interval);
  },

  stopAutoScroll() {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  },

  // ── Countdown ──
  showCountdown(cb) {
    if (!this.countdownEl || (this.countdownToggle && !this.countdownToggle.checked)) { cb(); return; }
    let count = 3;
    this.countdownEl.style.display = 'flex';
    this.countdownEl.textContent = count;
    this.countdownEl.classList.add('show');
    const tick = setInterval(() => {
      count--;
      if (count > 0) {
        this.countdownEl.textContent = count;
      } else {
        clearInterval(tick);
        this.countdownEl.classList.remove('show');
        this.countdownEl.style.display = 'none';
        cb();
      }
    }, 800);
  },

  // ── Start / Stop / Reset ──
  startImmediate() {
    this.isRunning = true;
    this.btnStart.classList.add('active');
    const dot = this.btnStart.querySelector('.btn-go-dot');
    if (dot) {
      this.btnStart.innerHTML = '';
      this.btnStart.appendChild(dot);
      this.btnStart.append(' Live');
    } else {
      this.btnStart.textContent = '● Live';
    }
    this.updateDisplay();
    if (this.scrollMode === 'auto') {
      this.startAutoScroll();
      this.voiceStatus.textContent = '▶ Auto-scrolling...';
      this.voiceStatus.className = 'voice-status listening';
    } else {
      this.startRecognition();
    }
    this.broadcastState();
  },

  start() {
    if (this.isRunning) return;
    if (this.words.length === 0) return;
    this.showCountdown(() => this.startImmediate());
  },

  stop() {
    this.isRunning = false;
    this.btnStart.classList.remove('active');
    const dot = this.btnStart.querySelector('.btn-go-dot');
    if (dot) {
      this.btnStart.innerHTML = '';
      this.btnStart.appendChild(dot);
      this.btnStart.append(' Start');
    } else {
      this.btnStart.textContent = '▶ Start';
    }
    if (this.recognition) { this.recognition.abort(); this.recognition = null; }
    this.stopAutoScroll();
    this.voiceStatus.textContent = 'Stopped';
    this.voiceStatus.className = 'voice-status';
    this.broadcastState();
  },

  reset() {
    this.stop();
    this.wordCursor = 0;
    this.renderAll();
    this.updateDisplay();
    this.broadcastState();
  },

  // ── Remote control via LiveView PubSub ──
  enableRemote() {
    if (this.remoteBroadcastTimer) return;
    this.remoteBroadcastTimer = setInterval(() => this.broadcastState(), 500);
    console.log('[Teleprompter] Remote enabled — broadcasting state every 500ms via LiveView');
  },

  broadcastState() {
    this._broadcastCount = (this._broadcastCount || 0) + 1;

    const state = {
      running: this.isRunning,
      wordCursor: this.wordCursor,
      totalWords: this.words.length,
      sentenceIdx: this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx + 1 : 0,
      totalSentences: this.sentenceBounds.length,
      scrollMode: this.scrollMode,
      speed: this.scrollSpeedSlider ? parseInt(this.scrollSpeedSlider.value) : 3,
      ts: Date.now()
    };

    const wordsHash = this.words.length + ':' + (this.words[0] ? this.words[0].text : '') + ':' + (this.words.length > 0 ? this.words[this.words.length - 1].text : '');
    if (wordsHash !== this._lastWordsHash || this._broadcastCount % 10 === 1) {
      state.words = this.words.map(w => w.text);
      state.paraBreaks = this.words.reduce((acc, w, i) => { if (w.paraBreakAfter) acc.push(i); return acc; }, []);
      this._lastWordsHash = wordsHash;
    }

    this.pushEvent("broadcast_state", state);
  },

  handleRemoteCommand(cmd) {
    if (!cmd || !cmd.action) return;
    switch (cmd.action) {
      case 'start': this.start(); break;
      case 'stop': this.stop(); break;
      case 'toggle': if (this.isRunning) this.stop(); else this.start(); break;
      case 'nudge_forward':
        if (this.wordCursor < this.words.length - 1) { this.wordCursor++; this.updateDisplay(); }
        break;
      case 'nudge_back':
        if (this.wordCursor > 0) { this.wordCursor--; this.updateDisplay(); }
        break;
      case 'next_sentence': {
        const curSent = this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx : 0;
        const nextSent = this.sentenceBounds[curSent + 1];
        if (nextSent) { this.wordCursor = nextSent.start; this.updateDisplay(); }
        break;
      }
      case 'prev_sentence': {
        const curSent2 = this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx : 0;
        const prevSent = this.sentenceBounds[curSent2 - 1];
        if (prevSent) { this.wordCursor = prevSent.start; this.updateDisplay(); }
        break;
      }
      case 'reset': this.reset(); break;
      case 'set_speed':
        if (this.scrollSpeedSlider && cmd.value) {
          this.scrollSpeedSlider.value = cmd.value;
          if (this.scrollSpeedVal) this.scrollSpeedVal.textContent = cmd.value;
          if (this.isRunning && this.scrollMode === 'auto') this.startAutoScroll();
        }
        break;
    }
    // Broadcast state immediately after a command
    if (this.remoteBroadcastTimer) this.broadcastState();
  },

  // ── Server-side state persistence ──
  restoreState(state) {
    if (state.script && state.script !== '') {
      this.scriptInput.value = state.script;
      this.parseScript(state.script);
      this.renderAll();
      this.updateReadingTime();
    }
    if (state.wordCursor && state.wordCursor > 0) {
      this.wordCursor = Math.min(state.wordCursor, this.words.length - 1);
      this.updateDisplay();
    }
    if (state.settings) {
      const s = state.settings;
      if (s.fontSize && this.fontSizeSlider) {
        this.fontSizeSlider.value = s.fontSize;
        this.fontSizeVal.textContent = s.fontSize + 'px';
        this.prompterText.style.fontSize = s.fontSize + 'px';
      }
      if (s.scrollMode && this.scrollModeSelect) {
        this.scrollModeSelect.value = s.scrollMode;
        this.scrollMode = s.scrollMode;
      }
      if (s.scrollSpeed && this.scrollSpeedSlider) {
        this.scrollSpeedSlider.value = s.scrollSpeed;
        if (this.scrollSpeedVal) this.scrollSpeedVal.textContent = s.scrollSpeed;
      }
      if (s.lang && this.langSelect) this.langSelect.value = s.lang;
      if (s.fontFamily && this.fontFamilySelect) {
        this.fontFamilySelect.value = s.fontFamily;
        this.prompterText.style.fontFamily = s.fontFamily;
      }
      if (s.mirror !== undefined && this.mirrorToggle) {
        this.mirrorToggle.checked = s.mirror;
        if (this.prompterMain) this.prompterMain.classList.toggle('mirrored', s.mirror);
      }
      if (s.lightMode !== undefined && this.themeToggle) {
        this.themeToggle.checked = s.lightMode;
        this.lightMode = s.lightMode;
        if (this.prompterMain) this.prompterMain.classList.toggle('light-mode', s.lightMode);
      }
    }
  },

  gatherSettings() {
    return {
      fontSize: this.fontSizeSlider ? parseInt(this.fontSizeSlider.value) : 42,
      scrollMode: this.scrollMode,
      scrollSpeed: this.scrollSpeedSlider ? parseInt(this.scrollSpeedSlider.value) : 3,
      lang: this.langSelect ? this.langSelect.value : 'en-US',
      fontFamily: this.fontFamilySelect ? this.fontFamilySelect.value : null,
      mirror: this.mirrorToggle ? this.mirrorToggle.checked : false,
      lightMode: this.lightMode || false,
    };
  },

  debouncedSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveStateNow(), 2000);
  },

  saveStateNow() {
    this.pushEvent("save_state", {
      script: this.scriptInput ? this.scriptInput.value : '',
      settings: this.gatherSettings(),
      wordCursor: this.wordCursor,
    });
  },

  // ── Event listener setup ──
  setupEventListeners() {
    // Font size
    this.fontSizeSlider.addEventListener('input', () => {
      const size = this.fontSizeSlider.value + 'px';
      this.fontSizeVal.textContent = size;
      this.prompterText.style.fontSize = size;
      if (this.popoutWindow && !this.popoutWindow.closed) {
        const el = this.popoutWindow.document.getElementById('prompterText');
        if (el) el.style.fontSize = size;
      }
      this.debouncedSave();
    });

    // Mirror toggle
    if (this.mirrorToggle && this.prompterMain) {
      this.mirrorToggle.addEventListener('change', () => {
        this.prompterMain.classList.toggle('mirrored', this.mirrorToggle.checked);
        if (this.popoutWindow && !this.popoutWindow.closed) {
          const p = this.popoutWindow.document.getElementById('prompter');
          if (p) p.classList.toggle('mirrored', this.mirrorToggle.checked);
        }
        this.debouncedSave();
      });
    }

    // Theme toggle
    if (this.themeToggle) {
      this.themeToggle.addEventListener('change', () => {
        this.lightMode = this.themeToggle.checked;
        if (this.prompterMain) this.prompterMain.classList.toggle('light-mode', this.lightMode);
        if (this.popoutWindow && !this.popoutWindow.closed) {
          const p = this.popoutWindow.document.getElementById('prompter');
          if (p) p.classList.toggle('light-mode', this.lightMode);
        }
        this.debouncedSave();
      });
    }

    // Start / Stop / Reset
    this.btnStart.addEventListener('click', () => this.start());
    this.btnStop.addEventListener('click', () => this.stop());
    this.btnReset.addEventListener('click', () => this.reset());

    // Script input
    if (this.scriptInput) {
      this.scriptInput.addEventListener('input', () => {
        if (!this.isRunning) {
          this.parseScript(this.scriptInput.value);
          this.wordCursor = 0;
          this.renderAll();
          this.updateReadingTime();
        }
        this.debouncedSave();
      });
    }

    // Scroll mode
    if (this.scrollModeSelect) {
      this.scrollModeSelect.addEventListener('change', () => {
        this.scrollMode = this.scrollModeSelect.value;
        const speedRow = this.scrollSpeedSlider ? this.scrollSpeedSlider.closest('.control-item') : null;
        if (speedRow) speedRow.style.display = this.scrollMode === 'auto' ? '' : 'none';
        const langRow = this.langSelect ? this.langSelect.closest('.control-item') : null;
        if (langRow) langRow.style.display = this.scrollMode === 'auto' ? 'none' : '';
        if (this.isRunning) {
          if (this.scrollMode === 'auto') {
            if (this.recognition) { this.recognition.abort(); this.recognition = null; }
            this.startAutoScroll();
            this.voiceStatus.textContent = '▶ Auto-scrolling...';
            this.voiceStatus.className = 'voice-status listening';
          } else {
            this.stopAutoScroll();
            this.startRecognition();
          }
        }
        this.debouncedSave();
      });
    }

    // Scroll speed
    if (this.scrollSpeedSlider && this.scrollSpeedVal) {
      this.scrollSpeedSlider.addEventListener('input', () => {
        this.scrollSpeedVal.textContent = this.scrollSpeedSlider.value;
        if (this.isRunning && this.scrollMode === 'auto') this.startAutoScroll();
        this.debouncedSave();
      });
    }

    // Margin control
    if (this.marginSlider) {
      this.marginSlider.addEventListener('input', () => {
        const val = this.marginSlider.value;
        if (this.marginVal) this.marginVal.textContent = val + '%';
        const maxW = Math.round(900 * (parseInt(val) / 100));
        this.prompterText.style.maxWidth = maxW + 'px';
        if (this.popoutWindow && !this.popoutWindow.closed) {
          const el = this.popoutWindow.document.getElementById('prompterText');
          if (el) el.style.maxWidth = maxW + 'px';
        }
      });
    }

    // Scroll position (reading line)
    if (this.scrollPosSlider) {
      this.scrollPosSlider.addEventListener('input', () => {
        this.scrollPositionPct = parseInt(this.scrollPosSlider.value) / 100;
        if (this.scrollPosVal) {
          const labels = { 20: 'Top', 30: 'Upper', 40: 'Mid-upper', 50: 'Center', 60: 'Mid-lower', 70: 'Lower' };
          this.scrollPosVal.textContent = labels[this.scrollPosSlider.value] || this.scrollPosSlider.value + '%';
        }
        this.updateDisplay();
      });
    }

    // Color pickers
    if (this.colorBgInput) {
      this.colorBgInput.addEventListener('input', () => {
        this.customBg = this.colorBgInput.value;
        this.prompterMain.style.background = this.customBg;
        if (this.popoutWindow && !this.popoutWindow.closed) {
          const p = this.popoutWindow.document.getElementById('prompter');
          if (p) p.style.background = this.customBg;
        }
        this.debouncedSave();
      });
    }
    if (this.colorTextInput) {
      this.colorTextInput.addEventListener('input', () => {
        this.customTextColor = this.colorTextInput.value;
        this.prompterText.querySelectorAll('.word').forEach(w => w.style.color = this.customTextColor);
        if (this.popoutWindow && !this.popoutWindow.closed) {
          const el = this.popoutWindow.document.getElementById('prompterText');
          if (el) el.querySelectorAll('.word').forEach(w => w.style.color = this.customTextColor);
        }
        this.debouncedSave();
      });
    }

    // Font family
    if (this.fontFamilySelect) {
      this.fontFamilySelect.addEventListener('change', () => {
        this.prompterText.style.fontFamily = this.fontFamilySelect.value;
        this.debouncedSave();
      });
    }

    // File upload
    if (this.btnFileUpload && this.fileInput) {
      this.btnFileUpload.addEventListener('click', () => this.fileInput.click());
      this.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (this.scriptInput) {
            this.scriptInput.value = ev.target.result;
            this.scriptInput.dispatchEvent(new Event('input'));
          }
        };
        reader.readAsText(file);
        this.fileInput.value = '';
      });
    }

    // Paste from clipboard
    const btnPaste = this.$('btnPaste');
    if (btnPaste) {
      btnPaste.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            this.scriptInput.value = text;
            this.scriptInput.dispatchEvent(new Event('input'));
          }
        } catch (e) {
          this.scriptInput.focus();
          this.scriptInput.select();
        }
      });
    }

    // Pop-out window
    if (this.btnPopout) {
      this.btnPopout.addEventListener('click', () => {
        if (this.popoutWindow && !this.popoutWindow.closed) { this.popoutWindow.focus(); return; }

        this.popoutWindow = window.open('', 'teleprompter', 'width=1000,height=700');
        const doc = this.popoutWindow.document;
        const popClasses = [
          this.mirrorToggle && this.mirrorToggle.checked ? 'mirrored' : '',
          this.lightMode ? 'light-mode' : ''
        ].filter(Boolean).join(' ');
        doc.write('<!DOCTYPE html><html><head><title>VoicePrompt Display</title>' +
          '<style>' +
          '*{box-sizing:border-box;margin:0;padding:0}' +
          'body{background:#000;overflow:hidden}' +
          '#prompter{width:100vw;height:100vh;display:flex;flex-direction:column}' +
          '#prompterScroll{flex:1;overflow-y:auto;padding:20vh 60px 40vh 60px}' +
          '#prompterText{max-width:900px;margin:0 auto}' +
          '#prompterText .word{display:inline;color:#fff;line-height:1.9;transition:opacity .5s ease;opacity:0.15}' +
          '#prompterText .para-break{display:block;height:.8em}' +
          '#prompter.mirrored #prompterScroll{transform:scaleX(-1)}' +
          '#prompter.light-mode{background:#f5f5f0}' +
          '#prompter.light-mode #prompterText .word{color:#1a1a1a}' +
          '.pop-progress-track{height:3px;background:rgba(255,255,255,0.1)}' +
          '.pop-progress-fill{height:100%;width:0%;background:#e94560;transition:width .4s ease}' +
          '#prompter.light-mode .pop-progress-track{background:rgba(0,0,0,0.1)}' +
          '</style></head><body>' +
          '<div id="prompter"' + (popClasses ? ' class="' + popClasses + '"' : '') + '>' +
          '<div class="pop-progress-track"><div class="pop-progress-fill" id="popProgress"></div></div>' +
          '<div id="prompterScroll"><div id="prompterText"></div></div>' +
          '</div></body></html>');
        doc.close();

        setTimeout(() => {
          const el = doc.getElementById('prompterText');
          if (el) {
            this.renderInto(el);
            this.updateDisplay();
            if (this.customBg) {
              const p = doc.getElementById('prompter');
              if (p) p.style.background = this.customBg;
            }
            if (this.marginSlider) {
              const maxW = Math.round(900 * (parseInt(this.marginSlider.value) / 100));
              el.style.maxWidth = maxW + 'px';
            }
          }
        }, 150);
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target === this.scriptInput) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.wordCursor < this.words.length - 1) { this.wordCursor++; this.updateDisplay(); }
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.wordCursor > 0) { this.wordCursor--; this.updateDisplay(); }
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        const curSent = this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx : 0;
        const nextSent = this.sentenceBounds[curSent + 1];
        if (nextSent) { this.wordCursor = nextSent.start; this.updateDisplay(); }
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        const curSent = this.words[this.wordCursor] ? this.words[this.wordCursor].sentenceIdx : 0;
        const prevSent = this.sentenceBounds[curSent - 1];
        if (prevSent) { this.wordCursor = prevSent.start; this.updateDisplay(); }
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (this.isRunning) this.stop(); else this.start();
      }
    });
  }
};

export default Teleprompter;
