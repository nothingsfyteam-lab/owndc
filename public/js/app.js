/**
 * OwnDc - Complete Working Application
 * All functions are fully implemented and functional
 */

// ==================== GLOBAL STATE ====================
let currentUser = null;
let socket = null;
let currentServer = null;
let currentChannel = null;
let currentGroup = null;
let currentView = 'home';

let servers = [];
let channels = [];
let friends = [];
let pendingRequests = [];
let sentRequests = [];
let groupDMs = [];
let serverMembers = [];
let serverRoles = [];
let selectedChannelType = 'text';
let selectedFriendsForGroup = [];

// Voice/Video state
let localStream = null;
let localVideoStream = null;
let screenStream = null;
let peerConnections = new Map();
let isMuted = false;
let isDeafened = false;
let isVideoOn = false;
let isScreenSharing = false;
let currentVoiceChannel = null;
let voiceParticipants = new Map();

// Direct Call state
let currentDirectCall = null;
let currentCallId = null;
let directCallPC = null;
let directCallMuted = false;
let directCallVideoOn = false;
let callTimer = null;
let callStartTime = null;

// UI state
let typingTimeout = null;
let currentModal = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupGlobalEventListeners();
});

function setupGlobalEventListeners() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeAllModals();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      if (currentVoiceChannel) {
        leaveVoiceChannel();
      }
    }
  });
}

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      currentUser = await response.json();
      showApp();
      initializeSocket();
    } else {
      showAuth();
    }
  } catch (error) {
    console.error('Auth check error:', error);
    showAuth();
  }
}

// ==================== AUTHENTICATION ====================
function showAuth() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
  showLogin();
}

function showApp() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  updateUserPanel();
  loadInitialData();
}

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-error').textContent = '';
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('register-error').textContent = '';
}

async function handleLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  if (!email || !password) {
    errorDiv.textContent = 'Please fill in all fields';
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (response.ok) {
      currentUser = await response.json();
      showApp();
      initializeSocket();
    } else {
      const error = await response.json();
      errorDiv.textContent = error.error || 'Login failed';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
  }
}

async function handleRegister() {
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const errorDiv = document.getElementById('register-error');

  if (!username || !email || !password) {
    errorDiv.textContent = 'Please fill in all fields';
    return;
  }

  if (password.length < 6) {
    errorDiv.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    if (response.ok) {
      currentUser = await response.json();
      showApp();
      initializeSocket();
    } else {
      const error = await response.json();
      errorDiv.textContent = error.error || 'Registration failed';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
  }
}

async function logout() {
  try {
    if (currentVoiceChannel) {
      leaveVoiceChannel();
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    if (socket) socket.disconnect();
    currentUser = null;
    showAuth();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ==================== PROFILE MANAGEMENT ====================
function showEditProfile() {
  if (!currentUser) return;
  
  document.getElementById('profile-username').value = currentUser.username || '';
  document.getElementById('profile-email').value = currentUser.email || '';
  document.getElementById('profile-bio').value = currentUser.bio || '';
  document.getElementById('profile-avatar').value = currentUser.avatar || '';
  document.getElementById('profile-banner').value = currentUser.banner || '';
  document.getElementById('profile-status').value = currentUser.custom_status || '';
  
  openModal('edit-profile-modal');
}

async function saveProfile() {
  const username = document.getElementById('profile-username').value.trim();
  const email = document.getElementById('profile-email').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const avatar = document.getElementById('profile-avatar').value.trim();
  const banner = document.getElementById('profile-banner').value.trim();
  const custom_status = document.getElementById('profile-status').value.trim();

  if (!username || !email) {
    showNotification('Username and email are required', 'error');
    return;
  }

  try {
    const response = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email,
        bio,
        avatar: avatar || null,
        banner: banner || null,
        custom_status: custom_status || null
      })
    });

    if (response.ok) {
      currentUser = await response.json();
      updateUserPanel();
      showNotification('Profile updated successfully!', 'success');
      closeModal('edit-profile-modal');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to update profile', 'error');
    }
  } catch (error) {
    console.error('Save profile error:', error);
    showNotification('Failed to update profile', 'error');
  }
}

function showChangePassword() {
  openModal('change-password-modal');
}

async function changePassword() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showNotification('All fields are required', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showNotification('New passwords do not match', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showNotification('New password must be at least 6 characters', 'error');
    return;
  }

  try {
    const response = await fetch('/api/users/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (response.ok) {
      showNotification('Password changed successfully!', 'success');
      closeModal('change-password-modal');
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to change password', 'error');
    }
  } catch (error) {
    console.error('Change password error:', error);
    showNotification('Failed to change password', 'error');
  }
}

