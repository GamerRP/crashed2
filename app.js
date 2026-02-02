// 1. IMPORT EVERYTHING NEEDED
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, query, where,
    doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// 2. CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyDsmAce5hiomq18n_yFZqozuf_tPE2phq4",
    authDomain: "rp-project-f240f.firebaseapp.com",
    databaseURL: "https://rp-project-f240f-default-rtdb.firebaseio.com",
    projectId: "rp-project-f240f",
    storageBucket: "rp-project-f240f.firebasestorage.app",
    messagingSenderId: "26467226236",
    appId: "1:26467226236:web:9f1aaead6374a4c1636ff9",
    measurementId: "G-L9VEK11ZK8"
};

// 3. INITIALIZE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global State
let currentUser = null;
let userRole = 'user'; // user, admin, owner
let userUsername = '';
let chatUnsubscribe = null;

// Specific Owners
const OWNERS = ['tallatlatif001178@gmail.com', 'aftabharis242@gmail.com'];

// --- NOTIFICATION SYSTEM ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Ensure global access
window.app = window.app || {};

// --- AUTHENTICATION ---
document.getElementById('tab-login').addEventListener('click', (e) => switchAuthTab(e.target, 'login-form', 'register-form'));
document.getElementById('tab-register').addEventListener('click', (e) => switchAuthTab(e.target, 'register-form', 'login-form'));

function switchAuthTab(btn, showId, hideId) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(showId).classList.remove('hidden');
    document.getElementById(hideId).classList.add('hidden');
}

// Register
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;

    try {
        const q = query(collection(db, "users"), where("username", "==", username));
        if (!(await getDocs(q)).empty) return showToast("Username already exists.", "error");

        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            username: username,
            email: email,
            role: 'user',
            uid: userCredential.user.uid,
            isMuted: false,
            timeoutUntil: null
        });
        showToast("Registration successful! Logging in...");
    } catch (error) { showToast(error.message, "error"); }
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const stayLoggedIn = document.getElementById('stay-logged-in').checked;

    try {
        await setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, pass);
        showToast("Logged In Successfully");
    } catch (error) { showToast("Login failed: " + error.message, "error"); }
});

window.app.logout = async () => {
    await signOut(auth);
    window.location.reload();
};

// --- MAIN APP LOGIC ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('navbar').classList.remove('hidden');
        document.getElementById('app-content').classList.remove('hidden');

        // Fetch User Data & Role
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userRole = userData.role;
            userUsername = userData.username;

            if (OWNERS.includes(user.email)) userRole = 'owner';

            if (userRole === 'admin' || userRole === 'owner') {
                document.getElementById('nav-admin').classList.remove('hidden');
            }
            if (userRole === 'owner') {
                document.getElementById('nav-owner').classList.remove('hidden');
            }
        }
        window.app.showTab('home');
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('navbar').classList.add('hidden');
        document.getElementById('app-content').classList.add('hidden');
    }
});

window.app.toggleMenu = () => {
    document.getElementById('nav-links').classList.toggle('active');
};

window.app.showTab = (tabId) => {
    document.getElementById('nav-links').classList.remove('active');
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');

    if (tabId !== 'global-chat' && chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }

    if (tabId === 'my-complaints') loadMyComplaints();
    if (tabId === 'admin-area') window.app.filterAdmin('pending');
    if (tabId === 'owner-panel') loadOwnerPanel();
    if (tabId === 'global-chat') loadChat();
};

// --- GLOBAL CHAT SYSTEM WITH MODERATION ---

let selectedMessageData = null; // Store data for context menu

async function loadChat() {
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML = '<p>Loading chat...</p>';

    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));

    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        chatContainer.innerHTML = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const msgId = docSnap.id;
            const isMine = msg.uid === currentUser.uid;
            
            // Format Time
            const time = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';

            // Role Styling
            let roleHtml = `<span class="chat-role-user">${msg.username}</span>`;
            if (msg.role === 'owner') {
                roleHtml = `<span class="chat-role-owner"><i class="fas fa-crown"></i> ${msg.username}</span>`;
            } else if (msg.role === 'admin') {
                roleHtml = `<span class="chat-role-admin">ADMIN ${msg.username}</span>`;
            }

            // Moderation Menu Button (Only for Admin/Owner and NOT on their own messages)
            let menuBtn = '';
            if ((userRole === 'admin' || userRole === 'owner') && !isMine && msg.role !== 'owner') {
                // We pass escaped strings to the function
                menuBtn = `<button class="msg-options-btn" onclick="window.app.openChatMenu('${msgId}', '${msg.uid}', '${msg.username}')"><i class="fas fa-ellipsis-v"></i></button>`;
            } else if (userRole === 'owner' && msg.role === 'admin' && !isMine) {
                 menuBtn = `<button class="msg-options-btn" onclick="window.app.openChatMenu('${msgId}', '${msg.uid}', '${msg.username}')"><i class="fas fa-ellipsis-v"></i></button>`;
            }

            const html = `
                <div class="chat-msg ${isMine ? 'mine' : ''}">
                    <div class="chat-header">
                        ${roleHtml}
                        <span class="chat-time">${time}</span>
                        ${menuBtn}
                    </div>
                    <div class="chat-text">${msg.text}</div>
                </div>
            `;
            chatContainer.insertAdjacentHTML('beforeend', html);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// Send Message Logic with Timeout Check
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();

        // Check Mute
        if (userData.isMuted) {
            return showToast("You are permanently muted.", "error");
        }

        // Check Timeout
        if (userData.timeoutUntil) {
            const timeoutDate = userData.timeoutUntil.toDate();
            const now = new Date();
            if (now < timeoutDate) {
                const remaining = Math.ceil((timeoutDate - now) / 60000);
                return showToast(`You are timed out for ${remaining} more minutes.`, "error");
            }
        }

        await addDoc(collection(db, "messages"), {
            text: text,
            uid: currentUser.uid,
            username: userUsername,
            role: userRole,
            timestamp: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        showToast("Error sending message", "error");
    }
});

