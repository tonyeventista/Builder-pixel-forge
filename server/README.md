# WebSocket Music Sync Server

Ultra-fast WebSocket server for synchronizing music playback across multiple browsers with sub-second accuracy.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Start Server

```bash
# Development mode (auto-restart)
npm run dev

# Production mode
npm start
```

### 3. Server will start on port 8080

```
🎵 Music Sync WebSocket Server running on port 8080
```

## 📡 WebSocket API

### Connection

- **URL**: `ws://localhost:8080`
- **Protocol**: JSON messages

### Message Types

#### Join Room

```javascript
{
  type: "join_room",
  roomId: "workspace-id"
}
```

#### Sync Play

```javascript
{
  type: "play",
  position: 45.2,      // Current position in seconds
  songId: "song123"    // Optional song identifier
}
```

#### Sync Pause

```javascript
{
  type: "pause",
  position: 67.8       // Position when paused
}
```

#### Sync Seek

```javascript
{
  type: "seek",
  position: 120.0      // New position in seconds
}
```

#### Song Change

```javascript
{
  type: "song_change",
  song: {              // New song object
    id: "song456",
    title: "Song Title",
    url: "youtube.com/...",
    videoId: "abc123"
  }
}
```

### Server Responses

#### Play Sync

```javascript
{
  type: "play_sync",
  position: 45.2,
  serverTime: 1640995200000,
  startTime: 1640995154800,
  songId: "song123"
}
```

#### Pause Sync

```javascript
{
  type: "pause_sync",
  position: 67.8,
  serverTime: 1640995267800
}
```

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Environment mode

### Server Features

- **Ultra-low latency**: <100ms sync between clients
- **Automatic reconnection**: Client handles connection drops
- **Room management**: Isolated sync per workspace
- **Server time sync**: Accurate timing across time zones
- **Graceful degradation**: Falls back to Firebase if WebSocket fails

## 📊 Monitoring

### Server Stats Endpoint

Access `ws://localhost:8080` and send:

```javascript
{
  type: "get_stats";
}
```

Response:

```javascript
{
  totalRooms: 3,
  totalClients: 12,
  rooms: [
    {
      id: "room1",
      clientCount: 4,
      isPlaying: true,
      currentSong: "Song Title"
    }
  ]
}
```

## 🛠️ Development

### Debug Mode

```bash
DEBUG=* npm run dev
```

### Custom Port

```bash
PORT=3001 npm start
```

## 📈 Performance

- **Latency**: <100ms typical sync time
- **Capacity**: 1000+ concurrent connections per server
- **Memory**: ~1MB per 100 active rooms
- **CPU**: Minimal - event-driven architecture

## 🔒 Security Considerations

- Rate limiting recommended for production
- Consider authentication for room access
- Validate all incoming messages
- Monitor for memory leaks in long-running rooms