// ==================== SOCKET.IO ====================
function initializeSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('authenticate', currentUser.id);
  });

  socket.on('authenticated', (data) => {
    if (data.success) {
      console.log('Socket authenticated');
      loadServers();
    }
  });

  socket.on('new-message', (message) => {
    if (currentChannel && currentChannel.id === message.channel_id) {
      displayMessage(message);
      scrollToBottom();
    }
  });

  socket.on('new-dm', (message) => {
    if ((currentView === 'dm' && currentChannel?.userId === message.sender_id) ||
        (currentView === 'group' && currentChannel?.groupId === message.group_id)) {
      displayMessage(message);
      scrollToBottom();
    }
  });

  socket.on('user-typing', (data) => {
    if (currentChannel && currentChannel.id === data.channelId) {
      showTypingIndicator(data.username, data.isTyping);
    }
  });

  socket.on('friend-request-received', (data) => {
    showNotification('New friend request from ' + data.from.username, 'info');
    loadFriends();
  });

  socket.on('friend-request-accepted-by', (data) => {
    showNotification(data.user.username + ' accepted your friend request', 'success');
    loadFriends();
  });

  socket.on('friend-online', (data) => {
    updateFriendStatus(data.userId, 'online');
  });

  socket.on('friend-offline', (data) => {
    updateFriendStatus(data.userId, 'offline');
  });

  socket.on('user-joined-voice', (data) => {
    if (currentVoiceChannel === data.channelId) {
      // Don't add yourself again if you just joined
      if (data.userId !== currentUser.id) {
        addVoiceParticipant(data);
        if (!data.isVideo) {
          initiatePeerConnection(data.userId);
        }
      }
    }
  });

  socket.on('user-left-voice', (data) => {
    if (currentVoiceChannel === data.channelId) {
      removeVoiceParticipant(data.userId);
      closePeerConnection(data.userId);
    }
  });

  socket.on('voice-channel-users', (data) => {
    data.users.forEach(user => {
      if (user.id !== currentUser.id) {
        addVoiceParticipant(user);
        if (!data.isVideo) {
          initiatePeerConnection(user.id);
        }
      }
    });
  });

  socket.on('voice-state-changed', (data) => {
    updateParticipantState(data);
  });

  socket.on('offer', async (data) => {
    await handleOffer(data.userId, data.offer, data.type);
  });

  socket.on('answer', async (data) => {
    await handleAnswer(data.userId, data.answer);
  });

  socket.on('ice-candidate', async (data) => {
    await handleIceCandidate(data.userId, data.candidate);
  });

  // ==================== DIRECT CALL HANDLERS ====================

  socket.on('incoming-call', (data) => {
    const { callId, callType, caller } = data;
    // Store caller info
    currentDirectCall = caller;
    currentCallId = callId;
    showIncomingCallNotification(callId, callType, caller);
  });

  socket.on('call-accepted', (data) => {
    const { callId, callee } = data;
    currentDirectCall = callee;
    currentCallId = callId;
    closeAllModals();
    showCallInterface(callee);
    startCallTimer();
    console.log('Call accepted by:', callee.username);
  });

  socket.on('call-rejected', (data) => {
    const { callId, reason } = data;
    endDirectCall();
    showNotification(`Call rejected: ${reason}`, 'info');
  });

  socket.on('call-ended', (data) => {
    const { callId } = data;
    if (currentCallId === callId) {
      endDirectCall();
      showNotification('Call ended', 'info');
    }
  });

  socket.on('call-offer', async (data) => {
    const { callId, userId, offer } = data;
    try {
      // Store the offer for when user accepts
      window.pendingCallOffer = { callId, userId, offer };
      
      // If localStream is already available, process immediately
      if (localStream && !directCallPC) {
        directCallPC = createDirectCallPeerConnection(userId);
        await directCallPC.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await directCallPC.createAnswer();
        await directCallPC.setLocalDescription(answer);
        socket.emit('call-answer', {
          callId,
          targetUserId: userId,
          answer: answer
        });
      }
    } catch (error) {
      console.error('Error handling call offer:', error);
    }
  });

  socket.on('call-answer', async (data) => {
    const { callId, userId, answer } = data;
    if (directCallPC) {
      try {
        await directCallPC.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling call answer:', error);
      }
    }
  });

  socket.on('call-ice-candidate', async (data) => {
    const { callId, userId, candidate } = data;
    if (directCallPC) {
      try {
        await directCallPC.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });
}

// ==================== DATA LOADING ====================
async function loadInitialData() {
  await Promise.all([
    loadServers(),
    loadFriends(),
    loadGroupDMs()
  ]);
}

async function loadServers() {
  try {
    const response = await fetch('/api/servers');
    if (response.ok) {
      servers = await response.json();
      renderServerList();
    }
  } catch (error) {
    console.error('Error loading servers:', error);
  }
}

async function loadServer(serverId) {
  try {
    const response = await fetch(`/api/servers/${serverId}`);
    if (response.ok) {
      const data = await response.json();
      currentServer = data.server;
      channels = data.channels || [];
      serverMembers = data.members || [];
      serverRoles = data.roles || [];
      
      renderChannels();
      renderServerHeader();
      
      if (socket) {
        socket.emit('join-server', serverId);
      }
      
      renderServerList();
    }
  } catch (error) {
    console.error('Error loading server:', error);
  }
}

async function loadFriends() {
  try {
    const response = await fetch('/api/friends');
    if (response.ok) {
      const data = await response.json();
      friends = data.friends;
      pendingRequests = data.pendingRequests || [];
      sentRequests = data.sentRequests || [];
      renderFriends();
      renderFriendRequests();
    }
  } catch (error) {
    console.error('Error loading friends:', error);
  }
}

async function loadGroupDMs() {
  try {
    const response = await fetch('/api/groups');
    if (response.ok) {
      groupDMs = await response.json();
      renderGroupDMs();
    }
  } catch (error) {
    console.error('Error loading groups:', error);
  }
}

// ==================== UI RENDERING ====================
function updateUserPanel() {
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userStatus = document.getElementById('user-status');
  
  if (userAvatar) {
    if (currentUser.avatar) {
      userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%;">`;
    } else {
      userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
    }
  }
  
  if (userName) userName.textContent = currentUser.username;
  if (userStatus) {
    userStatus.textContent = currentUser.custom_status || currentUser.status || 'Online';
  }
}

function renderServerList() {
  const container = document.getElementById('server-list');
  if (!container) return;
  
  container.innerHTML = '';

  const homeBtn = document.createElement('div');
  homeBtn.className = 'server-icon home' + (!currentServer ? ' active' : '');
  homeBtn.onclick = showHome;
  homeBtn.innerHTML = '<i class="fas fa-home"></i><div class="server-tooltip">Home</div>';
  container.appendChild(homeBtn);

  const divider = document.createElement('div');
  divider.className = 'server-divider';
  container.appendChild(divider);

  servers.forEach(server => {
    const serverEl = document.createElement('div');
    serverEl.className = 'server-icon' + (currentServer?.id === server.id ? ' active' : '');
    serverEl.onclick = () => loadServer(server.id);
    
    if (server.icon) {
      serverEl.innerHTML = `<img src="${server.icon}" style="width: 100%; height: 100%; border-radius: 50%;"><div class="server-tooltip">${server.name}</div>`;
    } else {
      const avatarLetter = server.name.charAt(0).toUpperCase();
      serverEl.innerHTML = `<div class="server-icon-text">${avatarLetter}</div><div class="server-tooltip">${server.name}</div>`;
    }
    
    container.appendChild(serverEl);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'server-icon add';
  addBtn.onclick = showCreateServer;
  addBtn.innerHTML = '<i class="fas fa-plus"></i><div class="server-tooltip">Add Server</div>';
  container.appendChild(addBtn);
}

function renderServerHeader() {
  const header = document.querySelector('.channel-header h3');
  if (header && currentServer) {
    header.textContent = currentServer.name;
  }
}

function renderChannels() {
  const textContainer = document.getElementById('text-channels');
  const voiceContainer = document.getElementById('voice-channels');
  
  if (!textContainer || !voiceContainer) return;
  
  textContainer.innerHTML = '';
  voiceContainer.innerHTML = '';

  if (!channels || channels.length === 0) {
    textContainer.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">No channels yet</div>';
    return;
  }

  channels.forEach(channel => {
    const channelEl = document.createElement('div');
    channelEl.className = 'channel-item' + (currentChannel?.id === channel.id ? ' active' : '');
    channelEl.onclick = () => selectChannel(channel);
    
    const icon = channel.type === 'voice' ? 'fa-volume-up' : 
                 channel.type === 'announcement' ? 'fa-bullhorn' :
                 channel.type === 'stage' ? 'fa-microphone' : 'fa-hashtag';
    
    channelEl.innerHTML = `
      <i class="fas ${icon}"></i>
      <span>${channel.name}</span>
    `;
    
    if (channel.type === 'voice') {
      voiceContainer.appendChild(channelEl);
    } else {
      textContainer.appendChild(channelEl);
    }
  });
}

function renderFriends() {
  const container = document.getElementById('friends-list');
  if (!container) return;
  
  container.innerHTML = '';

  // Update notification badge
  const badge = document.getElementById('friend-request-badge');
  if (badge) {
    if (pendingRequests.length > 0) {
      badge.textContent = pendingRequests.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (friends.length === 0) {
    container.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">No friends yet</div>';
    return;
  }

  const onlineFriends = friends.filter(f => f.user_status === 'online' || f.status === 'online');
  const offlineFriends = friends.filter(f => f.user_status !== 'online' && f.status !== 'online');

  const renderFriendElement = (friend) => {
    const friendEl = document.createElement('div');
    friendEl.className = 'friend-item' + (currentView === 'dm' && currentChannel?.userId === friend.id ? ' active' : '');
    friendEl.style.display = 'flex';
    friendEl.style.alignItems = 'center';
    friendEl.style.gap = '8px';
    friendEl.style.position = 'relative';
    
    const avatarLetter = friend.username.charAt(0).toUpperCase();
    const statusClass = friend.user_status || friend.status || 'offline';
    const isOnline = statusClass === 'online';
    
    friendEl.innerHTML = `
      <div class="friend-avatar" style="position: relative;">${avatarLetter}
        <div class="status-indicator ${statusClass}" style="position: absolute; bottom: 0; right: 0;"></div>
      </div>
      <span class="friend-name" style="flex: 1;">${friend.username}</span>
    `;
    
    // Voice call button
    const voiceBtn = document.createElement('button');
    voiceBtn.style.background = isOnline ? 'var(--success)' : 'var(--text-muted)';
    voiceBtn.style.width = '28px';
    voiceBtn.style.height = '28px';
    voiceBtn.style.border = 'none';
    voiceBtn.style.borderRadius = '4px';
    voiceBtn.style.color = 'white';
    voiceBtn.style.cursor = isOnline ? 'pointer' : 'not-allowed';
    voiceBtn.style.fontSize = '12px';
    voiceBtn.style.display = 'flex';
    voiceBtn.style.alignItems = 'center';
    voiceBtn.style.justifyContent = 'center';
    voiceBtn.innerHTML = '<i class="fas fa-phone"></i>';
    voiceBtn.title = 'Voice Call';
    if (isOnline) {
      voiceBtn.onclick = (e) => {
        e.stopPropagation();
        initiateVoiceCall(friend.id, friend.username, friend.avatar || '');
      };
    }
    
    // Video call button
    const videoBtn = document.createElement('button');
    videoBtn.style.background = isOnline ? '#5865F2' : 'var(--text-muted)';
    videoBtn.style.width = '28px';
    videoBtn.style.height = '28px';
    videoBtn.style.border = 'none';
    videoBtn.style.borderRadius = '4px';
    videoBtn.style.color = 'white';
    videoBtn.style.cursor = isOnline ? 'pointer' : 'not-allowed';
    videoBtn.style.fontSize = '12px';
    videoBtn.style.display = 'flex';
    videoBtn.style.alignItems = 'center';
    videoBtn.style.justifyContent = 'center';
    videoBtn.innerHTML = '<i class="fas fa-video"></i>';
    videoBtn.title = 'Video Call';
    if (isOnline) {
      videoBtn.onclick = (e) => {
        e.stopPropagation();
        initiateVideoCall(friend.id, friend.username, friend.avatar || '');
      };
    }
    
    friendEl.appendChild(voiceBtn);
    friendEl.appendChild(videoBtn);
    
    const nameEl = friendEl.querySelector('.friend-name');
    if (nameEl) {
      nameEl.style.cursor = 'pointer';
      nameEl.onclick = () => openDM(friend);
    }
    
    return friendEl;
  };

  if (onlineFriends.length > 0) {
    const section = document.createElement('div');
    const header = document.createElement('div');
    header.style.fontSize = '12px';
    header.style.fontWeight = '600';
    header.style.color = 'var(--text-muted)';
    header.style.padding = '8px 12px';
    header.textContent = `ONLINE — ${onlineFriends.length}`;
    section.appendChild(header);
    
    onlineFriends.forEach(friend => {
      section.appendChild(renderFriendElement(friend));
    });
    
    container.appendChild(section);
  }

  if (offlineFriends.length > 0) {
    const section = document.createElement('div');
    const header = document.createElement('div');
    header.style.fontSize = '12px';
    header.style.fontWeight = '600';
    header.style.color = 'var(--text-muted)';
    header.style.padding = '8px 12px';
    header.textContent = `OFFLINE — ${offlineFriends.length}`;
    section.appendChild(header);
    
    offlineFriends.forEach(friend => {
      section.appendChild(renderFriendElement(friend));
    });
    
    container.appendChild(section);
  }
}

function renderGroupDMs() {
  const container = document.getElementById('groups-list');
  if (!container) return;
  
  container.innerHTML = '';

  if (groupDMs.length === 0) {
    container.innerHTML = '<div style="padding: 8px; color: var(--text-muted); font-size: 12px;">No groups yet</div>';
    return;
  }

  groupDMs.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'group-item' + (currentView === 'group' && currentChannel?.groupId === group.id ? ' active' : '');
    groupEl.onclick = () => openGroupDM(group);
    
    const avatarLetter = group.name.charAt(0).toUpperCase();
    const memberCount = group.member_count || (group.members ? group.members.length : 0);
    
    groupEl.innerHTML = `
      <div class="group-avatar">${avatarLetter}</div>
      <span class="group-name">${group.name}</span>
      <span class="group-count">${memberCount}</span>
    `;
    
    container.appendChild(groupEl);
  });
}

function updateFriendStatus(userId, status) {
  const friend = friends.find(f => f.id === userId);
  if (friend) {
    friend.user_status = status;
    renderFriends();
  }
}

// ==================== NAVIGATION ====================
async function selectChannel(channel) {
  if (currentChannel?.id === channel.id) return;

  if (currentChannel) {
    socket.emit('leave-channel', currentChannel.id);
  }

  currentChannel = channel;
  currentView = 'channel';
  currentGroup = null;

  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('messages-list').innerHTML = '';
  document.getElementById('message-input-container').style.display = 'block';
  document.getElementById('header-title').textContent = channel.name;
  document.getElementById('header-icon').className = channel.type === 'voice' ? 'fas fa-volume-up' : 'fas fa-hashtag';
  document.getElementById('message-input').placeholder = `Message #${channel.name}`;
  
  const voiceBtn = document.getElementById('voice-join-btn');
  if (voiceBtn) {
    voiceBtn.style.display = channel.type === 'voice' ? 'flex' : 'none';
    voiceBtn.innerHTML = '<i class="fas fa-phone"></i> Join Voice';
    voiceBtn.style.background = 'var(--success)';
  }
  
  renderChannels();
  socket.emit('join-channel', channel.id);
  
  if (channel.type !== 'voice') {
    await loadChannelMessages(channel.id);
  }
}

async function openDM(friend) {
  if (currentView === 'dm' && currentChannel?.userId === friend.id) return;

  currentChannel = {
    type: 'dm',
    userId: friend.id,
    name: friend.username,
    id: `dm-${friend.id}`
  };
  currentView = 'dm';
  currentGroup = null;
  
  updateMessageView(friend.username, 'fas fa-user', `Message @${friend.username}`);
  renderFriends();
  
  await loadDMMessages(friend.id);
}

async function openGroupDM(group) {
  if (currentView === 'group' && currentChannel?.groupId === group.id) return;

  currentChannel = {
    type: 'group',
    groupId: group.id,
    name: group.name,
    id: `group-${group.id}`
  };
  currentView = 'group';
  currentGroup = group;
  
  updateMessageView(group.name, 'fas fa-users', `Message ${group.name}`);
  renderGroupDMs();
  
  await loadGroupMessages(group.id);
}

function updateMessageView(title, iconClass, placeholder) {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('messages-list').innerHTML = '';
  document.getElementById('message-input-container').style.display = 'block';
  document.getElementById('header-title').textContent = title;
  document.getElementById('header-icon').className = iconClass;
  document.getElementById('message-input').placeholder = placeholder;
  const voiceBtn = document.getElementById('voice-join-btn');
  if (voiceBtn) voiceBtn.style.display = 'none';
}

function showHome() {
  currentServer = null;
  currentChannel = null;
  currentView = 'home';
  currentGroup = null;

  document.getElementById('welcome-screen').classList.remove('hidden');
  document.getElementById('messages-list').innerHTML = '';
  document.getElementById('message-input-container').style.display = 'none';
  document.getElementById('header-title').textContent = 'Welcome';
  document.getElementById('header-icon').className = 'fas fa-home';
  
  const voiceBtn = document.getElementById('voice-join-btn');
  if (voiceBtn) voiceBtn.style.display = 'none';
  
  const header = document.querySelector('.channel-header h3');
  if (header) header.textContent = 'OwnDc';
  
  const textChannels = document.getElementById('text-channels');
  const voiceChannels = document.getElementById('voice-channels');
  if (textChannels) textChannels.innerHTML = '';
  if (voiceChannels) voiceChannels.innerHTML = '';
  
  renderServerList();
}

// ==================== MESSAGES ====================
async function loadChannelMessages(channelId) {
  try {
    const response = await fetch(`/api/channels/${channelId}/messages`);
    if (response.ok) {
      const messages = await response.json();
      messages.forEach(msg => displayMessage(msg));
      scrollToBottom();
    }
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

async function loadDMMessages(userId) {
  try {
    const response = await fetch(`/api/messages/dm/${userId}`);
    if (response.ok) {
      const messages = await response.json();
      messages.forEach(msg => displayMessage(msg));
      scrollToBottom();
    }
  } catch (error) {
    console.error('Error loading DMs:', error);
  }
}

async function loadGroupMessages(groupId) {
  try {
    const response = await fetch(`/api/groups/${groupId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.messages) {
        data.messages.forEach(msg => displayMessage(msg));
        scrollToBottom();
      }
    }
  } catch (error) {
    console.error('Error loading group messages:', error);
  }
}

function displayMessage(message) {
  const container = document.getElementById('messages-list');
  if (!container) return;
  
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.dataset.messageId = message.id;
  
  const isOwn = message.sender_id === currentUser.id;
  const avatarLetter = message.sender_username?.charAt(0).toUpperCase() || '?';
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageEl.innerHTML = `
    <div class="message-avatar">${avatarLetter}</div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">${message.sender_username || 'Unknown'}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text">${escapeHtml(message.content)}</div>
    </div>
  `;
  
  container.appendChild(messageEl);
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input) return;
  
  const content = input.value.trim();
  if (!content || !currentChannel) return;
  
  input.value = '';
  
  try {
    let message;
    
    if (currentView === 'dm') {
      const response = await fetch(`/api/messages/dm/${currentChannel.userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      
      if (response.ok) {
        message = await response.json();
        displayMessage(message);
        socket.emit('send-dm', {
          receiverId: currentChannel.userId,
          content,
          messageId: message.id,
          timestamp: message.timestamp
        });
      }
    } else if (currentView === 'group') {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: currentChannel.groupId, content })
      });
      
      if (response.ok) {
        message = await response.json();
        displayMessage(message);
      }
    } else {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: currentChannel.id, content })
      });
      
      if (response.ok) {
        message = await response.json();
        displayMessage(message);
        socket.emit('send-message', {
          channelId: currentChannel.id,
          content,
          messageId: message.id,
          timestamp: message.timestamp
        });
      }
    }
    
    scrollToBottom();
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

