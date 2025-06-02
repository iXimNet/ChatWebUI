document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('configForm');
    const messageDiv = document.getElementById('message');

    // Function to display messages
    function showMessage(message, isError = false) {
        messageDiv.textContent = message;
        messageDiv.className = 'message ' + (isError ? 'error' : 'success');
        messageDiv.style.display = 'block';
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000); // Hide after 5 seconds
    }

    // 1. Fetch current configuration on page load
    fetch('/admin/config')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(config => {
            // 2. Populate the form
            document.getElementById('apiBaseUrl').value = config.API_BASE_URL || '';
            document.getElementById('apiKey').value = config.API_KEY || '';
            document.getElementById('modelName').value = config.MODEL_NAME || '';
            document.getElementById('apiSystemPrompt').value = config.API_SYSTEM_PROMPT || '';
            document.getElementById('port').value = config.PORT || '';
            document.getElementById('apiLog').checked = config.API_LOG === 'true' || config.API_LOG === true;
        })
        .catch(error => {
            console.error('Error fetching configuration:', error);
            showMessage('Error fetching current configuration. Please try again. ' + error.message, true);
        });

    // 3. Handle form submission
    form.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent default form submission

        const formData = new FormData(form);
        const configData = {};
        formData.forEach((value, key) => {
            // Handle checkbox value for API_LOG
            if (key === 'API_LOG') {
                configData[key] = document.getElementById('apiLog').checked;
            } else {
                configData[key] = value;
            }
        });

        // Ensure all fields are present, even if empty, to match .env structure
        const allKeys = ['API_BASE_URL', 'API_KEY', 'MODEL_NAME', 'API_SYSTEM_PROMPT', 'PORT', 'API_LOG'];
        allKeys.forEach(key => {
            if (!(key in configData)) {
                if (key === 'API_LOG') {
                    configData[key] = false; // Default for checkbox if not present
                } else {
                    configData[key] = ''; // Default for text fields if not present
                }
            }
        });


        fetch('/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData),
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || `HTTP error! status: ${response.status}`) });
            }
            return response.json();
        })
        .then(data => {
            showMessage(data.message || 'Configuration saved successfully!');
        })
        .catch(error => {
            console.error('Error saving configuration:', error);
            showMessage('Error saving configuration: ' + error.message, true);
        });
    });
});
