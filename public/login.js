document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');
    const passwordInput = document.getElementById('password');

    function showMessage(message, isError = false) {
        messageDiv.textContent = message;
        messageDiv.className = 'message ' + (isError ? 'error' : 'success');
        messageDiv.style.display = 'block';
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageDiv.style.display = 'none';

        const password = passwordInput.value;

        if (!password) {
            showMessage('Password is required.', true);
            return;
        }

        // CSRF Token fetching and sending logic removed

        try {
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }), // CSRF token removed from body
            });

            const result = await response.json();

            if (response.ok) {
                showMessage(result.message || 'Login successful! Redirecting...', false);
                // Redirect to the main admin page (e.g., admin.html or a dashboard)
                window.location.href = result.redirectTo || '/admin.html';
            } else {
                showMessage(result.error || 'Login failed. Please check your password.', true);
                passwordInput.value = ''; // Clear password field on error
            }
        } catch (error) {
            console.error('Error during login:', error);
            showMessage('Failed to send request to server. ' + error.message, true);
        }
    });
});