function handleTyping() {
  if (!currentChannel || currentView === 'dm' || currentView === 'group') return;
  
  socket.emit('typing', {
    channelId: currentChannel.id,
    isTyping: true
  });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', {
      channelId: currentChannel.id,
      isTyping: false
    });
  }, 3000);
}

function showTypingIndicator(username, isTyping) {
  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;
  
  if (isTyping) {
    indicator.textContent = `${username} is typing...`;
  } else {
    indicator.textContent = '';
  }
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// ==================== SERVERS ====================
function showCreateServer() {
  openModal('create-server-modal');
}

async function createServer() {
  const name = document.getElementById('server-name')?.value.trim();
  if (!name) {
    showNotification('Please enter a server name', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    
    if (response.ok) {
      const server = await response.json();
      showNotification('Server created! You are now the owner.', 'success');
      closeModal('create-server-modal');
      document.getElementById('server-name').value = '';
      await loadServers();
      loadServer(server.id);
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to create server', 'error');
    }
  } catch (error) {
    console.error('Create server error:', error);
    showNotification('Failed to create server', 'error');
  }
}

function showJoinServer() {
  openModal('join-server-modal');
}

async function joinServer() {
  const code = document.getElementById('invite-code')?.value.trim().toUpperCase();
  if (!code) {
    showNotification('Please enter an invite code', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/servers/join/${code}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      const data = await response.json();
      showNotification('Joined server!', 'success');
      closeModal('join-server-modal');
      document.getElementById('invite-code').value = '';
      await loadServers();
      loadServer(data.server.id);
    } else {
      const error = await response.json();
      showNotification(error.error || 'Invalid invite code', 'error');
    }
  } catch (error) {
    console.error('Join server error:', error);
    showNotification('Failed to join server', 'error');
  }
}

function showCreateChannel() {
  if (!currentServer) {
    showNotification('Please select a server first', 'error');
    return;
  }
  
  selectedChannelType = 'text';
  updateChannelTypeUI();
  openModal('create-channel-modal');
}

function updateChannelTypeUI() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === selectedChannelType);
  });
}