// --- NEW MODERATION FUNCTIONS ---

window.app.openChatMenu = (msgId, targetUid, targetName) => {
    selectedMessageData = { msgId, targetUid, targetName };
    const menu = document.getElementById('chat-context-menu');
    menu.classList.remove('hidden');
    
    // Close menu if clicked outside
    const closeMenu = (e) => {
        if (!e.target.closest('#chat-context-menu') && !e.target.closest('.msg-options-btn')) {
            menu.classList.add('hidden');
            document.removeEventListener('click', closeMenu);
        }
    };
    // Delay slightly to prevent immediate closing
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
};

window.app.openTimeoutModal = () => {
    document.getElementById('chat-context-menu').classList.add('hidden');
    document.getElementById('timeout-modal').classList.remove('hidden');
};

window.app.handleMenuAction = async (action, duration = 0) => {
    if (!selectedMessageData) return;
    const { msgId, targetUid, targetName } = selectedMessageData;
    
    document.getElementById('chat-context-menu').classList.add('hidden');
    document.getElementById('timeout-modal').classList.add('hidden');

    try {
        if (action === 'delete') {
            if(!confirm("Delete this message?")) return;
            await deleteDoc(doc(db, "messages", msgId));
            showToast("Message deleted.");
        } 
        else if (action === 'mute') {
            if(!confirm(`Permanently mute ${targetName}?`)) return;
            await updateDoc(doc(db, "users", targetUid), { isMuted: true });
            showToast(`${targetName} has been muted.`);
        }
        else if (action === 'timeout') {
            let timestamp = null;
            if (duration > 0) {
                const date = new Date();
                date.setMinutes(date.getMinutes() + duration);
                timestamp = date; // Firestore converts JS Date to Timestamp automatically in add/set/update
            }
            await updateDoc(doc(db, "users", targetUid), { timeoutUntil: timestamp });
            
            if (duration === -1) showToast(`Timeout removed for ${targetName}.`);
            else showToast(`${targetName} timed out for ${duration} mins.`);
        }
    } catch (e) {
        showToast("Action failed: " + e.message, "error");
    }
};

// --- COMPLAINT SYSTEM ---
window.app.toggleComplaintForm = () => {
    document.getElementById('create-complaint-wrapper').classList.toggle('hidden');
};

document.getElementById('complaint-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
        await addDoc(collection(db, "complaints"), {
            userId: currentUser.uid,
            username: userUsername,
            inGameName: document.getElementById('comp-ign').value,
            against: document.getElementById('comp-against').value,
            description: document.getElementById('comp-desc').value,
            proof: document.getElementById('comp-proof').value,
            status: 'pending',
            timestamp: serverTimestamp(),
            adminReply: "",
            adminName: ""
        });
        showToast("Complaint Created Successfully");
        e.target.reset();
        window.app.toggleComplaintForm();
    } catch (error) {
        showToast("Error: " + error.message, "error");
    }
});

