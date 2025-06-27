#!/bin/bash

# Start WebSocket server for music synchronization
echo "🎵 Starting WebSocket Music Sync Server..."

cd server

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing WebSocket server dependencies..."
    npm install
fi

# Start the server
echo "🚀 Starting server on port 8081..."
node websocket-server.js
