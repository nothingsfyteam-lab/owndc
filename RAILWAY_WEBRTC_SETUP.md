# OwnDc WebRTC Setup for Railway Deployment

## Overview

OwnDc now includes full WebRTC support for voice and video calling that works seamlessly on Railway's production environment.

## What's Been Optimized for Production

### 1. **Socket.IO Configuration**
- **Auto-detection**: Client automatically detects server URL (works on localhost and production)
- **Multi-transport**: Uses WebSocket primarily with polling fallback
- **Reconnection**: Automatic reconnection with exponential backoff
- **CORS**: Properly configured for all domains

### 2. **WebRTC ICE Servers**
The app now includes:
- **STUN Servers**: 9 reliable STUN servers for NAT traversal
  - Google's STUN servers (4)
  - Other public STUN servers (5)
- **TURN Servers**: OpenRelay public TURN server for relay when needed
- **Fallback Mechanism**: Graceful degradation if certain servers aren't available

### 3. **Media Constraints with Fallbacks**
- **Primary**: Enhanced audio (echo cancellation, noise suppression, auto gain control)
- **Fallback**: Basic audio/video if enhanced constraints fail
- This ensures compatibility across different devices and browsers

### 4. **Production Server Configuration**
- Listens on `0.0.0.0` (all network interfaces)
- Proper session security for HTTPS (Railway uses HTTPS)
- Environment-based configuration
- Support for large file uploads (50MB limit)

## Deploying to Railway

### Step 1: Add Procfile (Optional, but recommended)

Create a file named `Procfile` in the root directory:

```
web: node server.js
```

### Step 2: Set Environment Variables

In Railway dashboard, set:

```
NODE_ENV=production
SESSION_SECRET=your-secure-random-string-here
PORT=3000
```

### Step 3: Deploy to Railway

```bash
# Install Railway CLI if you haven't
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Deploy
railway up
```

Or use GitHub integration:
1. Push to GitHub
2. Connect Railway to your GitHub repo
3. Railway auto-deploys on push

### Step 4: Access Your App

Railway will provide a URL like: `https://your-app-name.up.railway.app`

### Step 5: Test WebRTC

1. Open the app in two different browser windows
2. Create two accounts
3. Add as friends
4. Try voice and video calls
5. Check browser console (F12) for detailed logs

## Troubleshooting

### Audio Not Working?

1. **Check Browser Permissions**: Browser must allow microphone access
2. **Check Console Logs** (F12 → Console):
   - Look for "Adding local tracks" messages
   - Look for "Remote track received" messages
   - Look for "Audio playing successfully"
3. **STUN/TURN Issues**: 
   - Multiple STUN servers are configured as fallback
   - OpenRelay TURN server helps if direct P2P fails

### Connection Issues?

1. **Socket.IO**: Check that WebSocket connections are established
2. **Firewall**: Ensure Railway domain is not blocked
3. **CORS**: Should be properly configured

## WebRTC Flow on Production

```
User A (Browser)
    ↓
Socket.IO → Server → Socket.IO
    ↓
User B (Browser)

For each peer:
1. getUserMedia (get audio/video)
2. Create RTCPeerConnection with ICE servers
3. Add local tracks to connection
4. Create Offer/Answer
5. Exchange via Socket.IO signaling
6. ICE candidates exchanged
7. P2P connection established
8. Remote audio/video streams play
```

## Environment Variables Reference

| Variable | Value | Required |
|----------|-------|----------|
| NODE_ENV | production | Yes |
| PORT | 3000 | No (Railway assigns automatically) |
| SESSION_SECRET | Random secure string | Yes |

## Key Files Updated

- `server.js`: Enhanced Socket.IO config, environment detection
- `public/js/app.js`: Multiple STUN/TURN servers, constraint fallbacks
- `.env.example`: Environment variables template

## Performance Tips

1. **HTTPS Only**: Ensure Railway enforces HTTPS (default)
2. **Secure Cookies**: Session cookies are secure in production
3. **Connection Pooling**: Socket.IO handles connection pooling
4. **Auto Reconnection**: Clients reconnect on network failure

## Testing Locally Before Deploy

```bash
cd /path/to/OwnDc3
npm install
npm start
# Visit http://localhost:3000
```

Then test to Railway:

```bash
NODE_ENV=production npm start
# Simulates production environment
```

## Additional Resources

- [Socket.IO Production Guide](https://socket.io/docs/v4/client-api/#socketiosocketurl-options)
- [WebRTC Best Practices](https://webrtc.org/getting-started/peer-connections)
- [Railway Documentation](https://docs.railway.app)

## Support

If WebRTC calls don't work:

1. Check `/api/auth/me` endpoint is accessible
2. Verify Socket.IO connection in console
3. Check that both users are logged in and friends
4. Look for console errors (F12 → Console → stderr)
5. Check Railway log dashboard for server errors

---

**Last Updated**: 2026-02-14
**Version**: 1.0 - Production Ready
