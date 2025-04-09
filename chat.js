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
let isSubmitting = false;
let timerInterval = null;
let startTime = 0;

// Add event listener to send button
sendButton.addEventListener('click', sendMessage);

// Also send message when pressing Enter
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Initialize sample questions if they exist
const sampleQuestions = document.querySelectorAll('.sample-question');
if (sampleQuestions.length > 0) {
    sampleQuestions.forEach(button => {
        button.addEventListener('click', function() {
            const questionText = this.textContent;
            messageInput.value = questionText;
            sendMessage();
        });
    });
}

// Function to start the timer
function startTimer(loadingDiv) {
    startTime = Date.now();
    
    // Create timer element if it doesn't exist
    let timerElement = loadingDiv.querySelector('.thinking-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.className = 'thinking-timer';
        loadingDiv.appendChild(timerElement);
    }
    
    // Update timer every 100ms
    timerInterval = setInterval(() => {
        const elapsedTime = (Date.now() - startTime) / 1000;
        timerElement.textContent = `Time elapsed: ${elapsedTime.toFixed(1)}s`;
    }, 100);
}

// Function to stop the timer
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Function to send a message
async function sendMessage() {
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    const messageText = messageInput.value.trim();
    if (!messageText) return; // Don't send empty messages
    
    isSubmitting = true;
    sendButton.disabled = true;
    sendButton.classList.add('btn-disabled');
    
    // Add user message to chat
    addMessage(messageText, 'user');
    
    // Clear input field
    messageInput.value = '';
    
    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot-message';
    loadingDiv.innerHTML = '<p><span class="thinking">Thinking</span></p>';
    messagesContainer.appendChild(loadingDiv);
    
    // Start the timer
    startTimer(loadingDiv);
    
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
                
                // Use proper GET params for EventSource (this is critical for streaming to work)
                const urlWithParams = `${apiUrl}/chat/stream?query=${encodeURIComponent(messageText)}&session_id=${encodeURIComponent(sessionId)}`;
                console.log("Trying streaming from:", urlWithParams);
                
                const success = await tryStreamingResponse(urlWithParams, messageText, loadingDiv);
                if (success) {
                    isSubmitting = false;
                    sendButton.disabled = false;
                    sendButton.classList.remove('btn-disabled');
                    return; // If streaming worked, we're done
                }
                
                // If streaming failed, try regular endpoint with same URL
                useStreaming = false;
            } else {
                const success = await tryRegularResponse(apiUrl, messageText, loadingDiv);
                if (success) {
                    isSubmitting = false;
                    sendButton.disabled = false;
                    sendButton.classList.remove('btn-disabled');
                    return; // If regular endpoint worked, we're done
                }
                
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
                // Stop the timer
                stopTimer();
                
                // Remove loading indicator if still present
                if (messagesContainer.contains(loadingDiv)) {
                    messagesContainer.removeChild(loadingDiv);
                }
                
                // Show error message
                addMessage('Sorry, I\'m having trouble connecting to the server. Please check your connection and try again.', 'bot');
                isSubmitting = false;
                sendButton.disabled = false;
                sendButton.classList.remove('btn-disabled');
            }
        }
    }
}