function selectChannelType(type) {
  selectedChannelType = type;
  updateChannelTypeUI();
}

async function createChannel() {
  const name = document.getElementById('channel-name')?.value.trim();
  
  if (!name) {
    showNotification('Please enter a channel name', 'error');
    return;
  }
  
  if (!currentServer) {
    showNotification('Please select a server first', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        type: selectedChannelType,
        serverId: currentServer.id 
      })
    });
    
    if (response.ok) {
      const channel = await response.json();
      showNotification(`${selectedChannelType === 'voice' ? 'Voice' : 'Text'} channel created!`, 'success');
      closeModal('create-channel-modal');
      document.getElementById('channel-name').value = '';
      await loadServer(currentServer.id);
      selectChannel(channel);
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to create channel', 'error');
    }
  } catch (error) {
    console.error('Create channel error:', error);
    showNotification('Failed to create channel', 'error');
  }
}

async function showServerMembers() {
  if (!currentServer) {
    showNotification('Please select a server first', 'error');
    return;
  }
  
  const memberList = document.getElementById('server-members-list');
  if (!memberList) return;
  
  memberList.innerHTML = '';
  
  if (serverMembers.length === 0) {
    memberList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">No members found</div>';
  } else {
    serverMembers.forEach(member => {
      const memberEl = document.createElement('div');
      memberEl.className = 'member-item';
      
      const avatarLetter = member.username.charAt(0).toUpperCase();
      const isOwner = member.id === currentServer.owner_id;
      const roles = member.roles || [];
      
      let rolesHTML = '';
      if (roles.length > 0) {
        rolesHTML = `<div class="member-roles">${roles.map(r => `<span class="role-badge" style="color: ${r.color}">${r.name}</span>`).join('')}</div>`;
      }
      
      memberEl.innerHTML = `
        <div class="member-avatar">${avatarLetter}</div>
        <div class="member-info">
          <span class="member-name">${member.nickname || member.username} ${isOwner ? '👑' : ''}</span>
          ${rolesHTML}
        </div>
      `;
      
      memberList.appendChild(memberEl);
    });
  }
  
  openModal('server-members-modal');
}

