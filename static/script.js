
  const API_BASE = 'https://meiser-vcf.onrender.com';

  let sessionId = null;
  let adminToken = null;
  let expiryTime = null;
  let expiryCheckInterval = null;

  const phoneInput = document.getElementById('contactPhone');
  const sessionTitleSpan = document.getElementById('sessionTitle');
  const contactsCountSpan = document.getElementById('contactsCount');
  const contactsListDiv = document.getElementById('contactsList');
  const expiryTimeText = document.getElementById('expiryTimeText');
  const sessionLinkContainer = document.getElementById('sessionLinkContainer');
  const sessionLinkSpan = document.getElementById('sessionLink');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const messageDiv = document.getElementById('message');
  const downloadBtn = document.getElementById('downloadVcfBtn');

  function showMessage(text, type = 'success') {
    messageDiv.textContent = text;
    messageDiv.className = type;
    setTimeout(() => {
      messageDiv.textContent = '';
      messageDiv.className = '';
    }, 5000);
  }

  function parseExpiry(expiryStr) {
    return new Date(expiryStr);
  }

  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 13);
  });

  function getSessionIdFromUrl() {
    const parts = window.location.pathname.split('/');
    return parts.length === 3 && parts[1] === 'session' ? parts[2] : null;
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(API_BASE + url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return null;
    }
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function formatDateTimeWithTZ(date) {
    return `${date.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  }

  function startExpiryCheck() {
    if (expiryCheckInterval) clearInterval(expiryCheckInterval);
    expiryCheckInterval = setInterval(() => {
      if (!expiryTime) return;
      const now = new Date();
      if (now >= expiryTime) {
        downloadBtn.disabled = false;
        downloadBtn.style.background = "linear-gradient(to right, #00aa55, #00ff88)";
        downloadBtn.style.color = "#000";
        downloadBtn.style.boxShadow = "0 0 20px rgba(0,255,136,0.7)";
        clearInterval(expiryCheckInterval);
      }
    }, 1000);
  }

  async function loadSession(sessionIdFromUrl) {
    try {
      const data = await fetchJson(`/api/session/${sessionIdFromUrl}`);
      if (!data) throw new Error('Session data missing or invalid.');

      sessionId = sessionIdFromUrl;
      adminToken = null;

      document.getElementById('createSessionSection').style.display = 'none';
      document.getElementById('sessionControl').style.display = 'block';

      sessionTitleSpan.textContent = data.name || 'Unnamed Session';
      const fullUrl = window.location.origin + `/session/${sessionId}`;
      sessionLinkSpan.textContent = fullUrl;
      sessionLinkContainer.style.display = 'flex';

      expiryTime = new Date(data.expiry);
      expiryTimeText.textContent = formatDateTimeWithTZ(expiryTime);
      startExpiryCheck();

      await fetchContacts();
      showMessage('Session loaded successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
      document.getElementById('createSessionSection').style.display = 'block';
      document.getElementById('sessionControl').style.display = 'none';
    }
  }

  document.getElementById('createSessionBtn').onclick = async () => {
    const name = document.getElementById('sessionName').value.trim();
    const hours = parseFloat(document.getElementById('sessionDuration').value); // FIX: allow decimals
    if (!name) return showMessage('Session name required', 'error');
    if (!hours || hours < 0.01) return showMessage('Duration must be at least 0.01 hour', 'error');

    try {
      const data = await fetchJson('/api/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, duration_minutes: hours * 60 }),
      });

      sessionId = data.session_id;
      adminToken = data.admin_token;

      document.getElementById('createSessionSection').style.display = 'none';
      document.getElementById('sessionControl').style.display = 'block';

      sessionTitleSpan.textContent = name;
      const fullUrl = window.location.origin + data.session_link;
      sessionLinkSpan.textContent = fullUrl;
      sessionLinkContainer.style.display = 'flex';

      expiryTime = new Date(data.expiry);
      expiryTimeText.textContent = formatDateTimeWithTZ(expiryTime);
      startExpiryCheck();

      window.history.replaceState(null, '', `/session/${sessionId}`);

      await fetchContacts();
      showMessage('Session created successfully!');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  copyLinkBtn.onclick = () => {
    if (!sessionLinkSpan.textContent) return;
    navigator.clipboard.writeText(sessionLinkSpan.textContent)
      .then(() => showMessage('Session link copied!'))
      .catch(() => showMessage('Failed to copy link', 'error'));
  };

  document.getElementById('addContactBtn').onclick = async () => {
    const name = document.getElementById('contactName').value.trim();
    let phone = phoneInput.value.trim();

    if (!name || !phone) return showMessage('Name and phone required', 'error');
    if (!/^\d{12,13}$/.test(phone)) return showMessage('Phone must be exactly 12 or 13 digits', 'error');
    phone = `+${phone}`;

    try {
      await fetchJson(`/api/session/${sessionId}/add-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });

      document.getElementById('contactName').value = '';
      phoneInput.value = '';
      showMessage('Contact added!');
      await fetchContacts();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  async function fetchContacts() {
    try {
      const data = await fetchJson(`/api/session/${sessionId}/contacts`);
      contactsCountSpan.textContent = Array.isArray(data) ? data.length : 0;
      contactsListDiv.style.display = 'none';
      contactsListDiv.innerHTML = '';
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  downloadBtn.onclick = () => {
    window.location.href = `${API_BASE}/api/session/${sessionId}/download`;
  };

  window.addEventListener('DOMContentLoaded', () => {
    const idFromUrl = getSessionIdFromUrl();
    if (idFromUrl) loadSession(idFromUrl);
  })