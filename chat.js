// Base API URL - Now using /api prefix
const API_URL = '/api';

// Generate a unique session ID or retrieve from localStorage
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

// Track request state to prevent duplicate requests
let isRequestInProgress = false;

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const sourcesContainer = document.getElementById('sources');

// Add event listener to send button
sendButton.addEventListener('click', sendMessage);

// Also send message when pressing Enter
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Function to send a message
async function sendMessage() {
    // Prevent sending if a request is already in progress
    if (isRequestInProgress) {
        console.log("Request already in progress, please wait...");
        return;
    }
    
    const message = messageInput.value.trim();
    
    if (!message) return; // Don't send empty messages
    
    // Add user message to chat
    addMessage(message, 'user');
    
    // Clear input field
    messageInput.value = '';
    
    // Add loading indicator with dots animation
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot-message';
    loadingDiv.innerHTML = '<p id="loading-text">Thinking<span class="dots">...</span></p>';
    messagesContainer.appendChild(loadingDiv);
    
    // Start loading animation
    const loadingText = document.getElementById('loading-text');
    const loadingInterval = setInterval(() => {
        const dots = loadingText.querySelector('.dots');
        if (dots.textContent.length >= 3) {
            dots.textContent = '.';
        } else {
            dots.textContent += '.';
        }
    }, 500);
    
    // Set request in progress flag
    isRequestInProgress = true;
    
    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2-minute timeout
        
        console.log("Sending request to API:", `${API_URL}/chat`);
        
        // Send message to API with updated path and timeout
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: message,
                session_id: sessionId
            }),
            signal: controller.signal,
            // Increase cache-busting and prevent browser caching
            cache: 'no-store'
        });
        
        console.log("Received response with status:", response.status);
        
        // Clear timeout since we got a response
        clearTimeout(timeoutId);
        
        // Stop loading animation
        clearInterval(loadingInterval);
        
        // Remove loading indicator
        messagesContainer.removeChild(loadingDiv);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.detail || `Error: ${response.status} ${response.statusText}`;
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log("Processed response data");
        
        // Add bot response to chat
        addMessage(data.response, 'bot');
        
        // Display sources if available
        if (data.sources && data.sources.length > 0) {
            displaySources(data.sources);
        }
        
    } catch (error) {
        console.error("Error in fetch operation:", error);
        
        // Stop loading animation
        clearInterval(loadingInterval);
        
        // Remove loading indicator if still present
        if (messagesContainer.contains(loadingDiv)) {
            messagesContainer.removeChild(loadingDiv);
        }
        
        // Check for specific error types
        let errorMessage = "Sorry, there was an error. Please try again.";
        
        if (error.name === 'AbortError') {
            errorMessage = "The request took too long to complete. Please try asking a simpler question.";
        } else if (error.message.includes('504')) {
            errorMessage = "The server took too long to respond. This might happen with complex questions. Please try a simpler question.";
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }
        
        // Show error message
        addMessage(errorMessage, 'bot');
    } finally {
        // Reset request in progress flag
        isRequestInProgress = false;
    }
}

// Function to add a message to the chat
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const messagePara = document.createElement('p');
    messagePara.textContent = text;
    messageDiv.appendChild(messagePara);
    
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom of messages
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to display sources
function displaySources(sources) {
    // Clear current sources
    sourcesContainer.innerHTML = '';
    
    sources.forEach(source => {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'source';
        
        const sourceLink = document.createElement('a');
        sourceLink.href = source.url;
        sourceLink.target = '_blank';
        sourceLink.textContent = source.title;
        
        sourceDiv.appendChild(sourceLink);
        sourcesContainer.appendChild(sourceDiv);
    });
}