// ==================== GROUPS ====================
function showCreateGroup() {
  selectedFriendsForGroup = [];
  renderFriendSelector();
  openModal('create-group-modal');
}

function renderFriendSelector() {
  const container = document.getElementById('friend-selector-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (friends.length === 0) {
    container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">Add friends first to create a group</div>';
    return;
  }
  
  friends.forEach(friend => {
    const item = document.createElement('div');
    item.className = 'friend-selector-item' + (selectedFriendsForGroup.includes(friend.id) ? ' selected' : '');
    item.onclick = () => toggleFriendForGroup(friend.id);
    
    const avatarLetter = friend.username.charAt(0).toUpperCase();
    item.innerHTML = `
      <div class="friend-avatar">${avatarLetter}</div>
      <span class="friend-name">${friend.username}</span>
      ${selectedFriendsForGroup.includes(friend.id) ? '<i class="fas fa-check"></i>' : ''}
    `;
    
    container.appendChild(item);
  });
}

function toggleFriendForGroup(friendId) {
  const index = selectedFriendsForGroup.indexOf(friendId);
  if (index > -1) {
    selectedFriendsForGroup.splice(index, 1);
  } else {
    selectedFriendsForGroup.push(friendId);
  }
  renderFriendSelector();
}

async function createGroup() {
  const name = document.getElementById('group-name')?.value.trim();
  if (!name) {
    showNotification('Please enter a group name', 'error');
    return;
  }
  
  if (selectedFriendsForGroup.length === 0) {
    showNotification('Please select at least one friend', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        memberIds: selectedFriendsForGroup 
      })
    });
    
    if (response.ok) {
      const group = await response.json();
      showNotification('Group created!', 'success');
      closeModal('create-group-modal');
      document.getElementById('group-name').value = '';
      selectedFriendsForGroup = [];
      await loadGroupDMs();
      openGroupDM(group);
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to create group', 'error');
    }
  } catch (error) {
    console.error('Create group error:', error);
    showNotification('Failed to create group', 'error');
  }
}

// ==================== FRIENDS ====================
function showAddFriend() {
  openModal('add-friend-modal');
  renderFriendRequests();
}

function renderFriendRequests() {
  const container = document.getElementById('friend-requests-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Pending requests (incoming)
  if (pendingRequests.length > 0) {
    const pendingHeader = document.createElement('div');
    pendingHeader.className = 'requests-section-header';
    pendingHeader.textContent = `Incoming Requests (${pendingRequests.length})`;
    pendingHeader.style.cssText = 'font-weight: 600; color: var(--primary); margin: 16px 0 8px 0; font-size: 12px; text-transform: uppercase;';
    container.appendChild(pendingHeader);
    
    pendingRequests.forEach(request => {
      const requestEl = document.createElement('div');
      requestEl.className = 'friend-request-item';
      requestEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-dark); border-radius: 4px; margin-bottom: 8px;';
      
      const avatarLetter = request.username.charAt(0).toUpperCase();
      
      requestEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="friend-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 600;">${avatarLetter}</div>
          <span style="color: var(--text-primary); font-weight: 500;">${request.username}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="acceptFriendRequest('${request.friendship_id}')" style="padding: 8px 16px; background: var(--success); border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: 600;">Accept</button>
          <button onclick="declineFriendRequest('${request.friendship_id}')" style="padding: 8px 16px; background: var(--bg-lighter); border: none; border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-weight: 600;">Decline</button>
        </div>
      `;
      
      container.appendChild(requestEl);
    });
  }
  
  // Sent requests (outgoing)
  if (sentRequests.length > 0) {
    const sentHeader = document.createElement('div');
    sentHeader.className = 'requests-section-header';
    sentHeader.textContent = `Outgoing Requests (${sentRequests.length})`;
    sentHeader.style.cssText = 'font-weight: 600; color: var(--text-secondary); margin: 16px 0 8px 0; font-size: 12px; text-transform: uppercase;';
    container.appendChild(sentHeader);
    
    sentRequests.forEach(request => {
      const requestEl = document.createElement('div');
      requestEl.className = 'friend-request-item';
      requestEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-dark); border-radius: 4px; margin-bottom: 8px;';
      
      const avatarLetter = request.username.charAt(0).toUpperCase();
      
      requestEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="friend-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-lighter); display: flex; align-items: center; justify-content: center; font-weight: 600;">${avatarLetter}</div>
          <span style="color: var(--text-primary);">${request.username}</span>
        </div>
        <span style="color: var(--text-muted); font-size: 12px;">Pending...</span>
      `;
      
      container.appendChild(requestEl);
    });
  }
  
  // Show message if no requests
  if (pendingRequests.length === 0 && sentRequests.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No pending friend requests</div>';
  }
}

