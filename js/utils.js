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

const renderImg = function(id, src) {
  var img = document.getElementById(id);
  img.crossOrigin = 'anonymous';
  img.src = src;
}

const resizeImage = function(id, url, cb) {
  var img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = url;
  img.onload = function() {
    var elem = document.createElement('canvas');
    var scale = 4;
    elem.width = img.naturalWidth / scale;
    elem.height = img.naturalHeight / scale;
    var ctx = elem.getContext('2d');
    ctx.drawImage(img, 0, 0, elem.width, elem.height);
    if (cb != undefined && typeof cb == 'function') {
      cb(id, ctx.canvas.toDataURL('image/png', 100));
    }
    console.log('Success', id, url);
  }
  img.onerror = function(e) {
    if (cb != undefined && typeof cb == 'function') {
      cb(id, url);
    }
    console.log('Fail', id, url);
  }
}