// Function to try streaming response
async function tryStreamingResponse(urlWithParams, messageText, loadingDiv) {
    return new Promise((resolve) => {
        try {
            // Set up timeout for initial connection
            const connectionTimeout = setTimeout(() => {
                console.error("EventSource connection timed out");
                eventSource.close();
                resolve(false);  // Signal failure
            }, 5000);  // 5 second timeout for connection
            
            // Create EventSource - already has full URL with params
            eventSource = new EventSource(urlWithParams);
            let responseStarted = false;
            let fullResponse = '';
            
            // When connection opens
            eventSource.onopen = () => {
                console.log("Stream connection opened");
                clearTimeout(connectionTimeout);
            };
            
            // When we receive data
            eventSource.onmessage = (event) => {
                try {
                    responseStarted = true;
                    const data = JSON.parse(event.data);
                    
                    if (!data.content) return;
                    
                    // If this is first chunk, replace the loading indicator
                    if (fullResponse === '') {
                        // Stop the timer
                        stopTimer();
                        
                        // Remove the loading indicator
                        if (messagesContainer.contains(loadingDiv)) {
                            messagesContainer.removeChild(loadingDiv);
                        }
                        
                        // Create new message element
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'message bot-message';
                        messageDiv.id = 'current-streaming-message';
                        messagesContainer.appendChild(messageDiv);
                    }
                    
                    // Append to the response
                    fullResponse += data.content;
                    
                    // Update the message content with markdown rendering
                    const messageDiv = document.getElementById('current-streaming-message');
                    if (messageDiv) {
                        // Use marked to render markdown
                        messageDiv.innerHTML = marked.parse(fullResponse);
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
                clearTimeout(connectionTimeout);
                eventSource.close();
                
                // Only resolve as failure if we never got any response
                if (!responseStarted) {
                    resolve(false);
                } else {
                    // We got some response, so consider it a success
                    resolve(true);
                }
            });
            
            eventSource.addEventListener('done', () => {
                console.log("Stream completed");
                clearTimeout(connectionTimeout);
                eventSource.close();
                
                // Remove the id from the message now that streaming is complete
                const messageDiv = document.getElementById('current-streaming-message');
                if (messageDiv) {
                    messageDiv.removeAttribute('id');
                }
                
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
                
                resolve(true);
            });
            
            eventSource.addEventListener('heartbeat', () => {
                console.log("Received heartbeat");
                // Do nothing, just keep connection alive
            });
            
            // If connection fails entirely
            eventSource.onerror = () => {
                console.error("Stream connection failed");
                clearTimeout(connectionTimeout);
                eventSource.close();
                
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
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
        
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
        
        // Stop the timer
        stopTimer();
        
        // Remove loading indicator
        if (messagesContainer.contains(loadingDiv)) {
            messagesContainer.removeChild(loadingDiv);
        }
        
        if (!response.ok) {
            console.error("API returned error:", response.status, response.statusText);
            
            // Display error message to user based on status code
            let errorMsg = "Sorry, there was a problem processing your request.";
            if (response.status === 504) {
                errorMsg = "The request timed out. Your question might be too complex - try asking something simpler.";
            } else if (response.status === 429) {
                errorMsg = "Too many requests. Please wait a moment and try again.";
            }
            
            addMessage(errorMsg, 'bot');
            return false;
        }
        
        const data = await response.json();
        
        // Add bot response to chat with markdown rendering
        addMessage(data.response, 'bot');
        
        // Display sources if available
        if (data.sources && data.sources.length > 0) {
            displaySources(data.sources);
        }
        
        return true;
    } catch (error) {
        console.error("Error with regular API call:", error);
        
        // Stop the timer
        stopTimer();
        
        // If the loadingDiv is still there, replace it with an error message
        if (messagesContainer.contains(loadingDiv)) {
            messagesContainer.removeChild(loadingDiv);
            
            // Add appropriate error message based on error type
            let errorMessage = "Sorry, there was a problem connecting to the server.";
            if (error.name === "AbortError") {
                errorMessage = "The request took too long to complete. Please try asking a simpler question.";
            }
            
            addMessage(errorMessage, 'bot');
        }
        
        return false;
    }
}

// Function to add a message to the chat
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    // For user messages, just use text content
    if (sender === 'user') {
        const messagePara = document.createElement('p');
        messagePara.textContent = text;
        messageDiv.appendChild(messagePara);
    } 
    // For bot messages, use markdown parsing
    else {
        // Use the marked library to render markdown
        messageDiv.innerHTML = marked.parse(text);
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom of messages
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to display sources
function displaySources(sources) {
    // Clear current sources
    sourcesContainer.innerHTML = '';
    
    if (sources.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'source';
        emptyDiv.textContent = 'No sources available';
        sourcesContainer.appendChild(emptyDiv);
        return;
    }
    
    sources.forEach(source => {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'source';
        
        const sourceLink = document.createElement('a');
        sourceLink.href = source.url;
        sourceLink.target = '_blank';
        sourceLink.textContent = source.title || 'Unknown Source';
        
        sourceDiv.appendChild(sourceLink);
        sourcesContainer.appendChild(sourceDiv);
    });
}