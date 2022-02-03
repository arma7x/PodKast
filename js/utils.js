const convertTime = function(time) {
  if (isNaN(time)) {
    return "00:00";
  }
  var hours = "";
  var mins = Math.floor(time / 60);
  if (mins > 59) {
    var hr = Math.floor(mins / 60);
    mins = Math.floor(mins - Number(60 * hr));
    hours = hr;
  }
  if (hours != "") {
    if (hours < 10) {
      hours = "0" + String(hours) + ":";
    } else {
      hours = hours + ":";
    }
  }
  if (mins < 10) {
    mins = "0" + String(mins);
  }
  var secs = Math.floor(time % 60);
  if (secs < 10) {
    secs = "0" + String(secs);
  }
  return hours + mins + ":" + secs;
}

const readableFileSize = function(bytes, si = false, dp = 1) {
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + ' Byte';
  }
  const units = si  ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = Math.pow(10, dp);
  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
  return bytes.toFixed(dp) + ' ' + units[u];
}

const pushLocalNotification = function(title, body) {
  window.Notification.requestPermission()
  .then((result) => {
    var notification = new window.Notification(title, {
      body: body,
      requireInteraction: true
    });
    notification.onerror = function(err) {
      console.log(err);
    }
    notification.onclick = function(event) {
      if (window.navigator.mozApps) {
        var request = window.navigator.mozApps.getSelf();
        request.onsuccess = function() {
          if (request.result) {
            notification.close();
            request.result.launch();
          }
        };
      } else {
        window.open(document.location.origin, '_blank');
      }
    }
    notification.onshow = function() {
      // notification.close();
    }
  });
}

const resizeImage = function(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const elem = document.createElement('canvas');
      elem.width = 300;
      elem.height = 300;
      const ctx = elem.getContext('2d');
      ctx.drawImage(img, 0, 0, elem.width, elem.height);
      ctx.canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/jpeg', 0.5);
    }
    img.onerror = (err) => {
      reject(err);
    }
  });
}

const verifyDomainSSL = function(url) {
  const u = new URL(url);
  if (u.protocol === 'http:')
    return Promise.resolve(url);
  return new Promise((resolve, reject) => {
    const conn = navigator.mozTCPSocket.open(u.host, 443, {useSecureTransport:true});
    conn.onopen = () => {
      conn.onerror = () => {};
      conn.close();
      resolve(url);
    }
    conn.onerror = (err) => {
      reject(err);
    }
  });
}

const randomIntFromInterval = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}
