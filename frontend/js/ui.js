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
            if (this.interimEl) {
                this.interimEl.remove();
                this.interimEl = null;
            }

            // Alternate left/right per unique speaker
            if (!this._speakerIndex) this._speakerIndex = {};
            if (this._speakerIndex[speaker] === undefined) {
                const idx = Object.keys(this._speakerIndex).length;
                this._speakerIndex[speaker] = idx;
            }
            const isRight = this._speakerIndex[speaker] % 2 === 1;

            const lineEl = document.createElement('div');
            lineEl.className = `flex flex-col ${isRight ? 'items-end' : 'items-start'} mb-3`;
            lineEl.innerHTML = `
                <span class="text-[9px] text-[#00FF41]/40 mb-1 font-mono">${speaker.toUpperCase()} · ${timestamp}</span>
                <div class="max-w-[80%] px-3 py-2 rounded text-xs font-mono leading-relaxed
                    ${isRight
                        ? 'bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41]/90 text-right'
                        : 'bg-[#1a1a1a] border border-[#00FF41]/20 text-[#00FF41]/80'}"
                >${text}</div>`;
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
        }
        // When isLoading=false, let setRecordingState handle the text
    }

    setRecordingState(isRecording) {
        const btn = document.getElementById('listenNowBtn');
        if (!btn) return;
        btn.disabled = false;
        if (isRecording) {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">stop_circle</span> END_CAPTURE';
            btn.style.background = 'transparent';
            btn.style.color = '#ff4141';
            btn.style.border = '2px solid #ff4141';
        } else {
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">mic</span> INITIATE_CAPTURE';
            btn.style.background = '#00FF41';
            btn.style.color = '#000';
            btn.style.border = '2px solid transparent';
        }
    }

    renderActionLog(items) {
        this.currentActionItems = items;
        this.updateActionItemsCount(items.length);

        const tbody = document.getElementById('actionLogBody');
        const countEl = document.getElementById('actionLogCount');
        if (!tbody) return;

        if (countEl) countEl.textContent = items.length;

        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-[#00FF41]/30 py-6 text-xs">NO_ACTION_ITEMS_DETECTED</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((item, i) => {
            const priority = (item.priority || 'medium').toUpperCase();
            const priorityClass = priority === 'HIGH'
                ? 'bg-red-900/50 text-red-400 border border-red-500/50'
                : priority === 'LOW'
                    ? 'bg-gray-800/50 text-gray-400 border border-gray-600/50'
                    : 'bg-green-900/30 text-[#00FF41]/80 border border-[#00FF41]/30';

            const dueDate = item.due_date
                ? new Date(item.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'TBD';

            return `<tr class="border-b border-[#00FF41]/10 hover:bg-[#00FF41]/5 transition-colors">
                <td class="py-3 px-4 text-[#00FF41]/90 text-xs font-mono">${item.title || item.description || 'N/A'}</td>
                <td class="py-3 px-4 text-[#00FF41]/70 text-xs font-mono">${item.assigned_to || '—'}</td>
                <td class="py-3 px-4 text-[#00FF41]/70 text-xs font-mono">${dueDate}</td>
                <td class="py-3 px-4">
                    <span class="px-2 py-1 text-[10px] font-bold rounded ${priorityClass}">${priority}</span>
                </td>
            </tr>`;
        }).join('');
    }

    renderHeuristicAnalysis(transcript, actionItems, durationSeconds) {
        // --- Keyword Density ---
        const allText = transcript.map(t => t.text || '').join(' ').toLowerCase();
        const words = allText.match(/\b[a-z]{4,}\b/g) || [];
        const stopWords = new Set(['that','this','with','from','have','been','will','would','could','should','they','their','there','were','your','about','into','than','when','what','which','some','other','more','also','then','just','like','very','only','well','over','back','after','first','time','most','need','make','take','good','each','such','even','both','here','does','work','next','want','much','know','said','been','those','these','come','long','made','same','many','new','now','call','show','may','use','way','year','day','out','all','can','see','him','his','her','its','our','was','are','but','for','not','you','had','has','him','she','him','any','who','did','how','too','its','via','per']);
        const freq = {};
        for (const w of words) {
            if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
        }
        const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxFreq = topWords[0]?.[1] || 1;

        const keywordBar = document.getElementById('hKeywordBar');
        const keywordPct = document.getElementById('hKeywordPct');
        if (keywordBar && keywordPct) {
            const density = Math.min(100, Math.round((topWords.length / Math.max(words.length, 1)) * 1000));
            keywordBar.style.width = density + '%';
            keywordPct.textContent = density + '%';
        }

        // Render top keywords list
        const keywordsListEl = document.getElementById('hKeywordsList');
        if (keywordsListEl) {
            keywordsListEl.innerHTML = topWords.map(([word, count]) =>
                `<div class="flex justify-between text-[10px] font-mono">
                    <span class="text-[#00FF41]/80">${word.toUpperCase()}</span>
                    <span class="text-[#00FF41]/40">${count}x</span>
                </div>`
            ).join('');
        }

        // --- Sentiment Polarity ---
        const positiveWords = new Set(['good','great','excellent','perfect','success','agree','approved','yes','resolved','completed','achieved','positive','strong','confident','efficient','effective','clear','progress','done','ready']);
        const negativeWords = new Set(['bad','issue','problem','fail','failed','error','no','not','concern','risk','delay','block','blocked','unclear','missing','wrong','difficult','struggle','reject','rejected','urgent','overdue','behind','slow']);
        let posCount = 0, negCount = 0;
        for (const w of words) {
            if (positiveWords.has(w)) posCount++;
            if (negativeWords.has(w)) negCount++;
        }
        const total = posCount + negCount || 1;
        const sentimentScore = Math.round((posCount / total) * 100); // 0=all neg, 100=all pos
        const markerEl = document.getElementById('hSentimentMarker');
        const labelEl = document.getElementById('hSentimentLabel');
        if (markerEl) markerEl.style.left = sentimentScore + '%';
        if (labelEl) {
            labelEl.textContent = sentimentScore > 65 ? 'POSITIVE' : sentimentScore < 35 ? 'NEGATIVE' : 'NEUTRAL';
            labelEl.className = 'text-[10px] font-bold ' + (sentimentScore > 65 ? 'text-[#00FF41]' : sentimentScore < 35 ? 'text-red-400' : 'text-yellow-400');
        }

        // --- Speaking Pace ---
        const wordCount = words.length;
        const minutes = Math.max((durationSeconds || 60) / 60, 0.5);
        const wpm = Math.round(wordCount / minutes);
        const paceEl = document.getElementById('hPace');
        const paceLabelEl = document.getElementById('hPaceLabel');
        if (paceEl) paceEl.textContent = wpm;
        if (paceLabelEl) paceLabelEl.textContent = wpm < 100 ? 'SLOW' : wpm > 160 ? 'FAST' : 'NORMAL';

        // --- Meeting Type ---
        const typeEl = document.getElementById('hMeetingType');
        if (typeEl) {
            const statusKeywords = ['standup','status','update','daily','progress','sprint'];
            const planKeywords = ['plan','roadmap','strategy','initiative','quarter','goal'];
            const reviewKeywords = ['review','retrospective','feedback','demo','showcase'];
            const isStatus = statusKeywords.some(k => allText.includes(k));
            const isPlan = planKeywords.some(k => allText.includes(k));
            const isReview = reviewKeywords.some(k => allText.includes(k));
            typeEl.textContent = isReview ? 'REVIEW' : isPlan ? 'PLANNING' : isStatus ? 'STATUS' : 'DISCUSSION';
        }

        // --- Risk Flags ---
        const riskEl = document.getElementById('hRiskFlags');
        if (riskEl) {
            const riskKeywords = [
                { label: 'DEADLINE_RISK', terms: ['deadline','overdue','behind','late','delay'] },
                { label: 'BLOCKERS', terms: ['blocked','blocker','stuck','waiting','dependency'] },
                { label: 'SCOPE_CREEP', terms: ['scope','added','extra','additional','new requirement'] },
                { label: 'RESOURCE_GAP', terms: ['resource','capacity','bandwidth','availability','shortage'] },
            ];
            const flagged = riskKeywords.filter(r => r.terms.some(t => allText.includes(t)));
            if (flagged.length === 0) {
                riskEl.innerHTML = '<span class="text-[#00FF41]/30 text-[10px]">NO_FLAGS_DETECTED</span>';
            } else {
                riskEl.innerHTML = flagged.map(f =>
                    `<div class="text-[10px] font-mono text-red-400 flex items-center gap-1"><span>[!]</span>${f.label}</div>`
                ).join('');
            }
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
