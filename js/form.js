document.addEventListener('DOMContentLoaded', () => {
    // Only run if on request page
    if (!document.getElementById('request-form')) return;

    let currentStep = 1;
    const totalSteps = 8;
    
    // Elements
    const form = document.getElementById('request-form');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');
    const progressFill = document.getElementById('progress-fill');
    const stepIndicators = document.querySelectorAll('.step-indicator');
    const submitError = document.getElementById('submit-error');

    // UI Initializers
    initSelectableGrids();
    initColorPicker();
    initPlatforms();

    // Navigation Events
    btnNext.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            if (currentStep < totalSteps) {
                currentStep++;
                updateUI();
            }
        }
    });

    btnPrev.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateUI();
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!validateStep(currentStep)) return;

        // Collect data
        const formData = new FormData(form);
        
        // Ensure features is passed as an array for Laravel
        const featuresString = formData.get('features');
        formData.delete('features');
        if (featuresString) {
            featuresString.split(',').forEach(f => formData.append('features[]', f));
        }

        // Ensure platforms is passed as an array for Laravel
        const platformsString = formData.get('platforms');
        formData.delete('platforms');
        if (platformsString) {
            platformsString.split(',').forEach(p => formData.append('platforms[]', p));
        }
        
        // Ensure reference_files is passed as an array for Laravel
        const referenceFilesString = formData.get('reference_files');
        if (referenceFilesString) {
            formData.delete('reference_files');
            formData.append('reference_files[]', referenceFilesString);
        } else {
            formData.delete('reference_files');
        }

        // Remove logo_file if it's empty to prevent validation failure
        const logoFile = formData.get('logo_file');
        if (logoFile && logoFile.size === 0) {
            formData.delete('logo_file');
        }

        // Convert FormData to a plain object for JSON submission
        const data = {};
        formData.forEach((value, key) => {
            // Ignore the actual file object for now since the server doesn't support file uploads yet
            if (value instanceof File) return;
            
            // Handle array-like keys (e.g. features[])
            if (key.endsWith('[]')) {
                const cleanKey = key.slice(0, -2);
                if (!data[cleanKey]) data[cleanKey] = [];
                data[cleanKey].push(value);
            } else {
                data[key] = value;
            }
        });

        // Handle loading state
        const originalBtnText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Submitting...';
        btnPrev.disabled = true;
        submitError.classList.add('hidden');

        // Call API
        const response = await ApiService.submitRequest(data);

        if (response.success) {
            showSuccess(response.data.request_number);
        } else {
            // Restore button
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnText;
            btnPrev.disabled = false;
            
            // Show error
            submitError.textContent = response.message;
            submitError.classList.remove('hidden');
            
            // Handle validation errors if present
            if (response.errors && Object.keys(response.errors).length > 0) {
                // Find first error and go to that step
                const firstErrorField = Object.keys(response.errors)[0];
                const errorElement = document.querySelector(`[name="${firstErrorField}"]`);
                if (errorElement) {
                    const stepEl = errorElement.closest('.form-step');
                    if (stepEl) {
                        currentStep = parseInt(stepEl.getAttribute('data-step'));
                        updateUI();
                        
                        // Show specific errors
                        for (const [field, messages] of Object.entries(response.errors)) {
                            showError(field, messages[0]);
                        }
                    }
                }
            }
        }
    });

    /**
     * Update the UI based on current step
     */
    function updateUI() {
        // Hide all steps, show current
        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
        });
        document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');

        // Update progress bar
        const progressPercentage = ((currentStep) / totalSteps) * 100;
        progressFill.style.width = `${progressPercentage}%`;

        // Update step text for mobile attribute
        document.getElementById('progress-container').setAttribute('data-current-step', currentStep);

        // Update indicators
        stepIndicators.forEach((indicator, index) => {
            if (index < currentStep) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });

        // Update buttons
        btnPrev.disabled = currentStep === 1;
        
        if (currentStep === totalSteps) {
            btnNext.classList.add('hidden');
            btnSubmit.classList.remove('hidden');
            populateReview();
        } else {
            btnNext.classList.remove('hidden');
            btnSubmit.classList.add('hidden');
        }
        
        // Clear global error when moving steps
        submitError.classList.add('hidden');
        
        // Hide warning when moving steps
        if (currentStep !== 3) {
            const changeWarning = document.getElementById('system_type_change_warning');
            if (changeWarning) changeWarning.classList.add('hidden');
        }
    }

    /**
     * Validate current step before proceeding
     */
    function validateStep(step) {
        clearErrors();
        let isValid = true;
        const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
        
        // Validate HTML required inputs
        const requiredInputs = stepEl.querySelectorAll('[required]');
        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                showError(input.name, 'This field is required');
                isValid = false;
            }
        });

        if (step === 4) {
            const platformsInput = document.getElementById('platforms');
            if (platformsInput.value.includes('computer')) {
                const compInput = document.getElementById('computer_platform');
                if (!compInput.value.trim()) {
                    showError('computer_platform', 'Please select a computer platform');
                    isValid = false;
                }
            }
            if (platformsInput.value.includes('phone')) {
                const phoneInput = document.getElementById('phone_platform');
                if (!phoneInput.value.trim()) {
                    showError('phone_platform', 'Please select a phone platform');
                    isValid = false;
                }
            }
        }

        return isValid;
    }

    /**
     * Display field error
     */
    function showError(fieldName, message) {
        const errorEl = document.getElementById(`error-${fieldName}`);
        if (errorEl) {
            errorEl.textContent = message;
        } else {
            // Fallback for hidden inputs or missing error placeholders
            const input = document.querySelector(`[name="${fieldName}"]`);
            if (input) {
                const span = document.createElement('div');
                span.className = 'error-msg mt-1';
                span.id = `error-${fieldName}`;
                span.textContent = message;
                input.parentNode.appendChild(span);
            }
        }
    }

    /**
     * Clear all error messages
     */
    function clearErrors() {
        document.querySelectorAll('.error-msg').forEach(el => {
            if(el.id !== 'submit-error') el.textContent = '';
        });
    }

    const SYSTEM_FEATURES = {
        'POS System': ['Dashboard', 'Sales', 'Products', 'Categories', 'Inventory / Stock Management', 'Customers', 'Suppliers', 'Staff / Users', 'Reports', 'Receipt Printing', 'Barcode Scanner', 'Discounts', 'Taxes', 'Notifications', '+ Other Feature'],
        'Inventory / Stock Management': ['Dashboard', 'Products', 'Categories', 'Stock In', 'Stock Out', 'Suppliers', 'Purchase Orders', 'Stock Alerts', 'Inventory Reports', 'Barcode Scanner', 'Notifications', '+ Other Feature'],
        'Restaurant Management': ['Dashboard', 'Menu Management', 'Categories', 'Table Management', 'Orders', 'Kitchen Orders', 'Products', 'Inventory / Stock', 'Customers', 'Staff', 'Sales', 'Reports', 'Receipt Printing', 'Notifications', '+ Other Feature'],
        'Booking System': ['Dashboard', 'Booking Management', 'Calendar', 'Appointments', 'Customers', 'Services', 'Staff', 'Availability', 'Notifications', 'Reports', '+ Other Feature'],
        'Customer Management': ['Dashboard', 'Customers', 'Customer Profiles', 'Customer Groups', 'Notes', 'Communication History', 'Follow-ups', 'Reports', 'Notifications', '+ Other Feature'],
        'School Management': ['Dashboard', 'Students', 'Teachers', 'Classes', 'Subjects', 'Attendance', 'Grades', 'Schedule', 'Parents', 'Payments', 'Reports', 'Notifications', '+ Other Feature'],
        'Hotel Management': ['Dashboard', 'Rooms', 'Room Types', 'Reservations', 'Guests', 'Check-in', 'Check-out', 'Payments', 'Staff', 'Reports', 'Notifications', '+ Other Feature'],
        'Employee Management': ['Dashboard', 'Employees', 'Departments', 'Roles', 'Attendance', 'Leave Management', 'Payroll', 'Work Schedule', 'Reports', 'Notifications', '+ Other Feature'],
        'Custom System': ['Dashboard', 'Users', 'Products', 'Customers', 'Orders', 'Inventory', 'Payments', 'Reports', 'Notifications', 'Analytics', '+ Other Feature'],
        'Other': ['+ Other Feature']
    };

    /**
     * Initialize selectable grids for System Type and Features
     */
    function initSelectableGrids() {
        // System Type (Single Select)
        const systemCards = document.querySelectorAll('#system_type_grid .selectable-card');
        const systemInput = document.getElementById('system_type');
        const featuresGrid = document.getElementById('features_grid');
        const featuresInput = document.getElementById('features');
        const emptyState = document.getElementById('features_empty_state');
        const changeWarning = document.getElementById('system_type_change_warning');
        const customFeatureContainer = document.getElementById('custom_feature_container');
        const customFeatureInput = document.getElementById('custom_features');
        
        // Initial setup for features view
        if (!systemInput.value) {
            emptyState.classList.remove('hidden');
            featuresGrid.classList.add('hidden');
        }
        
        systemCards.forEach(card => {
            card.addEventListener('click', () => {
                const newSystemType = card.getAttribute('data-value');
                const oldSystemType = systemInput.value;
                
                systemCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                systemInput.value = newSystemType;
                clearErrors(); // Clear validation error if any
                
                if (newSystemType !== oldSystemType) {
                    renderFeatures(newSystemType, oldSystemType !== '');
                }
            });
        });

        function renderFeatures(systemType, isChange) {
            emptyState.classList.add('hidden');
            featuresGrid.classList.remove('hidden');
            
            const currentFeatures = featuresInput.value ? featuresInput.value.split(',') : [];
            const availableFeatures = SYSTEM_FEATURES[systemType] || SYSTEM_FEATURES['Other'];
            
            let removedCount = 0;
            const keptFeatures = [];
            
            // Re-build features grid
            featuresGrid.innerHTML = '';
            
            availableFeatures.forEach(feature => {
                const div = document.createElement('div');
                div.className = 'selectable-card multi';
                div.setAttribute('data-value', feature);
                div.textContent = feature;
                
                if (currentFeatures.includes(feature)) {
                    div.classList.add('selected');
                    keptFeatures.push(feature);
                }
                
                div.addEventListener('click', () => {
                    div.classList.toggle('selected');
                    
                    if (feature === '+ Other Feature') {
                        if (div.classList.contains('selected')) {
                            customFeatureContainer.classList.remove('hidden');
                        } else {
                            customFeatureContainer.classList.add('hidden');
                            customFeatureInput.value = '';
                        }
                    }
                    
                    updateSelectedFeatures();
                });
                
                featuresGrid.appendChild(div);
            });
            
            // Check if any previously selected features were removed
            removedCount = currentFeatures.length - keptFeatures.length;
            
            // If + Other Feature is not selected, hide its container
            if (!keptFeatures.includes('+ Other Feature')) {
                customFeatureContainer.classList.add('hidden');
                customFeatureInput.value = '';
            } else {
                customFeatureContainer.classList.remove('hidden');
            }
            
            featuresInput.value = keptFeatures.join(',');
            
            if (isChange && removedCount > 0) {
                changeWarning.classList.remove('hidden');
            } else {
                changeWarning.classList.add('hidden');
            }
        }

        function updateSelectedFeatures() {
            const selected = [];
            document.querySelectorAll('#features_grid .selectable-card.selected').forEach(c => {
                selected.push(c.getAttribute('data-value'));
            });
            featuresInput.value = selected.join(',');
        }
    }

    /**
     * Initialize platform selections
     */
    function initPlatforms() {
        const platformCards = document.querySelectorAll('#platforms_grid .selectable-card');
        const platformsInput = document.getElementById('platforms');
        const computerContainer = document.getElementById('computer_options_container');
        const phoneContainer = document.getElementById('phone_options_container');
        
        platformCards.forEach(card => {
            card.addEventListener('click', () => {
                if (card.classList.contains('disabled')) return;
                card.classList.toggle('selected');
                updateSelectedPlatforms();
                clearErrors();
            });
        });

        function updateSelectedPlatforms() {
            const selected = [];
            document.querySelectorAll('#platforms_grid .selectable-card.selected').forEach(c => {
                selected.push(c.getAttribute('data-value'));
            });
            platformsInput.value = selected.join(',');

            if (selected.includes('computer')) {
                computerContainer.classList.remove('hidden');
            } else {
                computerContainer.classList.add('hidden');
                document.getElementById('computer_platform').value = '';
                document.querySelectorAll('#computer_platform_grid .selectable-card').forEach(c => c.classList.remove('selected'));
            }

            if (selected.includes('phone')) {
                phoneContainer.classList.remove('hidden');
            } else {
                phoneContainer.classList.add('hidden');
                document.getElementById('phone_platform').value = '';
                document.querySelectorAll('#phone_platform_grid .selectable-card').forEach(c => c.classList.remove('selected'));
            }
        }

        // Single Select logic for Computer/Phone platforms
        function setupSingleSelect(gridId, inputId) {
            const cards = document.querySelectorAll(`#${gridId} .selectable-card`);
            const input = document.getElementById(inputId);
            cards.forEach(card => {
                card.addEventListener('click', () => {
                    if (card.classList.contains('disabled')) return;
                    cards.forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    input.value = card.getAttribute('data-value');
                    clearErrors();
                });
            });
        }
        
        setupSingleSelect('computer_platform_grid', 'computer_platform');
        setupSingleSelect('phone_platform_grid', 'phone_platform');
    }

    /**
     * Initialize color picker logic
     */
    function initColorPicker() {
        const colorCircles = document.querySelectorAll('.color-circle');
        const customInput = document.getElementById('custom_color_input');
        const colorHiddenInput = document.getElementById('primary_color');
        const previewText = document.getElementById('color_preview_text');
        const colorPreviewBox = document.querySelector('.color-preview-box');

        // Select default
        const defaultCircle = document.querySelector('.color-circle[data-color="#0d6efd"]');
        if (defaultCircle) {
            defaultCircle.classList.add('selected');
            updateColorPreview('#0d6efd');
        }

        colorCircles.forEach(circle => {
            circle.addEventListener('click', () => {
                // Remove selected from all
                colorCircles.forEach(c => c.classList.remove('selected'));
                // Add to clicked
                circle.classList.add('selected');
                
                const color = circle.getAttribute('data-color');
                colorHiddenInput.value = color;
                updateColorPreview(color);
            });
        });

        customInput.addEventListener('input', (e) => {
            const color = e.target.value;
            // Remove selected class from predefined circles
            colorCircles.forEach(c => c.classList.remove('selected'));
            colorHiddenInput.value = color;
            updateColorPreview(color);
        });

        function updateColorPreview(hex) {
            colorPreviewBox.style.backgroundColor = hex;
            previewText.textContent = `Selected: ${hex}`;
            // Adjust text color based on brightness
            const c = hex.substring(1);      // strip #
            const rgb = parseInt(c, 16);   // convert rrggbb to decimal
            const r = (rgb >> 16) & 0xff;  // extract red
            const g = (rgb >>  8) & 0xff;  // extract green
            const b = (rgb >>  0) & 0xff;  // extract blue

            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709

            if (luma < 128) {
                previewText.style.color = 'white';
            } else {
                previewText.style.color = 'black';
            }
        }
    }

    /**
     * Populate the final review step with data from the form
     */
    function populateReview() {
        document.getElementById('rev_business_name').textContent = document.getElementById('business_name').value || '-';
        document.getElementById('rev_owner_name').textContent = document.getElementById('owner_name').value || '-';
        document.getElementById('rev_phone').textContent = document.getElementById('phone').value || '-';
        document.getElementById('rev_telegram').textContent = document.getElementById('telegram_username').value || '-';
        document.getElementById('rev_business_type').textContent = document.getElementById('business_type').value || '-';
        
        document.getElementById('rev_system_type').textContent = document.getElementById('system_type').value || '-';
        
        // Features
        const features = document.getElementById('features').value;
        const featuresList = document.getElementById('rev_features');
        featuresList.innerHTML = '';
        if (features) {
            features.split(',').forEach(f => {
                const li = document.createElement('li');
                li.textContent = `✓ ${f}`;
                featuresList.appendChild(li);
            });
        } else {
            featuresList.innerHTML = '<li>None selected</li>';
        }
        
        const customFeaturesInput = document.getElementById('custom_features');
        const revCustomContainer = document.getElementById('rev_custom_features_container');
        const revCustomFeatures = document.getElementById('rev_custom_features');
        
        if (customFeaturesInput && customFeaturesInput.value.trim() !== '') {
            revCustomFeatures.textContent = customFeaturesInput.value;
            revCustomContainer.classList.remove('hidden');
        } else if (revCustomContainer) {
            revCustomContainer.classList.add('hidden');
        }

        // Platform
        const platformsInputValue = document.getElementById('platforms').value;
        const compInputValue = document.getElementById('computer_platform').value;
        const phoneInputValue = document.getElementById('phone_platform').value;
        const platformInfo = document.getElementById('rev_platform_info');
        
        if (platformInfo) {
            platformInfo.innerHTML = '';
            if (platformsInputValue) {
                const platforms = platformsInputValue.split(',');
                if (platforms.includes('computer')) {
                    const compStr = compInputValue === 'windows' ? 'Windows' : compInputValue;
                    platformInfo.innerHTML += `<p class="mb-1">🖥️ <strong>Computer</strong> &mdash; ${compStr}</p>`;
                }
                if (platforms.includes('phone')) {
                    const phoneStr = phoneInputValue === 'android' ? 'Android' : phoneInputValue;
                    platformInfo.innerHTML += `<p class="mb-1">📱 <strong>Phone</strong> &mdash; ${phoneStr}</p>`;
                }
            } else {
                platformInfo.innerHTML = '<p>None selected</p>';
            }
        }

        // Design
        const theme = document.querySelector('input[name="theme"]:checked');
        document.getElementById('rev_theme').textContent = theme ? (theme.value === 'light' ? 'Light' : 'Dark') : '-';
        
        const color = document.getElementById('primary_color').value;
        const colorBadge = document.getElementById('rev_color');
        colorBadge.style.backgroundColor = color;
        colorBadge.title = color;

        // Requirements
        document.getElementById('rev_requirements').textContent = document.getElementById('requirements').value || '-';
        document.getElementById('rev_budget').textContent = document.getElementById('budget').value || 'Not specified';
        document.getElementById('rev_deadline').textContent = document.getElementById('deadline').value || 'Not specified';
    }

    /**
     * Show success screen and populate digital receipt
     */
    function showSuccess(requestNumber) {
        // Just hide the form and progress instead of destroying HTML
        document.getElementById('request-form').classList.add('hidden');
        document.getElementById('progress-container').classList.add('hidden');
        
        const successState = document.getElementById('success-state');
        successState.classList.remove('hidden');
        
        // Populate receipt data
        document.getElementById('receipt_request_number').textContent = requestNumber;
        
        const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('receipt_date').textContent = new Date().toLocaleDateString('en-GB', dateOptions);

        // Business
        document.getElementById('receipt_business_name').textContent = document.getElementById('business_name').value || '-';
        document.getElementById('receipt_owner_name').textContent = document.getElementById('owner_name').value || '-';
        document.getElementById('receipt_phone').textContent = document.getElementById('phone').value || '-';
        document.getElementById('receipt_telegram').textContent = document.getElementById('telegram_username').value || '-';
        document.getElementById('receipt_business_type').textContent = document.getElementById('business_type').value || '-';
        
        // System & Platform
        document.getElementById('receipt_system_type').textContent = document.getElementById('system_type').value || '-';
        
        const platformsInputValue = document.getElementById('platforms').value;
        const compInputValue = document.getElementById('computer_platform').value;
        const phoneInputValue = document.getElementById('phone_platform').value;
        const platformInfo = document.getElementById('receipt_platform_info');
        
        if (platformInfo) {
            platformInfo.innerHTML = '';
            if (platformsInputValue) {
                const platforms = platformsInputValue.split(',');
                if (platforms.includes('computer')) {
                    const compStr = compInputValue === 'windows' ? 'Windows' : compInputValue;
                    platformInfo.innerHTML += `<p class="mb-1">🖥️ Computer &mdash; ${compStr}</p>`;
                }
                if (platforms.includes('phone')) {
                    const phoneStr = phoneInputValue === 'android' ? 'Android' : phoneInputValue;
                    platformInfo.innerHTML += `<p class="mb-1">📱 Phone &mdash; ${phoneStr}</p>`;
                }
            } else {
                platformInfo.innerHTML = '<p>None selected</p>';
            }
        }

        // Features
        const features = document.getElementById('features').value;
        const featuresList = document.getElementById('receipt_features');
        featuresList.innerHTML = '';
        if (features) {
            features.split(',').forEach(f => {
                const li = document.createElement('li');
                li.textContent = `✓ ${f}`;
                featuresList.appendChild(li);
            });
        }
        
        const customFeaturesInput = document.getElementById('custom_features');
        if (customFeaturesInput && customFeaturesInput.value.trim() !== '') {
            const li = document.createElement('li');
            li.innerHTML = `<strong>Custom:</strong> ${customFeaturesInput.value}`;
            featuresList.appendChild(li);
        }

        // Design
        const theme = document.querySelector('input[name="theme"]:checked');
        document.getElementById('receipt_theme').textContent = theme ? (theme.value === 'light' ? 'Light' : 'Dark') : '-';
        
        const color = document.getElementById('primary_color').value;
        const colorBadge = document.getElementById('receipt_color');
        const colorText = document.getElementById('receipt_color_text');
        if(colorBadge) colorBadge.style.backgroundColor = color;
        if(colorText) colorText.textContent = color;

        // Requirements, Budget, Deadline
        document.getElementById('receipt_requirements').textContent = document.getElementById('requirements').value || '-';
        document.getElementById('receipt_budget').textContent = document.getElementById('budget').value || 'Not specified';
        document.getElementById('receipt_deadline').textContent = document.getElementById('deadline').value || 'Not specified';
    }
    
    // Initial Setup
    document.getElementById('progress-container').setAttribute('data-current-step', '1');
});
