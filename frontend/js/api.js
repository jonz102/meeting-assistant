class APIClient {
    constructor() {
        this.apiBase = window.APP_CONFIG?.API_BASE_URL || 'http://localhost:8000';
    }

    async startMeeting(title, participants = []) {
        try {
            const token = authManager.getToken();
            const response = await fetch(`${this.apiBase}/meetings/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    participants
                })
            });

            if (!response.ok) {
                throw new Error('Failed to start meeting');
            }

            return await response.json();
        } catch (error) {
            console.error('Start meeting error:', error);
            throw error;
        }
    }

    async processAudio(audioBlob, meetingId) {
        try {
            const token = authManager.getToken();
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('meeting_id', meetingId);

            const response = await fetch(`${this.apiBase}/meetings/process-audio`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to process audio');
            }

            return await response.json();
        } catch (error) {
            console.error('Process audio error:', error);
            throw error;
        }
    }

    async getMeetings() {
        try {
            const token = authManager.getToken();
            const response = await fetch(`${this.apiBase}/meetings`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch meetings');
            }

            return await response.json();
        } catch (error) {
            console.error('Get meetings error:', error);
            throw error;
        }
    }

    async getMeetingDetail(meetingId) {
        try {
            const token = authManager.getToken();
            const response = await fetch(`${this.apiBase}/meetings/${meetingId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch meeting details');
            }

            return await response.json();
        } catch (error) {
            console.error('Get meeting detail error:', error);
            throw error;
        }
    }

    async sendMeetingEmail(meetingId) {
        try {
            const token = authManager.getToken();

            const response = await fetch(`${this.apiBase}/meetings/${meetingId}/email`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to send email');
            }

            return await response.json();
        } catch (error) {
            console.error('Send email error:', error);
            throw error;
        }
    }

    async health() {
        try {
            const response = await fetch(`${this.apiBase}/health`);
            return await response.json();
        } catch (error) {
            console.error('Health check error:', error);
            throw error;
        }
    }
}

const apiClient = new APIClient();