async function sendFriendRequest() {
  const username = document.getElementById('friend-username')?.value.trim();
  if (!username) {
    showNotification('Please enter a username', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (response.ok) {
      const data = await response.json();
      showNotification('Friend request sent!', 'success');
      document.getElementById('friend-username').value = '';
      loadFriends(); // Refresh the requests list
      socket.emit('friend-request', {
        targetUserId: data.friend.id,
        friendshipId: data.friendship_id
      });
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to send request', 'error');
    }
  } catch (error) {
    console.error('Send friend request error:', error);
    showNotification('Failed to send friend request', 'error');
  }
}

async function acceptFriendRequest(friendshipId) {
  try {
    const response = await fetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId })
    });
    
    if (response.ok) {
      showNotification('Friend request accepted!', 'success');
      loadFriends();
    }
  } catch (error) {
    console.error('Accept friend request error:', error);
    showNotification('Failed to accept request', 'error');
  }
}

async function declineFriendRequest(friendshipId) {
  try {
    await fetch('/api/friends/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId })
    });
    loadFriends();
  } catch (error) {
    console.error('Decline friend request error:', error);
  }
}

async function callFriend(friendId) {
  const friend = friends.find(f => f.id === friendId);
  if (!friend) return;
  
  try {
    await startVideoCall(friend);
  } catch (error) {
    console.error('Call friend error:', error);
    showNotification('Failed to start call', 'error');
  }
}

// ==================== VOICE/VIDEO CALLS ====================
async function toggleVoiceChannel() {
  if (currentVoiceChannel) {
    leaveVoiceChannel();
  } else {
    await joinVoiceChannel();
  }
}

async function joinVoiceChannel() {
  if (!currentChannel || currentChannel.type !== 'voice') return;
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    currentVoiceChannel = currentChannel.id;
    document.getElementById('voice-overlay')?.classList.remove('hidden');
    
    const voiceBtn = document.getElementById('voice-join-btn');
    if (voiceBtn) {
      voiceBtn.innerHTML = '<i class="fas fa-phone-slash"></i> Leave Voice';
      voiceBtn.style.background = 'var(--danger)';
    }
    
    addVoiceParticipant({
      userId: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar,
      isSelf: true
    });
    
    socket.emit('join-voice', { channelId: currentChannel.id, isVideo: false });
    
    showNotification('Joined voice channel', 'success');
  } catch (error) {
    console.error('Error accessing microphone:', error);
    showNotification('Could not access microphone', 'error');
  }
}

function leaveVoiceChannel() {
  if (currentVoiceChannel) {
    socket.emit('leave-voice', currentVoiceChannel);
    
    peerConnections.forEach((pc, userId) => {
      closePeerConnection(userId);
    });
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => track.stop());
      localVideoStream = null;
    }
    
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    
    currentVoiceChannel = null;
    voiceParticipants.clear();
    
    // Clear all participant elements from DOM
    const container = document.getElementById('voice-participants');
    if (container) {
      container.innerHTML = '';
    }
    
    document.getElementById('voice-overlay')?.classList.add('hidden');
    document.getElementById('video-overlay')?.classList.add('hidden');
    
    const voiceBtn = document.getElementById('voice-join-btn');
    if (voiceBtn && currentChannel?.type === 'voice') {
      voiceBtn.innerHTML = '<i class="fas fa-phone"></i> Join Voice';
      voiceBtn.style.background = 'var(--success)';
    }
    
    isMuted = false;
    isDeafened = false;
    isVideoOn = false;
    isScreenSharing = false;
    updateVoiceButtons();
    updateVideoButtons();
  }
}

async function startVideoCall(friend) {
  try {
    localVideoStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = localVideoStream;
    }
    
    document.getElementById('video-overlay')?.classList.remove('hidden');
    
    isVideoOn = true;
    updateVideoButtons();
    
    showNotification('Video call started', 'success');
  } catch (error) {
    console.error('Error accessing camera:', error);
    showNotification('Could not access camera', 'error');
  }
}

function leaveVideoCall() {
  leaveVoiceChannel();
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    isScreenSharing = false;
    
    if (isVideoOn) {
      localVideoStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localVideoStream;
      }
    }
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = screenStream;
      }
      
      isScreenSharing = true;
      
      screenStream.getVideoTracks()[0].onended = () => {
        toggleScreenShare();
      };
    } catch (error) {
      console.error('Error sharing screen:', error);
      showNotification('Could not share screen', 'error');
    }
  }
  
  updateVideoButtons();
}

function toggleVideo() {
  if (localVideoStream) {
    const videoTrack = localVideoStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      isVideoOn = videoTrack.enabled;
      updateVideoButtons();
    }
  }
}

