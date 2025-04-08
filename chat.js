// Base API URL
// Generate a unique session ID or retrieve from localStorage
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

// The main API URL. We'll try the direct URL first, then fall back if needed
const API_URLS = [
    'https://www.liftingchat.com', // Primary API URL
    '/api',                        // Netlify proxy fallback
    'https://liftingchat.com'      // Non-www URL fallback
];

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const sourcesContainer = document.getElementById('sources');

// Global variables
let currentApiUrlIndex = 0;
let eventSource = null;

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
    
    // First try streaming, with fallback to regular endpoint
    let useStreaming = true;
    let apiUrl = API_URLS[currentApiUrlIndex];
    let attempts = 0;
    
    while (attempts < API_URLS.length * 2) { // Try each URL with both streaming and non-streaming
        try {
            if (useStreaming) {
                // Close any existing event source
                if (eventSource) {
                    eventSource.close();
                }
                
                const success = await tryStreamingResponse(apiUrl, messageText, loadingDiv);
                if (success) return; // If streaming worked, we're done
                
                // If streaming failed, try regular endpoint with same URL
                useStreaming = false;
            } else {
                const success = await tryRegularResponse(apiUrl, messageText, loadingDiv);
                if (success) return; // If regular endpoint worked, we're done
                
                // If regular endpoint failed, try next URL with streaming
                currentApiUrlIndex = (currentApiUrlIndex + 1) % API_URLS.length;
                apiUrl = API_URLS[currentApiUrlIndex];
                useStreaming = true;
            }
            
            attempts++;
        } catch (error) {
            console.error('Error with API attempt:', error);
            attempts++;
            
            // If we've tried everything, show an error
            if (attempts >= API_URLS.length * 2) {
                // Remove loading indicator if still present
                if (messagesContainer.contains(loadingDiv)) {
                    messagesContainer.removeChild(loadingDiv);
                }
                
                // Show error message
                addMessage('Sorry, I\'m having trouble connecting to the server. Please check your connection and try again.', 'bot');
            }
        }
    }
}

// Function to try streaming response
async function tryStreamingResponse(apiUrl, messageText, loadingDiv) {
    return new Promise((resolve) => {
        try {
            // Create URL for EventSource
            const params = new URLSearchParams({
                query: messageText,
                session_id: sessionId
            });
            
            const streamUrl = `${apiUrl}/chat/stream?${params.toString()}`;
            
            console.log("Trying streaming from:", streamUrl);
            
            // Set up event source with a timeout
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout
            
            eventSource = new EventSource(streamUrl);
            let responseStarted = false;
            let fullResponse = '';
            
            // When connection opens
            eventSource.onopen = () => {
                console.log("Stream connection opened");
                clearTimeout(timeoutId);
            };
            
            // When we receive data
            eventSource.onmessage = (event) => {
                try {
                    responseStarted = true;
                    const data = JSON.parse(event.data);
                    
                    if (!data.content) return;
                    
                    // If this is first chunk, replace the loading indicator
                    if (fullResponse === '') {
                        // Remove the loading indicator
                        if (messagesContainer.contains(loadingDiv)) {
                            messagesContainer.removeChild(loadingDiv);
                        }
                        
                        // Create new message element
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'message bot-message';
                        messageDiv.innerHTML = '<p></p>';
                        messagesContainer.appendChild(messageDiv);
                    }
                    
                    // Append to the response
                    fullResponse += data.content;
                    
                    // Update the message content
                    const lastMessage = messagesContainer.querySelector('.bot-message:last-child p');
                    if (lastMessage) {
                        lastMessage.textContent = fullResponse;
                    }
                    
                    // Scroll to bottom
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } catch (err) {
                    console.error("Error processing stream chunk:", err);
                }
            };
            
            // For different event types
            eventSource.addEventListener('error', (event) => {
                console.error("Stream error:", event);
                eventSource.close();
                
                // Only resolve as failure if we never got any response
                if (!responseStarted) {
                    clearTimeout(timeoutId);
                    resolve(false);
                }
            });
            
            eventSource.addEventListener('done', () => {
                console.log("Stream completed");
                eventSource.close();
                
                // Parse sources from the response if applicable
                if (fullResponse.includes("Sources:")) {
                    const parts = fullResponse.split("Sources:");
                    if (parts.length > 1) {
                        try {
                            // Extract sources using regex
                            const sourceText = parts[1].trim();
                            const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                            let match;
                            const sources = [];
                            
                            while ((match = sourceRegex.exec(sourceText)) !== null) {
                                sources.push({
                                    title: match[1],
                                    url: match[2]
                                });
                            }
                            
                            if (sources.length > 0) {
                                displaySources(sources);
                            }
                        } catch (err) {
                            console.error("Error parsing sources:", err);
                        }
                    }
                }
                
                clearTimeout(timeoutId);
                resolve(true);
            });
            
            // If connection fails entirely
            eventSource.onerror = () => {
                console.error("Stream connection failed");
                eventSource.close();
                clearTimeout(timeoutId);
                
                // Only mark as failure if we never got any data
                resolve(responseStarted);
            };
        } catch (error) {
            console.error("Error setting up streaming:", error);
            if (eventSource) eventSource.close();
            resolve(false);
        }
    });
}

// Function to try regular response
async function tryRegularResponse(apiUrl, messageText, loadingDiv) {
    try {
        console.log("Trying regular API at:", `${apiUrl}/chat`);
        
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        // Send message to API
        const response = await fetch(`${apiUrl}/chat`, {
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
        
        clearTimeout(timeoutId);
        
        // Remove loading indicator
        if (messagesContainer.contains(loadingDiv)) {
            messagesContainer.removeChild(loadingDiv);
        }
        
        if (!response.ok) {
            console.error("API returned error:", response.status, response.statusText);
            return false;
        }
        
        const data = await response.json();
        
        // Add bot response to chat
        addMessage(data.response, 'bot');
        
        // Display sources if available
        if (data.sources && data.sources.length > 0) {
            displaySources(data.sources);
        }
        
        return true;
    } catch (error) {
        console.error("Error with regular API call:", error);
        return false;
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