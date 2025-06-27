# Firebase Setup Instructions

## Quick Setup (5 phút):

### 1. Tạo Firebase Project

1. Mở https://console.firebase.google.com
2. Click "Create a project"
3. Tên project: `youtube-queue-app` (hoặc tên bạn thích)
4. Disable Google Analytics (không cần cho app này)

### 2. Enable Realtime Database

1. Trong Firebase Console → "Realtime Database"
2. Click "Create Database"
3. Choose "Start in test mode" (rules mở để dev nhanh)
4. Chọn location gần nhất (asia-southeast1)

### 3. Get Firebase Config

1. Project Settings → General → "Your apps"
2. Click web icon `</>`
3. App nickname: `youtube-queue-web`
4. Copy config object

### 4. Update Firebase Config

Replace config trong `src/lib/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL:
    "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};
```

### 5. Test Real-time Sync

1. Deploy app lên Netlify/Vercel
2. Mở 2 browser tabs với cùng workspace URL
3. Thêm nhạc ở tab 1 → Sẽ hiện ở tab 2 real-time! 🎵

## Security Rules (Production):

```json
{
  "rules": {
    "workspaces": {
      "$workspaceId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## No Backend Needed! ✨

Firebase Realtime Database handles all sync automatically.