async function loadMyComplaints() {
    const list = document.getElementById('my-complaints-list');
    list.innerHTML = '<p>Loading...</p>';
    const q = query(collection(db, "complaints"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    if (snapshot.empty) return list.innerHTML = '<p>No complaints found.</p>';

    snapshot.forEach(doc => {
        const data = doc.data();
        const statusText = data.status === 'pending'
            ? '<span class="status-pending">Response Pending</span>'
            : `<span class="status-resolved">Resolved by ${data.adminName || 'Admin'}</span>`;
        
        const replyHtml = data.status === 'resolved'
            ? `<div class="admin-reply-box"><strong>Admin Reply:</strong><br>${data.adminReply}</div>`
            : '';

        list.innerHTML += `
            <div class="list-item">
                <h3>Against: ${data.against}</h3>
                <p><strong>Status:</strong> ${statusText}</p>
                <p><strong>Desc:</strong> ${data.description}</p>
                ${replyHtml}
            </div>
        `;
    });
}

// --- ADMIN AREA ---
window.app.filterAdmin = async (status) => {
    const list = document.getElementById('admin-complaints-list');
    list.innerHTML = '<p>Loading...</p>';
    try {
        const q = query(collection(db, "complaints"), where("status", "==", status), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        list.innerHTML = '';

        if (snapshot.empty) {
            list.innerHTML = `<p>No complaints found: ${status}</p>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A';
            let proofHtml = data.proof.startsWith('http') ? `<a href="${data.proof}" target="_blank">View Proof</a>` : data.proof;

            let actionHtml = '';
            if (status === 'pending') {
                actionHtml = `
                    <div class="reply-section" style="margin-top:10px;">
                        <textarea id="reply-text-${docSnap.id}" placeholder="Admin Decision..."></textarea>
                        <button onclick="window.app.submitReply('${docSnap.id}')" style="background:var(--success); color:black;">Submit</button>
                    </div>`;
            } else {
                actionHtml = `<div style="margin-top:10px;"><p style="color:var(--success);">Reply by ${data.adminName}: ${data.adminReply}</p></div>`;
            }

            list.innerHTML += `
                <div class="list-item">
                    <p style="font-size:0.8rem; color:#888;">${date} | By: ${data.username}</p>
                    <h3>Against: ${data.against}</h3>
                    <p>${data.description}</p>
                    <p>Proof: ${proofHtml}</p>
                    ${actionHtml}
                </div>
            `;
        });
    } catch (e) { list.innerHTML = 'Error loading. Check console.'; console.error(e); }
};

window.app.submitReply = async (docId) => {
    const replyText = document.getElementById(`reply-text-${docId}`).value;
    if (!replyText) return showToast("Reply cannot be empty", "error");
    try {
        await updateDoc(doc(db, "complaints", docId), {
            status: 'resolved',
            adminReply: replyText,
            adminName: userUsername,
            replyTimestamp: serverTimestamp()
        });
        showToast("Response sent");
        window.app.filterAdmin('pending');
    } catch (e) { showToast("Error: " + e.message, "error"); }
};

// --- OWNER PANEL ---
async function loadOwnerPanel() {
    loadAdminList();
    loadAdminStats();
}

document.getElementById('make-admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = document.getElementById('admin-target').value;
    let q = query(collection(db, "users"), where("username", "==", target));
    let snap = await getDocs(q);
    if (snap.empty) {
        q = query(collection(db, "users"), where("email", "==", target));
        snap = await getDocs(q);
    }
    if (snap.empty) return showToast("User not found", "error");

    await updateDoc(doc(db, "users", snap.docs[0].id), { role: 'admin' });
    showToast(`${snap.docs[0].data().username} is now Admin`);
    loadAdminList();
});

window.app.removeAdminAccess = async () => {
    const target = document.getElementById('revoke-target').value;
    if (!target) return;
    const q = query(collection(db, "users"), where("username", "==", target));
    const snap = await getDocs(q);
    if (snap.empty) return showToast("User not found", "error");
    await updateDoc(doc(db, "users", snap.docs[0].id), { role: 'user' });
    showToast("Access Revoked");
    loadAdminList();
};

async function loadAdminList() {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = 'Loading...';
    const q = query(collection(db, "users"), where("role", "in", ["admin", "owner"]));
    const snap = await getDocs(q);
    list.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        list.innerHTML += `<li>${u.username} (${u.email}) - <span style="color:${u.role==='owner'?'gold':'red'}">${u.role.toUpperCase()}</span></li>`;
    });
}

async function loadAdminStats() {
    const tbody = document.querySelector('#admin-stats-table tbody');
    const q = query(collection(db, "complaints"), where("status", "==", "resolved"));
    const snap = await getDocs(q);
    const stats = {};
    snap.forEach(doc => {
        const d = doc.data();
        if(d.adminName) stats[d.adminName] = (stats[d.adminName] || 0) + 1;
    });
    tbody.innerHTML = '';
    for (const [name, count] of Object.entries(stats)) {
        tbody.innerHTML += `<tr><td>${name}</td><td>${count}</td><td>All Time</td></tr>`;
    }
}

window.app.resetAdminStats = async () => {
    if(!confirm("Reset stats?")) return;
    const q = query(collection(db, "complaints"), where("status", "==", "resolved"));
    const snap = await getDocs(q);
    snap.forEach(d => updateDoc(doc(db, "complaints", d.id), { status: 'archived' }));
    showToast("Stats reset");
    loadAdminStats();
};