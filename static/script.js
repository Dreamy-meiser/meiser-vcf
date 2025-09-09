const apiBase = '';

let sessionId = null;
let adminToken = null;
let sessionExpiryTime = null;
let contacts = [];

const messageDiv = document.getElementById('message');
const sessionTitleSpan = document.getElementById('sessionTitle');
const sessionExpirySpan = document.getElementById('countdownTimer');
const contactsListDiv = document.getElementById('contactsList');
const contactsCountSpan = document.getElementById('contactsCount');
const sessionLinkEl = document.getElementById('sessionLink');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadVcfBtn');

function showMessage(text, type = 'success') {
  messageDiv.textContent = text;
  messageDiv.className = type;
  setTimeout(() => {
    messageDiv.textContent = '';
    messageDiv.className = '';
  }, 5000);
}

document.getElementById('createSessionBtn').onclick = async () => {
  const name = document.getElementById('sessionName').value.trim();
  const duration = parseInt(document.getElementById('sessionDuration').value);

  if (!name) return showMessage('Session name required', 'error');
  if (!duration || duration < 1) return showMessage('Duration must be at least 1 minute', 'error');

  try {
    const res = await fetch('/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, duration_minutes: duration }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create session');

    sessionId = data.session_id;
    adminToken = data.admin_token;
    sessionExpiryTime = new Date(data.expiry);

    document.getElementById('createSessionSection').style.display = 'none';
    document.getElementById('sessionControl').style.display = 'block';
    sessionTitleSpan.textContent = name;

    const link = `${window.location.origin}/session/${sessionId}`;
    sessionLinkEl.href = link;
    sessionLinkEl.textContent = link;

    startCountdown();
    fetchContacts();
    showMessage('Session created successfully!');
  } catch (err) {
    showMessage(err.message, 'error');
  }
};

document.getElementById('addContactBtn').onclick = async () => {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();

  if (!name || !phone) return showMessage('Name and phone required', 'error');
  if (!/^\d{12}$/.test(phone)) return showMessage('Phone must be 12 digits (e.g. 254712345678)', 'error');

  try {
    const res = await fetch(`/session/${sessionId}/add-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add contact');

    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    showMessage('Contact added!');
    fetchContacts();
  } catch (err) {
    showMessage(err.message, 'error');
  }
};

async function fetchContacts() {
  try {
    const res = await fetch(`/session/${sessionId}/contacts`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load contacts');

    contacts = data;
    contactsCountSpan.textContent = contacts.length;
    contactsListDiv.innerHTML = '';
    contactsListDiv.style.display = 'none';

    // FIX: disable until expiry time passes
    if (sessionExpiryTime && new Date() < sessionExpiryTime) {
      downloadBtn.disabled = true;
    } else {
      downloadBtn.disabled = false;
    }
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

downloadBtn.onclick = () => {
  window.location.href = `/session/${sessionId}/download`;
};

copyBtn.onclick = () => {
  navigator.clipboard.writeText(sessionLinkEl.href).then(() => {
    showMessage('Link copied to clipboard!');
  }).catch(() => {
    showMessage('Failed to copy link', 'error');
  });
};

function startCountdown() {
  const timer = setInterval(() => {
    if (!sessionExpiryTime) return;
    const now = new Date();
    const diff = sessionExpiryTime - now;

    if (diff <= 0) {
      sessionExpirySpan.textContent = "Expired";
      downloadBtn.disabled = false; // Enable download after expiry
      clearInterval(timer);
      return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    sessionExpirySpan.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}