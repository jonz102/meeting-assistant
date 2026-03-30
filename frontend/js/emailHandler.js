class EmailHandler {
    constructor() {
        this.apiClient = apiClient;
    }

    async sendTranscriptEmail(meetingId) {
        try {
            uiManager.setEmailButtonLoading(true);

            const result = await this.apiClient.sendMeetingEmail(meetingId);

            if (result.success && result.email_sent) {
                showToast(`Email sent successfully to ${result.message.split('to ')[1]}`, 'success');
                return result;
            } else {
                throw new Error(result.message || 'Failed to send email');
            }
        } catch (error) {
            console.error('Email sending error:', error);
            showToast(error.message || 'Failed to send email', 'error');
            throw error;
        } finally {
            uiManager.setEmailButtonLoading(false);
        }
    }

    async promptAndSendEmail(meetingId) {
        try {
            // Backend resolves the recipient from the authenticated user's profile
            return await this.sendTranscriptEmail(meetingId);
        } catch (error) {
            console.error('Email prompt error:', error);
        }
    }
}

const emailHandler = new EmailHandler();
