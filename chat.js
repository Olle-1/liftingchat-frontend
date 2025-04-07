// Base API URL
const API_URL = '/api';

// Generate a unique session ID
const sessionId = localStorage.getItem('chatSessionId') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('chatSessionId', sessionId);

// DOM elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const sourcesContainer = document.getElementById('sources');

// Track if a request is in progress
let isRequestInProgress = false;

// Add event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Main function to send a message and get streaming response
async function sendMessage() {
    if (isRequestInProgress) {
        console.log("Request already in progress");
        return;
    }
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessage(message, 'user');
    messageInput.value = '';
    
    // Create response container
    const responseDiv = document.createElement('div');
    responseDiv.className = 'message bot-message';
    const responsePara = document.createElement('p');
    responseDiv.appendChild(responsePara);
    messagesContainer.appendChild(responseDiv);
    
    // Show initial "thinking" state
    responsePara.textContent = "Thinking...";
    
    // Set request in progress
    isRequestInProgress = true;
    
    try {
        console.log("Sending streaming request to:", `${API_URL}/chat/stream`);
        
        // Use the streaming endpoint
        const response = await fetch(`${API_URL}/chat/stream`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                query: message,
                session_id: sessionId
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        // Clear the initial "thinking" text
        responsePara.textContent = "";
        
        // Process the event stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        
        console.log("Starting to process stream...");
        
        while (true) {
            const {done, value} = await reader.read();
            if (done) {
                console.log("Stream complete");
                break;
            }
            
            buffer += decoder.decode(value, {stream: true});
            
            // Process complete events in buffer
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        console.log("Received chunk:", data.content);
                        responsePara.textContent += data.content;
                        fullResponse += data.content;
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    } catch (e) {
                        console.error("Error parsing JSON:", e, "Raw line:", line);
                    }
                }
            }
        }
        
        console.log("Processing complete response");
        
        // Process sources if present in the response
        const sourcesMatch = fullResponse.match(/Sources:([\s\S]+)/);
        if (sourcesMatch) {
            const sourcesText = sourcesMatch[1];
            const sourceLinks = [];
            
            // Parse markdown links
            const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
            let match;
            while ((match = linkPattern.exec(sourcesText)) !== null) {
                sourceLinks.push({
                    title: match[1],
                    url: match[2]
                });
            }
            
            // Display sources
            if (sourceLinks.length > 0) {
                displaySources(sourceLinks);
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        responsePara.textContent = `I encountered an error: ${error.message}. Please try again.`;
    } finally {
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
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to display sources
function displaySources(sources) {
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