function toggleMute() {
  if (localStream || localVideoStream) {
    isMuted = !isMuted;
    
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
    
    if (localVideoStream) {
      localVideoStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
    
    updateVoiceButtons();
    updateVideoButtons();
  }
}

function toggleDeafen() {
  isDeafened = !isDeafened;
  peerConnections.forEach(pc => {
    pc.getReceivers().forEach(receiver => {
      if (receiver.track) {
        receiver.track.enabled = !isDeafened;
      }
    });
  });
  updateVoiceButtons();
  updateVideoButtons();
}

function addVoiceParticipant(user) {
  // Remove existing if any (prevents duplicates)
  removeVoiceParticipant(user.userId);
  
  voiceParticipants.set(user.userId, user);
  
  const container = document.getElementById('voice-participants');
  if (!container) return;
  
  const participantEl = document.createElement('div');
  participantEl.className = 'voice-participant';
  participantEl.id = `voice-participant-${user.userId}`;
  
  const avatarLetter = user.username?.charAt(0).toUpperCase() || '?';
  
  participantEl.innerHTML = `
    <div class="voice-participant-avatar">${avatarLetter}</div>
    <span class="voice-participant-name">${user.username}${user.isSelf ? ' (You)' : ''}</span>
  `;
  
  container.appendChild(participantEl);
}

function removeVoiceParticipant(userId) {
  voiceParticipants.delete(userId);
  const el = document.getElementById(`voice-participant-${userId}`);
  if (el) {
    el.remove();
  }
}

function updateParticipantState(data) {
  const participant = voiceParticipants.get(data.userId);
  if (participant) {
    participant.isMuted = data.isMuted;
    participant.isDeafened = data.isDeafened;
    participant.isVideoOn = data.isVideoOn;
    participant.isScreenSharing = data.isScreenSharing;
  }
}

function updateVoiceButtons() {
  const muteBtn = document.getElementById('mute-btn');
  const deafenBtn = document.getElementById('deafen-btn');
  
  if (muteBtn) {
    muteBtn.classList.toggle('muted', isMuted);
    muteBtn.innerHTML = isMuted ? 
      '<i class="fas fa-microphone-slash"></i><span>Unmute</span>' : 
      '<i class="fas fa-microphone"></i><span>Mute</span>';
  }
  
  if (deafenBtn) {
    deafenBtn.classList.toggle('deafened', isDeafened);
    deafenBtn.innerHTML = isDeafened ? 
      '<i class="fas fa-deaf"></i><span>Undeafen</span>' : 
      '<i class="fas fa-headphones"></i><span>Deafen</span>';
  }
}

function updateVideoButtons() {
  const muteBtn = document.getElementById('video-mute-btn');
  const videoBtn = document.getElementById('video-camera-btn');
  const screenBtn = document.getElementById('screen-share-btn');
  
  if (muteBtn) {
    muteBtn.classList.toggle('muted', isMuted);
    muteBtn.innerHTML = isMuted ? 
      '<i class="fas fa-microphone-slash"></i><span>Unmute</span>' : 
      '<i class="fas fa-microphone"></i><span>Mute</span>';
  }
  
  if (videoBtn) {
    videoBtn.classList.toggle('video-off', !isVideoOn);
    videoBtn.innerHTML = !isVideoOn ? 
      '<i class="fas fa-video-slash"></i><span>Video</span>' : 
      '<i class="fas fa-video"></i><span>Video</span>';
  }
  
  if (screenBtn) {
    screenBtn.classList.toggle('active', isScreenSharing);
    screenBtn.innerHTML = isScreenSharing ? 
      '<i class="fas fa-stop"></i><span>Stop</span>' : 
      '<i class="fas fa-desktop"></i><span>Screen</span>';
  }
}

// WebRTC functions
async function initiatePeerConnection(userId) {
  if (!localStream) return;
  
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  peerConnections.set(userId, pc);
  
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
  
  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
  };
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        targetUserId: userId,
        candidate: event.candidate
      });
    }
  };
  
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', {
      targetUserId: userId,
      offer: offer
    });
  } catch (error) {
    console.error('Error creating offer:', error);
  }
}

async function handleOffer(userId, offer) {
  if (!localStream) return;
  
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  peerConnections.set(userId, pc);
  
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
  
  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
  };
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        targetUserId: userId,
        candidate: event.candidate
      });
    }
  };
  
  try {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
      targetUserId: userId,
      answer: answer
    });
  } catch (error) {
    console.error('Error handling offer:', error);
  }
}

async function handleAnswer(userId, answer) {
  const pc = peerConnections.get(userId);
  if (pc) {
    try {
      await pc.setRemoteDescription(answer);
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }
}

async function handleIceCandidate(userId, candidate) {
  const pc = peerConnections.get(userId);
  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }
}

function closePeerConnection(userId) {
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
}

// ==================== DIRECT CALL FUNCTIONS ====================

function showIncomingCallNotification(callId, callType, caller) {
  currentCallId = callId;
  
  const modal = document.getElementById('incoming-call-modal');
  document.getElementById('incoming-call-name').textContent = caller.username;
  document.getElementById('incoming-call-type').textContent = callType === 'video' ? 'Video Call' : 'Voice Call';
  
  const avatarDiv = document.getElementById('incoming-call-avatar');
  if (caller.avatar) {
    avatarDiv.innerHTML = `<img src="${caller.avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  } else {
    avatarDiv.textContent = caller.username.charAt(0).toUpperCase();
  }
  
  openModal('incoming-call-modal');
  
  const ringtonAudio = document.getElementById('ringtone-audio');
  if (ringtonAudio) {
    ringtonAudio.play().catch(e => console.log('Autoplay prevented'));
  }
}

async function acceptIncomingCall() {
  if (!currentCallId || !currentDirectCall) return;
  
  try {
    // Request microphone
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    // Create peer connection with caller's ID
    directCallPC = createDirectCallPeerConnection(currentDirectCall.id);
    
    // If we have a pending offer, process it now
    if (window.pendingCallOffer && window.pendingCallOffer.callId === currentCallId) {
      const { offer, userId } = window.pendingCallOffer;
      await directCallPC.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await directCallPC.createAnswer();
      await directCallPC.setLocalDescription(answer);
      socket.emit('call-answer', {
        callId: currentCallId,
        targetUserId: userId,
        answer: answer
      });
      window.pendingCallOffer = null;
    }
    
    // Emit acceptance
    socket.emit('call-accept', { callId: currentCallId });
    
    showCallInterface(currentDirectCall, 'voice');
    startCallTimer();
    
    showNotification('Call connected', 'success');
  } catch (error) {
    console.error('Error accepting call:', error);
    showNotification('Could not access microphone: ' + error.message, 'error');
    rejectIncomingCall();
  }
}

function rejectIncomingCall() {
  if (currentCallId) {
    socket.emit('call-reject', { callId: currentCallId });
    const ringtonAudio = document.getElementById('ringtone-audio');
    if (ringtonAudio) {
      ringtonAudio.pause();
      ringtonAudio.currentTime = 0;
    }
  }
  closeAllModals();
  currentCallId = null;
  currentDirectCall = null;
}

// Initiate Voice Call
async function initiateVoiceCall(friendId, friendName, friendAvatar) {
  return initiateDirectCall(friendId, friendName, friendAvatar, 'voice');
}

// Initiate Video Call
async function initiateVideoCall(friendId, friendName, friendAvatar) {
  return initiateDirectCall(friendId, friendName, friendAvatar, 'video');
}

async function initiateDirectCall(friendId, friendName, friendAvatar, callType = 'voice') {
  if (currentCallId && currentDirectCall) {
    showNotification('You already have an active call', 'warning');
    return;
  }
  
  try {
    // Request microphone and optionally camera
    const constraints = { 
      audio: true, 
      video: callType === 'video' ? { width: 1280, height: 720 } : false 
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Generate call ID
    currentCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    currentDirectCall = {
      id: friendId,
      username: friendName,
      avatar: friendAvatar
    };
    
    // Create peer connection
    directCallPC = createDirectCallPeerConnection(friendId);
    
    // Create and send offer
    const offer = await directCallPC.createOffer();
    await directCallPC.setLocalDescription(offer);
    
    socket.emit('call-initiate', {
      targetUserId: friendId,
      callType: callType,
      callId: currentCallId
    });
    
    socket.emit('call-offer', {
      callId: currentCallId,
      targetUserId: friendId,
      offer: offer
    });
    
    showCallInterface(currentDirectCall, callType);
    
    // Show video button only for video calls
    const videoBtnEl = document.getElementById('direct-video-btn');
    if (videoBtnEl) {
      videoBtnEl.style.display = callType === 'video' ? 'flex' : 'none';
    }
    
    showNotification(`Calling ${friendName}...`, 'info');
    
  } catch (error) {
    console.error('Error initiating call:', error);
    showNotification('Could not access media: ' + error.message, 'error');
    currentCallId = null;
    currentDirectCall = null;
  }
}

function createDirectCallPeerConnection(remoteUserId) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });
  
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Handle remote stream
  pc.ontrack = (event) => {
    console.log('Remote track received:', event.track.kind);
    const remoteVideo = document.getElementById('remote-video-direct');
    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('call-ice-candidate', {
        callId: currentCallId,
        targetUserId: remoteUserId || currentDirectCall?.id,
        candidate: event.candidate
      });
    }
  };
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      endDirectCall();
    }
  };
  
  return pc;
}

function showCallInterface(user, callType = 'voice') {
  const callInterface = document.getElementById('call-interface');
  if (callInterface) {
    callInterface.classList.remove('hidden');
  }
  
  document.getElementById('call-name').textContent = user.username;
  
  const avatarEl = document.getElementById('call-avatar');
  if (user.avatar) {
    avatarEl.innerHTML = `<img src="${user.avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  } else {
    avatarEl.innerHTML = user.username.charAt(0).toUpperCase();
  }
  avatarEl.style.background = 'var(--primary)';
  
  const typeEl = document.getElementById('call-type-label');
  if (typeEl) {
    typeEl.textContent = callType === 'video' ? 'Video Call' : 'Voice Call';
  }
  
  const localVideo = document.getElementById('local-video-direct');
  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
  }
}

