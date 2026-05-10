// ════════════════════════════════════════════════════════════
// SanjayMitu — Service Worker v3
// GitHub Pages repo ROOT এ রাখুন: firebase-messaging-sw.js
// ════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js');

var FB_CONFIG = {
  apiKey:'AIzaSyCVdsQ3qE4wy9ES0dbTOzlGU-hBgHv7p6k',
  authDomain:'sanjaymitu-cff8a.firebaseapp.com',
  databaseURL:'https://sanjaymitu-cff8a-default-rtdb.firebaseio.com',
  projectId:'sanjaymitu-cff8a',
  storageBucket:'sanjaymitu-cff8a.firebasestorage.app',
  messagingSenderId:'690573709457',
  appId:'1:690573709457:web:9a95cdada56b3b7a3b6fbd'
};

var app = firebase.initializeApp(FB_CONFIG);
var messaging = firebase.messaging(app);
var db = firebase.database(app);

// আমার ID — install event এ client থেকে পাবো
var MY_ID = null;

// ── Install & Activate ───────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// ── Client থেকে myId নেওয়া ──────────────────────────────
self.addEventListener('message', function(event) {
  var data = event.data;
  if (!data) return;

  if (data.type === 'SET_MY_ID' && data.myId) {
    MY_ID = data.myId;
    // Firebase DB এ নিজের pushQueue শোনা শুরু করো
    startListeningPushQueue(data.myId);
  }

  if (data.type === 'INCOMING_CALL_TAP') {
    // foreground app কে জানাও
    notifyClients(data);
  }
});

// ── Firebase DB pushQueue লিসেন করো ─────────────────────
var _dbRef = null;
var _shownKeys = {};

function startListeningPushQueue(myId) {
  if (_dbRef) { _dbRef.off(); }
  _dbRef = db.ref('sm3/pushQueue/' + myId);

  _dbRef.on('child_added', function(snap) {
    var d = snap.val();
    var key = snap.key;
    if (!d || !d.ts || _shownKeys[key]) return;

    // ৩০ সেকেন্ডের বেশি পুরনো হলে ignore
    if (Date.now() - d.ts > 30000) {
      snap.ref.remove();
      return;
    }

    _shownKeys[key] = true;

    // অ্যাপ foreground এ আছে কিনা চেক করো
    clients.matchAll({ type: 'window', includeUncontrolled: false }).then(function(cls) {
      var appOpen = cls.some(function(c) {
        return c.visibilityState === 'visible';
      });

      if (!appOpen) {
        // অ্যাপ বন্ধ/background — নোটিফিকেশন দেখাও
        showPushNotification(d, key, snap.ref);
      } else {
        // অ্যাপ খোলা — শুধু মুছে দাও (app নিজেই handle করছে)
        snap.ref.remove();
      }
    });
  });
}

function showPushNotification(d, key, ref) {
  var title, body, tag, requireInteraction, vibrate, actions;

  if (d.notifType === 'call') {
    title = '📞 ইনকামিং কল';
    body  = (d.callerId || 'কেউ') + ' ' + (d.callType === 'video' ? '📹 ভিডিও কল করছে' : '📞 অডিও কল করছে');
    tag   = 'sm-call-' + key;
    requireInteraction = true;
    vibrate = [500, 200, 500, 200, 500, 200, 500];
    actions = [
      { action: 'accept', title: '✅ ধরুন' },
      { action: 'reject', title: '❌ কাটুন' }
    ];
  } else {
    title = '💬 SanjayMitu — নতুন মেসেজ';
    if (d.msgType === 'image')      body = '🖼️ ছবি পাঠিয়েছে';
    else if (d.msgType === 'video') body = '🎥 ভিডিও পাঠিয়েছে';
    else if (d.msgType === 'voice') body = '🎙️ ভয়েস মেসেজ';
    else if (d.msgType === 'file')  body = '📁 ফাইল পাঠিয়েছে';
    else body = d.text ? d.text.slice(0, 100) : '💬 নতুন মেসেজ';
    tag   = 'sm-msg';
    requireInteraction = false;
    vibrate = [200, 100, 200];
    actions = [{ action: 'open', title: '💬 দেখুন' }];
  }

  var notifData = { key: key, payload: d, refPath: 'sm3/pushQueue/' + MY_ID + '/' + key };

  self.registration.showNotification(title, {
    body: body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: tag,
    requireInteraction: requireInteraction,
    vibrate: vibrate,
    actions: actions,
    data: notifData,
    timestamp: d.ts
  }).then(function() {
    // মেসেজ notification হলে ৬০ সেকেন্ড পরে auto-remove
    if (d.notifType !== 'call') {
      setTimeout(function() { ref.remove(); }, 60000);
    }
  });
}

// ── Notification Click ───────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var action  = event.action;
  var nData   = event.notification.data || {};
  var payload = nData.payload || {};

  // DB থেকে মুছে দাও
  if (nData.refPath) {
    db.ref(nData.refPath).remove();
  }

  // reject হলে শুধু close
  if (action === 'reject') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cls) {
      for (var i = 0; i < cls.length; i++) {
        var c = cls[i];
        if ('focus' in c) {
          // কল notification ট্যাপ হলে অ্যাপকে জানাও
          if (payload.notifType === 'call') {
            c.postMessage({ type: 'INCOMING_CALL_TAP', payload: payload });
          }
          return c.focus();
        }
      }
      // অ্যাপ বন্ধ — খুলে দাও
      var openUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
      if (payload.notifType === 'call') {
        openUrl += '?incomingCall=1&caller=' + encodeURIComponent(payload.callerId || '') + '&callType=' + encodeURIComponent(payload.callType || 'audio');
      }
      return clients.openWindow(openUrl);
    })
  );
});

// ── FCM Background Message (fallback) ───────────────────
messaging.onBackgroundMessage(function(payload) {
  // এই অ্যাপে FCM direct push নেই, DB pushQueue দিয়ে কাজ হয়
  // তবু fallback হিসেবে রাখা হলো
  var data = payload.data || payload.notification || {};
  return self.registration.showNotification(
    data.title || '💬 SanjayMitu',
    { body: data.body || 'নতুন মেসেজ', icon: './icon-192.png', tag: 'sm-fcm' }
  );
});
