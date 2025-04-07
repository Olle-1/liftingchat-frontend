// Base API URL - use direct HTTPS URL
const API_URL = 'https://www.liftingchat.com';

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const sourcesContainer = document.getElementById('sources');

// Generate a unique session ID or retrieve from localStorage
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

// Track if we have an active request to prevent multiple simultaneous requests
let isRequestActive = false;

// Add event listener to send button
sendButton.addEventListener('click', sendMessage);

// Also send message when pressing Enter
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Function to send a message and get a streaming response
async function sendMessage() {
    // Don't allow multiple requests at once
    if (isRequestActive) {
        console.log('Request already in progress, please wait');
        return;
    }

    const message = messageInput.value.trim();
    
    if (!message) return; // Don't send empty messages
    
    // Add user message to chat
    addMessage(message, 'user');
    
    // Clear input field
    messageInput.value = '';
    
    // Create a container for the bot's response
    const botResponseDiv = document.createElement('div');
    botResponseDiv.className = 'message bot-message';
    
    const responsePara = document.createElement('p');
    responsePara.textContent = 'Thinking...';
    botResponseDiv.appendChild(responsePara);
    
    messagesContainer.appendChild(botResponseDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Mark that we have an active request
    isRequestActive = true;
    
    // Track if we need to use fallback (non-streaming) approach
    let useFallback = false;
    let fullResponse = '';
    
    try {
        // Set up event source for streaming
        console.log('Connecting to streaming endpoint...');
        
        // Create AbortController for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        // First try the streaming endpoint
        try {
            const response = await fetch(`${API_URL}/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: message,
                    session_id: sessionId
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn(`Streaming endpoint returned error: ${response.status}`);
                useFallback = true;
            } else {
                // Clear the "Thinking..." text
                responsePara.textContent = '';
                
                // Get ready to process the stream
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulatedChunks = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        console.log('Stream complete');
                        break;
                    }
                    
                    // Decode this chunk
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedChunks += chunk;
                    
                    // Process all complete SSE messages in the accumulated chunks
                    const messages = accumulatedChunks.split('\n\n');
                    accumulatedChunks = messages.pop() || ''; // Keep the last incomplete message
                    
                    for (const message of messages) {
                        if (message.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(message.substring(6));
                                if (data.content) {
                                    fullResponse += data.content;
                                    responsePara.textContent = fullResponse;
                                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                }
                            } catch (e) {
                                console.error('Error parsing SSE message:', e);
                            }
                        }
                    }
                }
                
                console.log('Processing complete response');
                
                // Extract sources if present in the response
                const sourceMatch = fullResponse.match(/Sources:\s*([\s\S]*)/);
                if (sourceMatch && sourceMatch[1]) {
                    const sourcesText = sourceMatch[1].trim();
                    const linkPattern = /\[(.*?)\]\((.*?)\)/g;
                    const sources = [];
                    let match;
                    
                    while ((match = linkPattern.exec(sourcesText)) !== null) {
                        sources.push({
                            title: match[1],
                            url: match[2]
                        });
                    }
                    
                    if (sources.length > 0) {
                        displaySources(sources);
                    }
                    
                    // Remove sources from displayed response
                    responsePara.textContent = fullResponse.replace(/Sources:[\s\S]*$/, '').trim();
                }
            }
        } catch (streamError) {
            console.warn('Streaming request failed, falling back to standard endpoint', streamError);
            useFallback = true;
        }
        
        // Use fallback approach if streaming failed
        if (useFallback) {
            responsePara.textContent = 'Fetching response...';
            
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: message,
                    session_id: sessionId
                })
            });
            
            if (!response.ok) {
                throw new Error(`Error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Update bot message with response
            responsePara.textContent = data.response;
            
            // Display sources if available
            if (data.sources && data.sources.length > 0) {
                displaySources(data.sources);
            }
        }
        
    } catch (error) {
        responsePara.textContent = `Sorry, there was an error processing your request. Please try again. (Error: ${error.message})`;
        console.error('Error:', error);
    } finally {
        // Mark that the request is complete
        isRequestActive = false;
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
        return;
    }
    
    sources.forEach(source => {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'source';
        
        if (source.url && source.title) {
            const sourceLink = document.createElement('a');
            sourceLink.href = source.url;
            sourceLink.target = '_blank';
            sourceLink.textContent = source.title;
            sourceDiv.appendChild(sourceLink);
        } else {
            sourceDiv.textContent = source.title || "Unknown source";
        }
        
        sourcesContainer.appendChild(sourceDiv);
    });
}