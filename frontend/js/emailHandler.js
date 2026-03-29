class EmailHandler {
    constructor() {
        this.apiClient = apiClient;
    }

    async sendTranscriptEmail(meetingId, recipientEmail = null) {
        try {
            uiManager.setEmailButtonLoading(true);

            const result = await this.apiClient.sendMeetingEmail(meetingId, recipientEmail);

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
            // Get current user
            const user = await authManager.getCurrentUser();
            if (!user) {
                showToast('User not found. Please log in again.', 'error');
                return;
            }

            // For now, send to user's email
            // In future, could prompt for alternative email
            return await this.sendTranscriptEmail(meetingId, user.email);
        } catch (error) {
            console.error('Email prompt error:', error);
            showToast('Failed to send email', 'error');
        }
    }
}

const emailHandler = new EmailHandler();
