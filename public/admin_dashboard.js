document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const profilesTableBody = document.querySelector('#profilesTable tbody');
    const showCreateProfileFormButton = document.getElementById('showCreateProfileForm');
    const profileEditorDiv = document.getElementById('profileEditor');
    const profileForm = document.getElementById('profileForm');
    const editorTitle = document.getElementById('editorTitle');
    const cancelEditButton = document.getElementById('cancelEditButton');
    const messageGlobalDiv = document.getElementById('messageGlobal');
    const messageEditorDiv = document.getElementById('messageEditor');

    // Form fields
    const profileNameInput = document.getElementById('profileName');
    const profileNameOriginalInput = document.getElementById('profileNameOriginal');
    const apiBaseUrlInput = document.getElementById('apiBaseUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const modelNameInput = document.getElementById('modelName');
    const apiSystemPromptInput = document.getElementById('apiSystemPrompt');
    const apiLogCheckbox = document.getElementById('apiLog');

    let currentProfilesData = { profiles: {}, activeProfile: null };
    let isEditMode = false;

    // --- Utility Functions ---
    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = 'message ' + (isError ? 'error' : 'success');
        element.style.display = 'block';
        setTimeout(() => { element.style.display = 'none'; }, 5000);
    }

    function getCsrfToken() {
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('_csrf='))
            ?.split('=')[1];
        return cookieValue;
    }

    // --- API Interaction ---
    async function fetchProfiles() {
        try {
            const response = await fetch('/admin/profiles', {
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || `HTTP error ${response.status}`);
            }
            currentProfilesData = await response.json();
            renderProfilesTable();
        } catch (error) {
            console.error('Error fetching profiles:', error);
            showMessage(messageGlobalDiv, `Error fetching profiles: ${error.message}`, true);
        }
    }

    async function saveProfile(profileDataInternal, originalNameForEdit) {
        let response;
        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken()
            };

            if (isEditMode) {
                const body = { settings: profileDataInternal.settings };
                if (profileNameInput.value.trim() !== originalNameForEdit) {
                    body.newName = profileNameInput.value.trim();
                }
                response = await fetch(`/admin/profiles/${encodeURIComponent(originalNameForEdit)}`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify(body)
                });
            } else {
                response = await fetch('/admin/profiles', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        name: profileDataInternal.profileNameInternal,
                        settings: profileDataInternal.settings
                    })
                });
            }

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `HTTP error ${response.status}`);
            }
            showMessage(messageEditorDiv, result.message || 'Profile saved successfully!', false);
            profileEditorDiv.style.display = 'none';
            if (result.profiles && result.activeProfile !== undefined) {
                currentProfilesData = { profiles: result.profiles, activeProfile: result.activeProfile };
                renderProfilesTable();
            } else {
                fetchProfiles();
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            showMessage(messageEditorDiv, `Error saving profile: ${error.message}`, true);
        }
    }

    async function deleteProfile(profileNameToDelete) {
        if (!confirm(`Are you sure you want to delete profile "${profileNameToDelete}"?`)) return;
        try {
            const response = await fetch(`/admin/profiles/${encodeURIComponent(profileNameToDelete)}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error ${response.status}`);
            showMessage(messageGlobalDiv, result.message || `Profile "${profileNameToDelete}" deleted.`, false);
            if (result.profiles && result.activeProfile !== undefined) {
                currentProfilesData = { profiles: result.profiles, activeProfile: result.activeProfile };
                renderProfilesTable();
            } else {
                fetchProfiles();
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            showMessage(messageGlobalDiv, `Error deleting profile: ${error.message}`, true);
        }
    }

    async function setActiveProfile(profileNameToActivate) {
        try {
            const response = await fetch(`/admin/profiles/${encodeURIComponent(profileNameToActivate)}/activate`, {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || `HTTP error ${response.status}`);
            showMessage(messageGlobalDiv, result.message || `Profile "${profileNameToActivate}" set as active.`, false);
            if (result.activeProfile !== undefined) {
                currentProfilesData.activeProfile = result.activeProfile;
                renderProfilesTable();
            } else {
                fetchProfiles();
            }
        } catch (error) {
            console.error('Error activating profile:', error);
            showMessage(messageGlobalDiv, `Error activating profile: ${error.message}`, true);
        }
    }

    async function doLogout() {
        try {
            const response = await fetch('/admin/logout', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });
            const result = await response.json();
            if (response.ok) {
                window.location.href = result.redirectTo || '/login.html';
            } else {
                showMessage(messageGlobalDiv, result.error || 'Logout failed.', true);
            }
        } catch (error) {
            showMessage(messageGlobalDiv, `Logout error: ${error.message}`, true);
        }
    }

    // --- UI Rendering and Event Handlers ---
    function renderProfilesTable() {
        profilesTableBody.innerHTML = '';
        const profiles = currentProfilesData.profiles || {};
        const activeProfileName = currentProfilesData.activeProfile;

        if (Object.keys(profiles).length === 0) {
            profilesTableBody.innerHTML = '<tr><td colspan="3">No profiles created yet.</td></tr>';
            return;
        }

        for (const name in profiles) {
            const profile = profiles[name];
            const row = profilesTableBody.insertRow();
            row.insertCell().textContent = name;

            const statusCell = row.insertCell();
            if (name === activeProfileName) {
                statusCell.innerHTML = '<span style="color:green; font-weight:bold;">Active</span>';
            } else {
                statusCell.innerHTML = 'Inactive';
            }

            const actionsCell = row.insertCell();
            actionsCell.className = 'actions';

            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.className = 'btn btn-warning btn-sm';
            editButton.onclick = () => showProfileEditor(name, profile);
            actionsCell.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'btn btn-danger btn-sm';
            deleteButton.onclick = () => deleteProfile(name);
            actionsCell.appendChild(deleteButton);

            if (name !== activeProfileName) {
                const activateButton = document.createElement('button');
                activateButton.textContent = 'Set Active';
                activateButton.className = 'btn btn-success btn-sm';
                activateButton.onclick = () => setActiveProfile(name);
                actionsCell.appendChild(activateButton);
            }
        }
    }

    function showProfileEditor(profileName = null, profileData = null) {
        profileEditorDiv.style.display = 'block';
        profileForm.reset();
        document.getElementById('apiKey').type = 'password';

        if (profileName && profileData) {
            isEditMode = true;
            editorTitle.textContent = `Edit Profile: ${profileName}`;
            profileNameInput.value = profileName;
            profileNameInput.readOnly = false;
            profileNameOriginalInput.value = profileName;

            apiBaseUrlInput.value = profileData.API_BASE_URL || '';
            apiKeyInput.value = profileData.API_KEY || '';
            modelNameInput.value = profileData.MODEL_NAME || '';
            apiSystemPromptInput.value = profileData.API_SYSTEM_PROMPT || '';
            apiLogCheckbox.checked = profileData.API_LOG === true || profileData.API_LOG === 'true';
        } else {
            isEditMode = false;
            editorTitle.textContent = 'Create New Profile';
            profileNameInput.readOnly = false;
            profileNameOriginalInput.value = '';
        }
    }

    // Event Listeners
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.addEventListener('click', doLogout);

    if (showCreateProfileFormButton) {
        showCreateProfileFormButton.addEventListener('click', () => showProfileEditor());
    }
    
    // Style improvements
    document.querySelectorAll('button').forEach(button => {
        button.classList.add('styled-button');
    });

    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', () => {
            profileEditorDiv.style.display = 'none';
        });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const pName = profileNameInput.value.trim();
            if (!pName) {
                showMessage(messageEditorDiv, 'Profile Name is required.', true);
                return;
            }

            const settings = {
                API_BASE_URL: apiBaseUrlInput.value.trim(),
                API_KEY: apiKeyInput.value.trim(),
                MODEL_NAME: modelNameInput.value.trim(),
                API_SYSTEM_PROMPT: apiSystemPromptInput.value.trim(),
                API_LOG: apiLogCheckbox.checked
            };

            saveProfile({ profileNameInternal: pName, settings: settings }, profileNameOriginalInput.value);
        });
    }

    // Initial Load
    fetchProfiles();

    // --- Password Change Functionality ---
    const showChangePasswordFormButton = document.getElementById('showChangePasswordForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const messagePasswordDiv = document.getElementById('messagePassword');
    const cancelChangePasswordButton = document.getElementById('cancelChangePassword');

    if (showChangePasswordFormButton) {
        showChangePasswordFormButton.addEventListener('click', () => {
            changePasswordForm.style.display = 'block';
            showChangePasswordFormButton.style.display = 'none';
            messagePasswordDiv.style.display = 'none';
            changePasswordForm.reset();
        });
    }

    if (cancelChangePasswordButton) {
        cancelChangePasswordButton.addEventListener('click', () => {
            changePasswordForm.style.display = 'none';
            showChangePasswordFormButton.style.display = 'block';
            messagePasswordDiv.style.display = 'none';
        });
    }

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            messagePasswordDiv.style.display = 'none';

            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmNewPassword = confirmNewPasswordInput.value;

            if (newPassword.length < 8) {
                showMessage(messagePasswordDiv, 'New password must be at least 8 characters long.', true);
                return;
            }
            if (newPassword !== confirmNewPassword) {
                showMessage(messagePasswordDiv, 'New passwords do not match.', true);
                return;
            }

            try {
                const response = await fetch('/admin/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                const result = await response.json();

                if (response.ok) {
                    showMessage(messagePasswordDiv, result.message || 'Password changed successfully! You might need to log in again.', false);
                    changePasswordForm.reset();
                    changePasswordForm.style.display = 'none';
                    showChangePasswordFormButton.style.display = 'block';
                    if (result.redirectTo) {
                        setTimeout(() => { window.location.href = result.redirectTo; }, 2000);
                    }
                } else {
                    showMessage(messagePasswordDiv, result.error || 'Failed to change password.', true);
                }
            } catch (error) {
                console.error('Error changing password:', error);
                showMessage(messagePasswordDiv, `Error: ${error.message}`, true);
            }
        });
    }
});
