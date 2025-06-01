document.addEventListener('DOMContentLoaded', () => {
    const setupForm = document.getElementById('setupForm');
    const messageDiv = document.getElementById('message');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    function showMessage(message, isError = false) {
        messageDiv.textContent = message;
        messageDiv.className = 'message ' + (isError ? 'error' : 'success');
        messageDiv.style.display = 'block';
    }

    setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        messageDiv.style.display = 'none'; // Hide previous messages

        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (password.length < 8) {
            showMessage('Password must be at least 8 characters long.', true);
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match.', true);
            return;
        }

        try {
            const response = await fetch('/admin/setup-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }),
            });

            const result = await response.json();

            if (response.ok) {
                showMessage(result.message || 'Password set successfully! Please restart the server.', false);
                setupForm.reset();
                // Disable form inputs after success
                passwordInput.disabled = true;
                confirmPasswordInput.disabled = true;
                document.querySelector('#setupForm button[type="submit"]').disabled = true;
            } else {
                showMessage(result.error || 'An unknown error occurred.', true);
            }
        } catch (error) {
            console.error('Error setting up password:', error);
            showMessage('Failed to send request to server. ' + error.message, true);
        }
    });
});
