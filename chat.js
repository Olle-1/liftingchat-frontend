// Base API URL - using HTTPS with www
const API_URL = 'https://www.liftingchat.com';

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const sourcesContainer = document.getElementById('sources');

// Generate a unique session ID or retrieve from localStorage
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

// Track if we have an active request
let isRequestActive = false;

// Add event listener to send button
sendButton.addEventListener('click', sendMessage);

// Also send message when pressing Enter
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Function to send a message and get a response
async function sendMessage() {
    // Prevent multiple requests
    if (isRequestActive) {
        console.log('Request already in progress');
        return;
    }

    const message = messageInput.value.trim();
    
    if (!message) return; // Don't send empty messages
    
    // Add user message to chat
    addMessage(message, 'user');
    
    // Clear input field
    messageInput.value = '';
    
    // Create bot message container with loading indicator
    const botMessageDiv = document.createElement('div');
    botMessageDiv.className = 'message bot-message';
    
    const botMessageText = document.createElement('p');
    botMessageText.innerHTML = 'Thinking<span class="thinking"></span>';
    botMessageDiv.appendChild(botMessageText);
    
    messagesContainer.appendChild(botMessageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Mark that we have an active request
    isRequestActive = true;
    
    // Try standard endpoint first (more reliable)
    try {
        console.log('Using standard endpoint...');
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
        
        if (response.ok) {
            const data = await response.json();
            
            // Update message with response
            botMessageText.textContent = data.response || "Sorry, I couldn't generate a response.";
            
            // Display sources if available
            if (data.sources && data.sources.length > 0) {
                displaySources(data.sources);
            }
        } else {
            // If standard endpoint fails, try streaming
            console.log('Standard endpoint failed, trying streaming...');
            
            // Update UI to show we're switching to streaming
            botMessageText.textContent = 'Loading response...';
            
            let fullResponse = '';
            let eventSource = null;
            
            try {
                // Create URL with query parameters instead of using POST body
                const url = new URL(`${API_URL}/chat/stream`);
                
                // Use fetch with streaming
                const streamResponse = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: message,
                        session_id: sessionId
                    })
                });
                
                if (!streamResponse.ok) {
                    throw new Error(`HTTP error! status: ${streamResponse.status}`);
                }
                
                // Process the response as a stream
                const reader = streamResponse.body.getReader();
                const decoder = new TextDecoder();
                
                // Clear the loading text
                botMessageText.textContent = '';
                
                // Track accumulated chunks for processing
                let streamBuffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        console.log('Stream complete');
                        break;
                    }
                    
                    // Decode this chunk
                    const chunk = decoder.decode(value, { stream: true });
                    streamBuffer += chunk;
                    
                    // Process all complete SSE messages (they're separated by double newlines)
                    const messages = streamBuffer.split('\n\n');
                    // Keep any incomplete message for next iteration
                    streamBuffer = messages.pop() || '';
                    
                    for (const message of messages) {
                        if (message.trim() === '' || message.startsWith('retry:')) continue;
                        
                        if (message.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(message.substring(6));
                                if (data.content) {
                                    fullResponse += data.content;
                                    botMessageText.textContent = fullResponse;
                                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                }
                            } catch (e) {
                                console.error('Error parsing SSE message:', e, message);
                            }
                        }
                    }
                }
                
                // Check if we got a response
                if (!fullResponse) {
                    throw new Error('No content received from streaming endpoint');
                }
                
                // Extract sources if present in the response
                const sourceMatch = fullResponse.match(/Sources:\s*([\s\S]*)/);
                if (sourceMatch && sourceMatch[1]) {
                    const sourcesText = sourceMatch[1].trim();
                    
                    // Parse links from markdown format [title](url)
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
                        
                        // Remove sources section from displayed response
                        botMessageText.textContent = fullResponse.replace(/Sources:[\s\S]*$/, '').trim();
                    }
                }
                
            } catch (streamError) {
                console.error('Error with streaming:', streamError);
                botMessageText.textContent = 'I encountered an error processing your request. Please try again.';
            }
        }
    } catch (error) {
        console.error('Error:', error);
        botMessageText.textContent = 'I encountered an error processing your request. Please try again.';
    } finally {
        // Request is no longer active
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