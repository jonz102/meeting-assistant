class AudioCapture {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.startTime = null;

        // Real-time WebSocket transcription
        this.audioContext = null;
        this.scriptProcessor = null;
        this.sourceNode = null;
        this.transcriptSocket = null;
        this.onTranscriptCallback = null;
        this.onSpeechStartCallback = null;
        this.onSpeechStopCallback = null;
    }

    /**
     * Start recording audio.
     * Simultaneously:
     *  - MediaRecorder captures the full blob for final Whisper processing
     *  - ScriptProcessorNode streams PCM16 chunks over WebSocket for real-time transcription
     *
     * @param {string} meetingId        - Used to open the correct WebSocket endpoint
     * @param {string} token            - JWT auth token
     * @param {Function} onTranscript   - Called with { text, is_final, timestamp }
     * @param {Function} onSpeechStart  - Called when OpenAI VAD detects speech
     * @param {Function} onSpeechStop   - Called when silence is detected
     * @returns {boolean} success
     */
    async startRecording(meetingId, token, onTranscript, onSpeechStart, onSpeechStop) {
        try {
            this.onTranscriptCallback = onTranscript || (() => {});
            this.onSpeechStartCallback = onSpeechStart || (() => {});
            this.onSpeechStopCallback = onSpeechStop || (() => {});

            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            // ── MediaRecorder: captures full audio for final processing ──
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };
            this.mediaRecorder.start();

            // ── AudioContext + ScriptProcessor: streams PCM16 for real-time transcription ──
            // OpenAI Realtime API requires PCM16 at 24 000 Hz mono
            this.audioContext = new AudioContext({ sampleRate: 24000 });
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

            // Buffer size 4096 → ~170 ms per chunk at 24 kHz
            this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.scriptProcessor.onaudioprocess = (event) => {
                if (!this.transcriptSocket || this.transcriptSocket.readyState !== WebSocket.OPEN) return;

                const float32 = event.inputBuffer.getChannelData(0);
                const pcm16 = this._float32ToPcm16(float32);
                const base64 = this._arrayBufferToBase64(pcm16.buffer);

                this.transcriptSocket.send(JSON.stringify({
                    type: 'audio_chunk',
                    audio: base64
                }));
            };

            this.sourceNode.connect(this.scriptProcessor);
            // Must connect to destination to keep the ScriptProcessor alive in Chrome
            this.scriptProcessor.connect(this.audioContext.destination);

            // ── WebSocket: connect to backend real-time transcription endpoint ──
            this._openTranscriptSocket(meetingId, token);

            this.isRecording = true;
            this.startTime = Date.now();
            console.log('Recording started (MediaRecorder + PCM16 WebSocket stream)');
            return true;

        } catch (error) {
            console.error('Microphone access error:', error);
            showToast('Failed to access microphone. Please check permissions.', 'error');
            return false;
        }
    }

    /**
     * Stop recording.
     * Signals the server, tears down the audio graph, returns the full audio blob.
     * @returns {Promise<Blob|null>}
     */
    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            // Tell server we're done streaming audio
            if (this.transcriptSocket && this.transcriptSocket.readyState === WebSocket.OPEN) {
                this.transcriptSocket.send(JSON.stringify({ type: 'stop' }));
                setTimeout(() => {
                    if (this.transcriptSocket) {
                        this.transcriptSocket.close();
                        this.transcriptSocket = null;
                    }
                }, 500);
            }

            // Disconnect audio graph
            if (this.scriptProcessor) { this.scriptProcessor.disconnect(); this.scriptProcessor = null; }
            if (this.sourceNode)      { this.sourceNode.disconnect();      this.sourceNode = null; }
            if (this.audioContext)    { this.audioContext.close();         this.audioContext = null; }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.isRecording = false;

                // Release the microphone
                if (this.stream) {
                    this.stream.getTracks().forEach(t => t.stop());
                    this.stream = null;
                }

                console.log('Recording stopped, blob size:', audioBlob.size);
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    isActive() { return this.isRecording; }

    getRecordingTime() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _openTranscriptSocket(meetingId, token) {
        const wsBase = window.APP_CONFIG?.WS_BASE_URL || 'ws://localhost:8000';
        const wsUrl = `${wsBase}/ws/transcript/${meetingId}?token=${encodeURIComponent(token)}`;
        this.transcriptSocket = new WebSocket(wsUrl);

        this.transcriptSocket.onopen  = () => console.log('Realtime transcript WebSocket connected');
        this.transcriptSocket.onclose = (e) => console.log('Transcript WebSocket closed:', e.code, e.reason);
        this.transcriptSocket.onerror = (e) => console.error('Transcript WebSocket error:', e);

        this.transcriptSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if      (data.type === 'transcript' && data.text) this.onTranscriptCallback(data);
                else if (data.type === 'speech_started')           this.onSpeechStartCallback();
                else if (data.type === 'speech_stopped')           this.onSpeechStopCallback();
                else if (data.type === 'error')                    console.error('Realtime error:', data.message);
            } catch (e) {
                console.error('WebSocket message parse error:', e);
            }
        };
    }

    /** Convert Float32 samples [-1, 1] → Int16 PCM */
    _float32ToPcm16(float32Array) {
        const int16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? s * 32768 : s * 32767;
        }
        return int16;
    }

    /** ArrayBuffer → base64 string */
    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let bin = '';
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
}

const audioCapture = new AudioCapture();
