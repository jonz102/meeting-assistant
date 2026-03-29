class UIManager {
    constructor() {
        this.currentMeetingId = null;
        this.currentTranscript = [];
        this.currentActionItems = [];
        this.currentSummary = '';
    }

    // Authentication UI
    showLoginPage() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }

    hideLoginPage() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }

    // Profile UI
    async displayUserProfile() {
        try {
            const user = await authManager.getCurrentUser();
            if (!user) return;

            // Update header profile
            const userEmailEl = document.getElementById('userEmail');
            if (userEmailEl) {
                userEmailEl.textContent = user.email;
            }

            // Update settings panel
            const fullNameInput = document.getElementById('fullNameUpdateInput');
            if (fullNameInput && user.full_name) {
                fullNameInput.value = user.full_name;
            }

            // Update profile image if available
            const profileImage = document.getElementById('userProfileImage');
            if (profileImage && user.profile_image_url) {
                profileImage.src = user.profile_image_url;
            } else if (profileImage) {
                // Use placeholder or initials
                profileImage.src = `https://ui-avatars.com/api/?name=${user.email}&background=00FF41&color=000`;
            }

            return user;
        } catch (error) {
            console.error('Failed to display user profile:', error);
        }
    }

    // Meeting UI
    setCurrentMeetingId(meetingId) {
        this.currentMeetingId = meetingId;
    }

    // Transcript UI
    addTranscriptLine(speaker, text, timestamp) {
        const line = { speaker, text, timestamp };
        this.currentTranscript.push(line);

        const transcriptPreview = document.getElementById('transcriptPreview');
        if (transcriptPreview) {
            // Replace interim placeholder with the finalised line
            if (this.interimEl) {
                this.interimEl.remove();
                this.interimEl = null;
            }
            const lineEl = document.createElement('p');
            lineEl.innerHTML = `<span class="text-[#00FF41]">[${timestamp}]</span> <strong>${speaker}:</strong> ${text}`;
            lineEl.className = 'font-mono text-[10px] text-[#00FF41]/60 margin-1';
            transcriptPreview.appendChild(lineEl);
            transcriptPreview.scrollTop = transcriptPreview.scrollHeight;
        }
    }

    clearTranscript() {
        this.currentTranscript = [];
        this.interimEl = null;
        const transcriptPreview = document.getElementById('transcriptPreview');
        if (transcriptPreview) {
            transcriptPreview.innerHTML = '';
        }
    }

    /**
     * Show a greyed-out interim (in-progress) transcript line that gets
     * replaced as more audio comes in, then finalised via addTranscriptLine.
     */
    updateInterimTranscript(text) {
        const transcriptPreview = document.getElementById('transcriptPreview');
        if (!transcriptPreview) return;

        if (!this.interimEl) {
            this.interimEl = document.createElement('p');
            this.interimEl.className = 'font-mono text-[10px] text-[#00FF41]/30 italic margin-1';
            transcriptPreview.appendChild(this.interimEl);
        }
        this.interimEl.textContent = text;
        transcriptPreview.scrollTop = transcriptPreview.scrollHeight;
    }

    /**
     * Show/hide a small mic-pulse indicator while speech is actively detected.
     */
    showSpeechIndicator(active) {
        const indicator = document.getElementById('liveIndicator');
        if (!indicator) return;
        if (active) {
            indicator.classList.remove('hidden');
            indicator.title = 'Speech detected…';
        } else {
            indicator.title = 'Listening…';
        }
    }

    // Action Items UI
    updateActionItemsCount(count) {
        const countEl = document.getElementById('actionItemsCount');
        if (countEl) {
            countEl.textContent = `${count}_ACTS`;
        }
    }

    setActionItems(items) {
        this.currentActionItems = items;
        this.updateActionItemsCount(items.length);
    }

    // Summary UI
    setSummary(summary) {
        this.currentSummary = summary;
        const summaryEl = document.getElementById('summaryPreview');
        if (summaryEl) {
            summaryEl.textContent = summary;
        }
    }

    // Live Indicator
    showLiveIndicator() {
        const indicator = document.getElementById('liveIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        }
    }

    hideLiveIndicator() {
        const indicator = document.getElementById('liveIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }

    // Settings Panel
    toggleSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        panel?.classList.toggle('hidden');
    }

    closeSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        panel?.classList.add('hidden');
    }

    // Button States
    setListenNowLoading(isLoading) {
        const btn = document.getElementById('listenNowBtn');
        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> PROCESSING...';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">mic</span> LISTEN_NOW';
        }
    }

    enableEmailButton() {
        const btn = document.getElementById('emailTranscriptBtn');
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    disableEmailButton() {
        const btn = document.getElementById('emailTranscriptBtn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    setEmailButtonLoading(isLoading) {
        const btn = document.getElementById('emailTranscriptBtn');
        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> SENDING...';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined inline mr-2">mail</span> SEND_TO_EMAIL';
        }
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

const uiManager = new UIManager();
