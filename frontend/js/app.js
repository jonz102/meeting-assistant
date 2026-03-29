// Main Application Manager
class MeetingAssistantApp {
    constructor() {
        this.isAuthenticated = false;
        this.currentMeetingId = null;
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTime = 0;
        this.recordingTimer = null;
        this.init();
    }

    async init() {
        console.log('Initializing Meeting Assistant App...');

        // Check authentication
        await this.checkAuth();

        // Setup event listeners
        this.setupEventListeners();
    }

    async checkAuth() {
        const token = authManager.getToken();
        if (token) {
            const user = await authManager.getCurrentUser();
            if (user) {
                this.isAuthenticated = true;
                uiManager.hideLoginPage();
                await uiManager.displayUserProfile();
                return;
            }
        }

        // Not authenticated, show login
        authManager.logout();
        this.isAuthenticated = false;
        uiManager.showLoginPage();
    }

    setupEventListeners() {
        // Authentication
        document.getElementById('toggleSignup')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSignupForm();
        });

        document.getElementById('authButton')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleAuth();
        });

        // Main App - Always attach listeners (handlers safely no-op if not authenticated)
        // Settings
        document.getElementById('settingsButton')?.addEventListener('click', () => {
            uiManager.toggleSettingsPanel();
        });

        document.getElementById('updateProfileBtn')?.addEventListener('click', async () => {
            await this.updateProfile();
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('logoutBtnNav')?.addEventListener('click', () => {
            this.logout();
        });

        // Recording
        document.getElementById('listenNowBtn')?.addEventListener('click', async () => {
            if (this.isRecording) {
                await this.stopRecording();
            } else {
                await this.startRecording();
            }
        });

        // Email
        document.getElementById('emailTranscriptBtn')?.addEventListener('click', async () => {
            if (this.currentMeetingId) {
                await emailHandler.promptAndSendEmail(this.currentMeetingId);
            }
        });

        // Close settings on outside click
        document.addEventListener('click', (e) => {
            const settingsPanel = document.getElementById('settingsPanel');
            const settingsBtn = document.getElementById('settingsButton');
            if (settingsPanel && !settingsPanel.classList.contains('hidden') &&
                !settingsPanel.contains(e.target) && !settingsBtn?.contains(e.target)) {
                uiManager.closeSettingsPanel();
            }
        });
    }

    async handleAuth() {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const fullNameInput = document.getElementById('fullNameInput');
        const signupFields = document.getElementById('signupFields');
        const isSignup = !signupFields.classList.contains('hidden');

        if (!email || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            const authBtn = document.getElementById('authButton');
            authBtn.disabled = true;
            authBtn.innerHTML = '<span class="spinner"></span> Processing...';

            if (isSignup) {
                const fullName = fullNameInput.value;
                if (!fullName) {
                    showToast('Please enter your full name', 'error');
                    authBtn.disabled = false;
                    authBtn.innerHTML = 'CREATE_ACCOUNT';
                    return;
                }
                await authManager.signup(email, password, fullName);
            } else {
                await authManager.login(email, password);
            }

            showToast(`${isSignup ? 'Signup' : 'Login'} successful!`, 'success');
            await this.checkAuth();

        } catch (error) {
            console.error('Auth error:', error);
            showToast(error.message || 'Authentication failed', 'error');
        } finally {
            const authBtn = document.getElementById('authButton');
            authBtn.disabled = false;
            authBtn.innerHTML = 'LOGIN';
        }
    }

    toggleSignupForm() {
        const signupFields = document.getElementById('signupFields');
        const toggleBtn = document.getElementById('toggleSignup');
        const authBtn = document.getElementById('authButton');
        const isSignup = signupFields.classList.contains('hidden');

        if (isSignup) {
            signupFields.classList.remove('hidden');
            toggleBtn.textContent = 'BACK_TO_LOGIN';
            authBtn.textContent = 'CREATE_ACCOUNT';
        } else {
            signupFields.classList.add('hidden');
            document.getElementById('fullNameInput').value = '';
            toggleBtn.textContent = 'CREATE_ACCOUNT';
            authBtn.textContent = 'LOGIN';
        }
    }

    async updateProfile() {
        try {
            const fullName = document.getElementById('fullNameUpdateInput').value;
            const user = authManager.getUser();

            if (!fullName) {
                showToast('Please enter a name', 'error');
                return;
            }

            const btn = document.getElementById('updateProfileBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Saving...';

            await authManager.updateProfile(fullName, user.profile_image_url);
            await uiManager.displayUserProfile();

            showToast('Profile updated successfully', 'success');
        } catch (error) {
            console.error('Profile update error:', error);
            showToast('Failed to update profile', 'error');
        } finally {
            const btn = document.getElementById('updateProfileBtn');
            btn.disabled = false;
            btn.innerHTML = 'SAVE_PROFILE';
        }
    }

    logout() {
        authManager.logout();
        this.isAuthenticated = false;
        this.currentMeetingId = null;
        uiManager.showLoginPage();
        showToast('Logged out successfully', 'success');
    }

    async startRecording() {
        try {
            uiManager.setListenNowLoading(true);

            // Start meeting session first so we have a meeting_id for the WebSocket
            const user = authManager.getUser();
            const meetingResponse = await apiClient.startMeeting('Meeting', [user.email]);
            this.currentMeetingId = meetingResponse.meeting_id;
            uiManager.setCurrentMeetingId(this.currentMeetingId);

            // Start audio capture with real-time transcription callbacks
            const token = authManager.getToken();
            const success = await audioCapture.startRecording(
                this.currentMeetingId,
                token,
                // onTranscript — called for each transcribed segment
                (data) => {
                    if (data.is_final) {
                        uiManager.addTranscriptLine('Speaker', data.text, data.timestamp || '');
                    } else {
                        uiManager.updateInterimTranscript(data.text);
                    }
                },
                // onSpeechStart
                () => uiManager.showSpeechIndicator(true),
                // onSpeechStop
                () => uiManager.showSpeechIndicator(false)
            );

            if (!success) {
                uiManager.setListenNowLoading(false);
                return;
            }

            // Update UI
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            uiManager.showLiveIndicator();
            uiManager.clearTranscript();
            uiManager.disableEmailButton();

            uiManager.setRecordingState(true);
            this.startRecordingTimer();
            showToast('Recording started — transcribing in real time...', 'success');

        } catch (error) {
            console.error('Start recording error:', error);
            showToast('Failed to start recording', 'error');
        } finally {
            uiManager.setListenNowLoading(false);
        }
    }

    async stopRecording() {
        try {
            uiManager.setListenNowLoading(true);
            this.stopRecordingTimer();

            // Get audio blob
            const audioBlob = await audioCapture.stopRecording();
            if (!audioBlob) {
                showToast('Failed to get audio', 'error');
                return;
            }

            // Process audio
            showToast('Processing audio and extracting insights...', 'success');

            const result = await apiClient.processAudio(audioBlob, this.currentMeetingId);

            if (result.success) {
                uiManager.setSummary(result.summary);
                uiManager.renderActionLog(result.action_items);
                uiManager.enableEmailButton();

                // Add transcript lines (clear first to avoid duplication with real-time)
                uiManager.clearTranscript();
                for (const line of result.transcript) {
                    uiManager.addTranscriptLine(line.speaker, line.text, line.timestamp);
                }

                uiManager.renderHeuristicAnalysis(result.transcript, result.action_items, this.recordingTime);

                showToast('Meeting processed successfully!', 'success');
            } else {
                showToast('Failed to process meeting', 'error');
            }

        } catch (error) {
            console.error('Stop recording error:', error);
            showToast('Failed to process meeting: ' + error.message, 'error');
        } finally {
            this.isRecording = false;
            uiManager.hideLiveIndicator();
            uiManager.setRecordingState(false);
        }
    }

    startRecordingTimer() {
        if (this.recordingTimer) clearInterval(this.recordingTimer);
        this.recordingTimer = setInterval(() => {
            this.recordingTime = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new MeetingAssistantApp();
    });
} else {
    window.app = new MeetingAssistantApp();
}