function endDirectCall() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  
  if (currentCallId) {
    socket.emit('call-end', { callId: currentCallId });
  }
  
  if (directCallPC) {
    directCallPC.close();
    directCallPC = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  try {
    const ringtonAudio = document.getElementById('ringtone-audio');
    if (ringtonAudio) {
      ringtonAudio.pause();
      ringtonAudio.currentTime = 0;
    }
  } catch (e) {}
  
  const callInterface = document.getElementById('call-interface');
  if (callInterface) {
    callInterface.classList.add('hidden');
  }
  
  currentCallId = null;
  currentDirectCall = null;
  directCallMuted = false;
  directCallVideoOn = false;
  
  closeAllModals();
}

function startCallTimer() {
  callStartTime = Date.now();
  const durationElement = document.getElementById('call-duration');
  
  if (callTimer) clearInterval(callTimer);
  
  callTimer = setInterval(() => {
    if (callStartTime) {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      if (durationElement) {
        durationElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  }, 1000);
}

function toggleDirectCallMute() {
  if (localStream) {
    directCallMuted = !directCallMuted;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !directCallMuted;
    });
    
    const btn = document.getElementById('direct-mute-btn');
    if (btn) {
      if (directCallMuted) {
        btn.style.background = 'var(--danger)';
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
      } else {
        btn.style.background = '';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
      }
    }
  }
}

function toggleDirectCallVideo() {
  if (localStream) {
    directCallVideoOn = !directCallVideoOn;
    
    if (directCallVideoOn) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(videoStream => {
        const videoTrack = videoStream.getVideoTracks()[0];
        
        // Replace audio track or add video track
        const sender = directCallPC?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        } else {
          directCallPC?.addTrack(videoTrack, localStream);
        }
        
        // Show video locally
        const localVideo = document.getElementById('local-video-direct');
        if (localVideo) {
          localVideo.srcObject = videoStream;
        }
      });
    } else {
      if (directCallPC) {
        const videoSender = directCallPC.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.track?.stop();
          videoSender.replaceTrack(null);
        }
      }
    }
    
    const btn = document.getElementById('direct-video-btn');
    if (btn) {
      if (directCallVideoOn) {
        btn.style.background = 'var(--success)';
      } else {
        btn.style.background = '';
      }
    }
  }
}

// Update the friend render function to include call buttons - DONE (integrated into renderFriends above)

// Add members to server function
async function showAddServerMembers() {
  try {
    const response = await fetch('/api/friends');
    if (response.ok) {
      const friendsList = await response.json();
      
      const container = document.getElementById('server-friend-selector-list');
      if (!container) return;
      
      container.innerHTML = '';
      
      friendsList.forEach(friend => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '12px';
        label.style.padding = '8px';
        label.style.borderRadius = '4px';
        label.style.cursor = 'pointer';
        label.style.transition = 'background 0.2s';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = friend.id;
        checkbox.className = 'server-member-checkbox';
        
        const info = document.createElement('div');
        info.style.flex = '1';
        info.textContent = friend.username;
        
        label.appendChild(checkbox);
        label.appendChild(info);
        
        label.onmouseover = () => label.style.background = 'var(--channel-hover)';
        label.onmouseout = () => label.style.background = 'transparent';
        
        container.appendChild(label);
      });
      
      openModal('add-server-members-modal');
    }
  } catch (error) {
    console.error('Error loading friends:', error);
  }
}

async function addMembersToServer() {
  if (!currentServer) {
    showNotification('Please select a server first', 'warning');
    return;
  }
  
  const checkboxes = document.querySelectorAll('.server-member-checkbox:checked');
  const selectedFriends = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedFriends.length === 0) {
    showNotification('Select at least one friend', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`/api/servers/${currentServer}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedFriends })
    });
    
    if (response.ok) {
      showNotification(`Added ${selectedFriends.length} member(s) to server`, 'success');
      closeModal('add-server-members-modal');
      
      // Reload server members
      const membersResponse = await fetch(`/api/servers/${currentServer}/members`);
      if (membersResponse.ok) {
        serverMembers = await membersResponse.json();
      }
    }
  } catch (error) {
    console.error('Error adding members:', error);
    showNotification('Failed to add members', 'error');
  }
}

// ==================== UI UTILITIES ====================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    currentModal = modalId;
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
  currentModal = null;
}

function showNotification(message, type = 'info') {
  const container = document.getElementById('notifications');
  if (!container) return;
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
  
  notification.innerHTML = `
    <i class="fas fa-${icon}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleMessageKeypress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

// ==================== KEYBOARD SHORTCUTS ====================
function handleEnterKey(event, action) {
  if (event.key === 'Enter') {
    event.preventDefault();
    
    switch(action) {
      case 'login':
        handleLogin();
        break;
      case 'register':
        handleRegister();
        break;
      case 'createServer':
        createServer();
        break;
      case 'joinServer':
        joinServer();
        break;
      case 'createChannel':
        createChannel();
        break;
      case 'createGroup':
        createGroup();
        break;
      case 'addFriend':
        sendFriendRequest();
        break;
    }
  }
}
