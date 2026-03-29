class AuthManager {
    constructor() {
        this.tokenKey = 'meeting_assistant_token';
        this.userKey = 'meeting_assistant_user';
        this.apiBase = window.APP_CONFIG?.API_BASE_URL || 'http://localhost:8000';
    }

    async signup(email, password, fullName) {
        try {
            const response = await fetch(`${this.apiBase}/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: fullName
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Signup failed');
            }

            const data = await response.json();
            this.setToken(data.token);
            this.setUser({ user_id: data.user_id, email: data.email });
            return data;
        } catch (error) {
            console.error('Signup error:', error);
            throw error;
        }
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBase}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Login failed');
            }

            const data = await response.json();
            this.setToken(data.token);
            this.setUser({ user_id: data.user_id });
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async getCurrentUser() {
        try {
            const token = this.getToken();
            if (!token) return null;

            const response = await fetch(`${this.apiBase}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return null;
                }
                throw new Error('Failed to fetch user');
            }

            const user = await response.json();
            this.setUser(user);
            return user;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }

    async updateProfile(fullName, profileImageUrl) {
        try {
            const token = this.getToken();
            const response = await fetch(`${this.apiBase}/users/me`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    full_name: fullName,
                    profile_image_url: profileImageUrl
                })
            });

            if (!response.ok) {
                throw new Error('Profile update failed');
            }

            const data = await response.json();
            this.setUser(data.user);
            return data;
        } catch (error) {
            console.error('Profile update error:', error);
            throw error;
        }
    }

    setToken(token) {
        localStorage.setItem(this.tokenKey, token);
    }

    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    setUser(user) {
        localStorage.setItem(this.userKey, JSON.stringify(user));
    }

    getUser() {
        const user = localStorage.getItem(this.userKey);
        return user ? JSON.parse(user) : null;
    }

    isAuthenticated() {
        return !!this.getToken();
    }

    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
    }
}

const authManager = new AuthManager();
