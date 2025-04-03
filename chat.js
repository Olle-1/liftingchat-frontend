// Updated chat.js with proper error handling and fixes

// Base API URL - Use direct URL with no /api prefix
const API_URL = 'https://liftingchat.com';

// Generate a unique session ID or retrieve from localStorage
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

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
    const messageText = messageInput.value.trim();
    
    if (!messageText) return; // Don't send empty messages
    
    // Add user message to chat
    addMessage(messageText, 'user');
    
    // Clear input field
    messageInput.value = '';
    
    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot-message';
    loadingDiv.innerHTML = '<p>Thinking...</p>';
    messagesContainer.appendChild(loadingDiv);
    
    try {
        console.log(`Sending request to ${API_URL}/chat`);
        
        // Set timeout to handle potential hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        // Send message to API
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: messageText,
                session_id: sessionId
            }),
            signal: controller.signal
        });
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Remove loading indicator
        messagesContainer.removeChild(loadingDiv);
        
        console.log(`Response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`Error connecting to the chatbot: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Response received:', data);
        
        // Add bot response to chat
        addMessage(data.response, 'bot');
        
        // Display sources if available
        if (data.sources && data.sources.length > 0) {
            displaySources(data.sources);
        }
        
    } catch (error) {
        console.error('Error details:', error);
        
        // Remove loading indicator if still present
        if (messagesContainer.contains(loadingDiv)) {
            messagesContainer.removeChild(loadingDiv);
        }
        
        // Show specific error message
        let errorMessage = 'Sorry, there was an error processing your request.';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The server took too long to respond.';
        } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('404')) {
            errorMessage = 'Server endpoint not found. Please contact support.';
        } else if (error.message.includes('500')) {
            errorMessage = 'Server error. The chatbot encountered a problem.';
        }
        
        addMessage(errorMessage, 'bot');
        console.error('Error:', error.message);
    }
}

// Function to test API connection - call this from the console for debugging
async function testApiConnection() {
    console.log('Testing API connection...');
    
    try {
        // Test basic connection to root endpoint
        console.log(`Testing root endpoint: ${API_URL}`);
        const rootResponse = await fetch(API_URL);
        console.log('Root endpoint test:', rootResponse.ok ? 'Success' : 'Failed');
        console.log('Status:', rootResponse.status);
        
        if (rootResponse.ok) {
            const rootData = await rootResponse.json();
            console.log('Root data:', rootData);
        }
        
        // Test chat endpoint with a simple POST request
        console.log(`Testing chat endpoint: ${API_URL}/chat`);
        const chatResponse = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'test message', session_id: 'test-session' })
        });
        
        console.log('Chat endpoint test:', chatResponse.ok ? 'Success' : 'Failed');
        console.log('Status:', chatResponse.status);
        
        if (chatResponse.ok) {
            const data = await chatResponse.json();
            console.log('Chat response:', data);
        }
    } catch (error) {
        console.error('API test error:', error);
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
    
    if (!sources || sources.length === 0) {
        const noSourcesDiv = document.createElement('p');
        noSourcesDiv.textContent = 'No sources available';
        sourcesContainer.appendChild(noSourcesDiv);
        return;
    }
    
    sources.forEach(source => {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'source';
        
        const sourceLink = document.createElement('a');
        sourceLink.href = source.url || '#';
        sourceLink.target = '_blank';
        sourceLink.textContent = source.title || 'Unknown Source';
        
        sourceDiv.appendChild(sourceLink);
        sourcesContainer.appendChild(sourceDiv);
    });
}

// Log initialization success
console.log('Chat interface initialized');
console.log('Session ID:', sessionId);