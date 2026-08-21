/**
 * API Integration Service
 * Connects the frontend to the Laravel Backend API
 */

const API_BASE_URL = "http://us.apsara.lol:15510/api";

class ApiService {
    /**
     * Submit a new system request to the backend
     * @param {Object} data The request payload
     * @returns {Promise<Object>} The API response
     */
    static async submitRequest(data) {
        try {
            const isFormData = data instanceof FormData;
            const headers = {
                'Accept': 'application/json'
            };
            
            if (!isFormData) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetch(`${API_BASE_URL}/requests`, {
                method: 'POST',
                headers: headers,
                body: isFormData ? data : JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                // Return structured error for 422 Validation or other errors
                return {
                    success: false,
                    status: response.status,
                    message: result.message || 'Something went wrong',
                    errors: result.errors || {}
                };
            }
            
            return result;
        } catch (error) {
            console.error('API Error:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection and ensure the server is running.',
                errors: {}
            };
        }
    }
}
